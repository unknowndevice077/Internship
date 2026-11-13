import { Client } from '@elastic/elasticsearch';
import config from '../config.js';
import Product from '../models/Product.js';
import Vendor from '../models/Vendor.js';
import { getRedis } from './redis.js';
import logger from './logger.js';

let es;

export function getElastic() {
  if (!config.elasticUrl) return null;
  if (!es) es = new Client({ node: config.elasticUrl });
  return es;
}

const SORTS = {
  price_asc: { field: 'price', dir: 'asc' },
  price_desc: { field: 'price', dir: 'desc' },
  rating: { field: 'ratingAvg', dir: 'desc' },
  newest: { field: 'createdAt', dir: 'desc' },
};

export async function ensureIndex() {
  const client = getElastic();
  if (!client) return;
  const exists = await client.indices.exists({ index: config.elasticIndex });
  if (exists) return;
  await client.indices.create({
    index: config.elasticIndex,
    mappings: {
      properties: {
        title: { type: 'text', fields: { keyword: { type: 'keyword' } } },
        description: { type: 'text' },
        brand: { type: 'text', fields: { keyword: { type: 'keyword' } } },
        tags: { type: 'keyword' },
        category: { type: 'keyword' },
        vendor: { type: 'keyword' },
        vendorName: { type: 'keyword' },
        price: { type: 'float' },
        stock: { type: 'integer' },
        ratingAvg: { type: 'float' },
        ratingCount: { type: 'integer' },
        image: { type: 'keyword', index: false },
        isActive: { type: 'boolean' },
        createdAt: { type: 'date' },
      },
    },
  });
}

function toDoc(product, vendorName) {
  return {
    title: product.title,
    description: product.description,
    brand: product.brand,
    tags: product.tags,
    category: product.category,
    vendor: product.vendor.toString(),
    vendorName,
    price: product.price,
    stock: product.stock,
    ratingAvg: product.ratingAvg,
    ratingCount: product.ratingCount,
    image: product.images?.[0],
    isActive: product.isActive,
    createdAt: product.createdAt,
  };
}

