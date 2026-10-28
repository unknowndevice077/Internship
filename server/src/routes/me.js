import { Router } from 'express';
import User from '../models/User.js';
import Product from '../models/Product.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { getRedis } from '../lib/redis.js';

const router = Router();
router.use(requireAuth);

const RECENT_LIMIT = 12;
const recentKey = (userId) => `recent:${userId}`;
const isId = (id) => /^[a-f0-9]{24}$/i.test(id);

// only show things that can still be bought, in the order given
async function visibleProducts(ids) {
  const products = await Product.find({ _id: { $in: ids }, isActive: true })
    .populate('vendor', 'storeName status')
    .select('title price images ratingAvg ratingCount stock vendor')
    .lean();
  const byId = new Map(
    products.filter((p) => p.vendor?.status === 'approved').map((p) => [p._id.toString(), p]),
  );
  return ids
    .map((id) => byId.get(id.toString()))
    .filter(Boolean)
    .map((p) => ({
      _id: p._id,
      title: p.title,
      price: p.price,
      image: p.images?.[0],
      ratingAvg: p.ratingAvg,
      ratingCount: p.ratingCount,
      stock: p.stock,
      vendorName: p.vendor.storeName,
    }));
}

router.get(
  '/wishlist',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select('wishlist');
    res.json({ items: await visibleProducts([...(user?.wishlist || [])].reverse()) });
  }),
);

router.put(
  '/wishlist/:productId',
  asyncHandler(async (req, res) => {
    const { productId } = req.params;
    if (!isId(productId) || !(await Product.exists({ _id: productId }))) {
      throw new HttpError(404, 'Product not found');
    }
    await User.updateOne({ _id: req.user.id }, { $addToSet: { wishlist: productId } });
    res.status(204).end();
  }),
);

router.delete(
  '/wishlist/:productId',
  asyncHandler(async (req, res) => {
    if (!isId(req.params.productId)) throw new HttpError(400, 'Invalid id');
    await User.updateOne({ _id: req.user.id }, { $pull: { wishlist: req.params.productId } });
    res.status(204).end();
  }),
);

// recently viewed, newest first, kept as a capped Redis list
router.get(
  '/recent',
  asyncHandler(async (req, res) => {
    const ids = await getRedis().lrange(recentKey(req.user.id), 0, RECENT_LIMIT - 1);
    res.json({ items: await visibleProducts(ids) });
  }),
);

router.post(
  '/recent/:productId',
  asyncHandler(async (req, res) => {
    const { productId } = req.params;
    if (!isId(productId)) throw new HttpError(400, 'Invalid id');
    const key = recentKey(req.user.id);
    await getRedis()
      .multi()
      .lrem(key, 0, productId)
      .lpush(key, productId)
      .ltrim(key, 0, RECENT_LIMIT - 1)
      .expire(key, 60 * 60 * 24 * 90)
      .exec();
    res.status(204).end();
  }),
);

export default router;
