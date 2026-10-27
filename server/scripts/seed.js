// Seeds demo data. Products and reviews come from DummyJSON (https://dummyjson.com).
// Usage: npm run seed            (wipes the database first)
import mongoose from 'mongoose';
import config from '../src/config.js';
import User from '../src/models/User.js';
import Vendor from '../src/models/Vendor.js';
import Product from '../src/models/Product.js';
import Review from '../src/models/Review.js';
import Order from '../src/models/Order.js';
import Coupon from '../src/models/Coupon.js';
import { reindexAll } from '../src/lib/search.js';
import { closeRedis, getRedis } from '../src/lib/redis.js';
import { round2 } from '../src/lib/payments.js';

const PASSWORD = 'demo-pass-123';

const STORES = [
  { storeName: 'Glow Beauty Co', categories: ['beauty', 'fragrances', 'skin-care'] },
  {
    storeName: 'Urban Threads',
    categories: [
      'mens-shirts',
      'mens-shoes',
      'womens-dresses',
      'womens-shoes',
      'tops',
      'womens-bags',
      'sunglasses',
    ],
  },
  {
    storeName: 'Gadget Hub',
    categories: ['smartphones', 'laptops', 'tablets', 'mobile-accessories', 'mens-watches', 'womens-watches'],
  },
  {
    storeName: 'Home & Pantry',
    categories: ['furniture', 'home-decoration', 'kitchen-accessories', 'groceries'],
  },
  {
    storeName: 'Ride & Sport',
    categories: ['sports-accessories', 'motorcycle', 'vehicle', 'womens-jewellery'],
  },
];