// best-effort, a search outage shouldn't fail the product write
export async function indexProduct(product) {
  const client = getElastic();
  if (!client) return;
  try {
    const vendor = await Vendor.findById(product.vendor).select('storeName status');
    const visible = product.isActive && vendor?.status === 'approved';
    if (!visible) {
      await removeProduct(product._id);
      return;
    }
    await client.index({
      index: config.elasticIndex,
      id: product._id.toString(),
      document: toDoc(product, vendor.storeName),
      // so a seller who saves and then searches sees their change
      refresh: 'wait_for',
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'search index failed');
  }
}

export async function removeProduct(id) {
  const client = getElastic();
  if (!client) return;
  try {
    await client.delete({ index: config.elasticIndex, id: id.toString(), refresh: 'wait_for' });
  } catch (err) {
    if (err.meta?.statusCode !== 404) logger.warn({ err: err.message }, 'search delete failed');
  }
}

// after a store is approved/suspended its product pages and search docs both change
export async function reindexVendorProducts(vendorId) {
  const products = await Product.find({ vendor: vendorId });
  if (!products.length) return;
  await getRedis().del(...products.map((p) => `product:${p._id}`));
  await Promise.all(products.map(indexProduct));
}

export async function reindexAll() {
  const client = getElastic();
  if (!client) return 0;
  await client.indices.delete({ index: config.elasticIndex }, { ignore: [404] });
  await ensureIndex();

  const vendors = await Vendor.find({ status: 'approved' }).select('storeName');
  const names = new Map(vendors.map((v) => [v._id.toString(), v.storeName]));
  const products = await Product.find({ isActive: true, vendor: { $in: [...names.keys()] } });
  if (!products.length) return 0;

  const operations = products.flatMap((p) => [
    { index: { _index: config.elasticIndex, _id: p._id.toString() } },
    toDoc(p, names.get(p.vendor.toString())),
  ]);
  await client.bulk({ refresh: true, operations });
  return products.length;
}

export async function searchProducts(params) {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(60, Math.max(1, Number(params.limit) || 20));
  const client = getElastic();
  return client ? searchElastic(client, params, page, limit) : searchMongo(params, page, limit);
}

async function searchElastic(client, p, page, limit) {
  const filter = [];
  if (p.category) filter.push({ term: { category: p.category } });
  if (p.vendor) filter.push({ term: { vendor: p.vendor } });
  if (p.brand) filter.push({ term: { 'brand.keyword': p.brand } });
  if (p.inStock === 'true') filter.push({ range: { stock: { gt: 0 } } });
  if (p.minRating) filter.push({ range: { ratingAvg: { gte: Number(p.minRating) } } });
  if (p.minPrice || p.maxPrice) {
    filter.push({
      range: {
        price: {
          ...(p.minPrice && { gte: Number(p.minPrice) }),
          ...(p.maxPrice && { lte: Number(p.maxPrice) }),
        },
      },
    });
  }

  const must = p.q
    ? [
        {
          multi_match: {
            query: p.q,
            fields: ['title^3', 'brand^2', 'tags^2', 'description'],
            fuzziness: 'AUTO',
          },
        },
      ]
    : [{ match_all: {} }];

  const sortCfg = SORTS[p.sort];
  const res = await client.search({
    index: config.elasticIndex,
    from: (page - 1) * limit,
    size: limit,
    query: { bool: { must, filter } },
    sort: sortCfg ? [{ [sortCfg.field]: sortCfg.dir }] : p.q ? ['_score'] : [{ createdAt: 'desc' }],
    aggs: {
      categories: { terms: { field: 'category', size: 30 } },
      brands: { terms: { field: 'brand.keyword', size: 30 } },
      price: { stats: { field: 'price' } },
    },
  });

  return {
    engine: 'elasticsearch',
    page,
    limit,
    total: res.hits.total.value,
    items: res.hits.hits.map((h) => ({ _id: h._id, ...h._source })),
    facets: {
      categories: res.aggregations.categories.buckets.map((b) => ({ value: b.key, count: b.doc_count })),
      brands: res.aggregations.brands.buckets.map((b) => ({ value: b.key, count: b.doc_count })),
      price: { min: res.aggregations.price.min, max: res.aggregations.price.max },
    },
  };
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function partialTerms(q) {
  return String(q)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .map((t) => new RegExp(escapeRegex(t), 'i'));
}

async function searchMongo(p, page, limit) {
  const approved = await Vendor.find({ status: 'approved' }).select('_id storeName');
  const names = new Map(approved.map((v) => [v._id.toString(), v.storeName]));

  // aggregate() doesn't cast like find(), so keep ids as real ObjectIds
  const query = { isActive: true, vendor: { $in: approved.map((v) => v._id) } };
  if (p.q) query.$text = { $search: p.q };
  if (p.category) query.category = p.category;
  if (p.brand) query.brand = p.brand;
  if (p.vendor) {
    const match = approved.find((v) => v._id.toString() === p.vendor);
    query.vendor = match ? match._id : null;
  }
  if (p.inStock === 'true') query.stock = { $gt: 0 };
  if (p.minRating) query.ratingAvg = { $gte: Number(p.minRating) };
  if (p.minPrice || p.maxPrice) {
    query.price = {};
    if (p.minPrice) query.price.$gte = Number(p.minPrice);
    if (p.maxPrice) query.price.$lte = Number(p.maxPrice);
  }

  // $text only matches whole words, so fall back to substring matching ("phone" -> "iPhone")
  let textScore = Boolean(p.q);
  if (p.q && !(await Product.exists(query))) {
    delete query.$text;
    textScore = false;
    query.$and = partialTerms(p.q).map((re) => ({
      $or: [{ title: re }, { brand: re }, { category: re }, { tags: re }],
    }));
  }

  const sortCfg = SORTS[p.sort];
  let sort = { createdAt: -1 };
  if (sortCfg) sort = { [sortCfg.field]: sortCfg.dir === 'asc' ? 1 : -1 };
  else if (textScore) sort = { score: { $meta: 'textScore' } };

  const [docs, total, categories, brands] = await Promise.all([
    Product.find(query, textScore ? { score: { $meta: 'textScore' } } : {})
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Product.countDocuments(query),
    Product.aggregate([{ $match: query }, { $group: { _id: '$category', count: { $sum: 1 } } }]),
    Product.aggregate([{ $match: query }, { $group: { _id: '$brand', count: { $sum: 1 } } }]),
  ]);

  return {
    engine: 'mongo',
    page,
    limit,
    total,
    items: docs.map((d) => ({ ...toDoc(d, names.get(d.vendor.toString())), _id: d._id.toString() })),
    facets: {
      categories: categories.map((c) => ({ value: c._id, count: c.count })),
      brands: brands.filter((b) => b._id).map((b) => ({ value: b._id, count: b.count })),
    },
  };
}

// Title prefix matches for the search box dropdown. Plain Mongo so it works with or without ES.
export async function suggestProducts(q, limit = 6) {
  const term = String(q || '').trim();
  if (term.length < 2) return [];
  const escaped = escapeRegex(term);
  const approved = await Vendor.find({ status: 'approved' }).distinct('_id');
  return Product.find({
    isActive: true,
    vendor: { $in: approved },
    title: { $regex: `(^|\\s)${escaped}`, $options: 'i' },
  })
    .sort({ ratingCount: -1 })
    .limit(limit)
    .select('title price images category')
    .lean()
    .then((docs) =>
      docs.map((d) => ({
        _id: d._id,
        title: d.title,
        price: d.price,
        image: d.images?.[0],
        category: d.category,
      })),
    );
}
