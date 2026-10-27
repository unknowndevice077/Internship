import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import Product from '../models/Product.js';
import { requireAuth, requireVendor } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { cached, getRedis } from '../lib/redis.js';
import { indexProduct, removeProduct, searchProducts } from '../lib/search.js';
import { ALLOWED_TYPES, uploadImage } from '../lib/storage.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_TYPES.includes(file.mimetype)),
});

const productSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().max(5000).default(''),
  category: z.string().trim().min(2).max(60),
  brand: z.string().trim().max(60).optional(),
  price: z.coerce.number().min(0.5).max(100000),
  stock: z.coerce.number().int().min(0).default(0),
  images: z.array(z.string()).max(6).default([]),
  tags: z.array(z.string().trim()).max(20).default([]),
  isActive: z.boolean().default(true),
});

const cacheKey = (id) => `product:${id}`;
const dropCache = (id) => getRedis().del(cacheKey(id));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await searchProducts(req.query));
  }),
);

// vendor's own catalogue (includes inactive products)
router.get(
  '/mine',
  requireAuth,
  requireVendor(),
  asyncHandler(async (req, res) => {
    const products = await Product.find({ vendor: req.vendor._id }).sort({ createdAt: -1 });
    res.json({ items: products });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await cached(cacheKey(req.params.id), 300, async () => {
      const p = await Product.findById(req.params.id).populate('vendor', 'storeName slug status').lean();
      return p && p.isActive && p.vendor?.status === 'approved' ? p : null;
    });
    if (!product) throw new HttpError(404, 'Product not found');
    res.json({ product });
  }),
);

router.post(
  '/images',
  requireAuth,
  requireVendor(),
  upload.array('images', 6),
  asyncHandler(async (req, res) => {
    if (!req.files?.length) throw new HttpError(400, 'Send jpg, png or webp files in the "images" field');
    const urls = await Promise.all(req.files.map((f) => uploadImage(f, `vendors/${req.vendor._id}`)));
    res.status(201).json({ urls });
  }),
);

router.post(
  '/',
  requireAuth,
  requireVendor({ approved: true }),
  asyncHandler(async (req, res) => {
    const data = productSchema.parse(req.body);
    const product = await Product.create({ ...data, vendor: req.vendor._id });
    await indexProduct(product);
    res.status(201).json({ product });
  }),
);

async function ownProduct(req) {
  const product = await Product.findById(req.params.id);
  if (!product) throw new HttpError(404, 'Product not found');
  if (!product.vendor.equals(req.vendor._id)) throw new HttpError(403, 'Not your product');
  return product;
}

router.patch(
  '/:id',
  requireAuth,
  requireVendor(),
  asyncHandler(async (req, res) => {
    const product = await ownProduct(req);
    const data = productSchema.partial().parse(req.body);
    Object.assign(product, data);
    await product.save();
    await Promise.all([dropCache(product._id), indexProduct(product)]);
    res.json({ product });
  }),
);

router.delete(
  '/:id',
  requireAuth,
  requireVendor(),
  asyncHandler(async (req, res) => {
    const product = await ownProduct(req);
    // soft delete so old orders and reviews still resolve
    product.isActive = false;
    await product.save();
    await Promise.all([dropCache(product._id), removeProduct(product._id)]);
    res.status(204).end();
  }),
);

export async function reindexVendorProducts(vendorId) {
  const products = await Product.find({ vendor: vendorId });
  for (const p of products) {
    await Promise.all([dropCache(p._id), indexProduct(p)]);
  }
}

export default router;