async function fetchProducts() {
  try {
    const res = await fetch('https://dummyjson.com/products?limit=0');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.products;
  } catch (err) {
    console.warn(`Could not reach DummyJSON (${err.message}), using a small offline set`);
    return OFFLINE_PRODUCTS;
  }
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

async function main() {
  await mongoose.connect(config.mongoUri);
  await mongoose.connection.dropDatabase();
  await getRedis().flushdb();
  await Promise.all([User, Vendor, Product, Review, Order, Coupon].map((m) => m.syncIndexes()));

  await User.create({ name: 'Admin', email: 'admin@vendora.test', password: PASSWORD, role: 'admin' });

  const customers = [];
  for (const [i, name] of ['Maya Cruz', 'Leo Santos', 'Ava Reyes', 'Noah Lim', 'Zoe Tan'].entries()) {
    customers.push(
      await User.create({
        name,
        email: i === 0 ? 'customer@vendora.test' : `customer${i + 1}@vendora.test`,
        password: PASSWORD,
        address: { line1: `${12 + i} Market St`, city: 'Manila', postalCode: '1000', country: 'PH' },
      }),
    );
  }

  const vendors = [];
  for (const [i, store] of STORES.entries()) {
    const owner = await User.create({
      name: `${store.storeName} Owner`,
      email: i === 0 ? 'vendor@vendora.test' : `vendor${i + 1}@vendora.test`,
      password: PASSWORD,
      role: 'vendor',
    });
    vendors.push(
      await Vendor.create({
        owner: owner._id,
        storeName: store.storeName,
        slug: store.storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description: `Official ${store.storeName} store on Vendora.`,
        status: 'approved',
        stripeAccountId: `mock_acct_${i}`,
        payoutsEnabled: true,
      }),
    );
  }
  // one pending store so the admin approval queue isn't empty
  const pendingOwner = await User.create({
    name: 'New Seller',
    email: 'newseller@vendora.test',
    password: PASSWORD,
    role: 'vendor',
  });
  await Vendor.create({ owner: pendingOwner._id, storeName: 'Fresh Finds', slug: 'fresh-finds' });

  const raw = await fetchProducts();
  const vendorFor = (category) => {
    const idx = STORES.findIndex((s) => s.categories.includes(category));
    return vendors[idx === -1 ? 0 : idx];
  };

  const products = [];
  for (const p of raw) {
    const product = await Product.create({
      vendor: vendorFor(p.category)._id,
      title: p.title,
      description: p.description,
      category: p.category,
      brand: p.brand,
      price: p.price,
      stock: p.stock ?? 25,
      images: p.images?.length ? p.images : [p.thumbnail],
      tags: p.tags || [],
      createdAt: daysAgo(Math.floor(Math.random() * 60)),
    });
    products.push({ product, reviews: p.reviews || [] });
  }

  for (const { product, reviews } of products) {
    const used = new Set();
    for (const r of reviews) {
      const user = customers.find((c) => !used.has(c.id));
      if (!user) break;
      used.add(user.id);
      await Review.create({ product: product._id, user: user._id, rating: r.rating, body: r.comment });
    }
    if (used.size) {
      const stats = reviews.slice(0, used.size);
      product.ratingAvg = Math.round((stats.reduce((s, r) => s + r.rating, 0) / stats.length) * 10) / 10;
      product.ratingCount = stats.length;
      await product.save();
    }
  }

  await Coupon.create([
    { code: 'WELCOME10', type: 'percent', value: 10, minOrder: 20 },
    { code: 'FLAT5', type: 'fixed', value: 5, minOrder: 30, maxUses: 100 },
    { code: 'GLOW15', type: 'percent', value: 15, vendor: vendors[0]._id },
  ]);

  // some past orders so the analytics charts have something to show
  const statuses = ['delivered', 'delivered', 'delivered', 'shipped', 'packed', 'placed'];
  let n = 0;
  for (let day = 45; day >= 0; day--) {
    const ordersToday = Math.floor(Math.random() * 4);
    for (let k = 0; k < ordersToday; k++) {
      const { product } = pick(products);
      const qty = 1 + Math.floor(Math.random() * 2);
      const vendor = vendors.find((v) => v._id.equals(product.vendor));
      const total = round2(product.price * qty);
      const commission = round2(total * config.commissionRate);
      const status = day > 7 ? 'delivered' : pick(statuses);
      const at = daysAgo(day);
      n += 1;
      await Order.create({
        paymentGroup: `grp_seed_${n}`,
        orderNumber: `VD-SEED-${String(n).padStart(4, '0')}`,
        customer: pick(customers)._id,
        vendor: vendor._id,
        items: [
          {
            product: product._id,
            title: product.title,
            image: product.images[0],
            price: product.price,
            quantity: qty,
          },
        ],
        subtotal: total,
        total,
        commissionRate: config.commissionRate,
        commission,
        vendorPayout: round2(total - commission),
        shippingAddress: customers[0].address,
        status,
        statusHistory: [{ status: 'placed', at }, ...(status !== 'placed' ? [{ status, at }] : [])],
        payment: {
          provider: 'mock',
          intentId: `mock_pi_seed_${n}`,
          transferId: `mock_tr_seed_${n}`,
          paidAt: at,
        },
        createdAt: at,
        updatedAt: at,
      });
    }
  }

  const indexed = await reindexAll();
  console.log(
    `Seeded ${products.length} products, ${vendors.length + 1} stores, ${n} orders` +
      (indexed ? `, indexed ${indexed} in Elasticsearch` : ''),
  );
  console.log(
    `Logins (password "${PASSWORD}"): admin@vendora.test, vendor@vendora.test, customer@vendora.test`,
  );
}

const OFFLINE_PRODUCTS = [
  {
    title: 'Essence Mascara Lash Princess',
    category: 'beauty',
    brand: 'Essence',
    price: 9.99,
    stock: 40,
    thumbnail: 'https://cdn.dummyjson.com/product-images/beauty/essence-mascara-lash-princess/thumbnail.webp',
    description: 'Popular mascara known for volumizing and lengthening effects.',
  },
  {
    title: 'iPhone 13 Pro',
    category: 'smartphones',
    brand: 'Apple',
    price: 1099.99,
    stock: 12,
    thumbnail: 'https://cdn.dummyjson.com/product-images/smartphones/iphone-13-pro/thumbnail.webp',
    description: 'Pro camera system and Super Retina XDR display with ProMotion.',
  },
  {
    title: 'Wooden Bathroom Sink With Mirror',
    category: 'furniture',
    brand: 'Bath Trends',
    price: 799.99,
    stock: 7,
    thumbnail:
      'https://cdn.dummyjson.com/product-images/furniture/wooden-bathroom-sink-with-mirror/thumbnail.webp',
    description: 'Wooden bathroom sink with an attached mirror.',
  },
  {
    title: 'Men Check Shirt',
    category: 'mens-shirts',
    brand: 'Fashion Trends',
    price: 27.99,
    stock: 50,
    thumbnail: 'https://cdn.dummyjson.com/product-images/mens-shirts/men-check-shirt/thumbnail.webp',
    description: 'Classic check shirt for a casual look.',
  },
  {
    title: 'Football',
    category: 'sports-accessories',
    price: 14.99,
    stock: 30,
    thumbnail: 'https://cdn.dummyjson.com/product-images/sports-accessories/football/thumbnail.webp',
    description: 'Standard size football for matches and practice.',
  },
];

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    await closeRedis();
  });
