import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import Review from '../models/Review.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { getRedis } from '../lib/redis.js';
import { indexProduct } from '../lib/search.js';

const router = Router({ mergeParams: true });

async function refreshRating(productId) {
  const [stats] = await Review.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(productId) } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const product = await Product.findByIdAndUpdate(
    productId,
    { ratingAvg: stats ? Math.round(stats.avg * 10) / 10 : 0, ratingCount: stats?.count || 0 },
    { returnDocument: 'after' },
  );
  await getRedis().del(`product:${productId}`);
  if (product) await indexProduct(product);
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await Review.find({ product: req.params.productId })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('user', 'name');
    res.json({ items });
  }),
);

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().max(3000).optional(),
});

// posting again updates the existing review
router.post(
  '/',
  requireAuth,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const data = reviewSchema.parse(req.body);
    const { productId } = req.params;
    if (!(await Product.exists({ _id: productId }))) throw new HttpError(404, 'Product not found');

    const bought = await Order.exists({
      customer: req.user.id,
      'items.product': productId,
      status: 'delivered',
    });
    const review = await Review.findOneAndUpdate(
      { product: productId, user: req.user.id },
      { ...data, verifiedPurchase: Boolean(bought) },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
    );
    await refreshRating(productId);
    res.status(201).json({ review });
  }),
);

router.delete(
  '/:reviewId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const review = await Review.findById(req.params.reviewId);
    if (!review) throw new HttpError(404, 'Review not found');
    if (req.user.role !== 'admin' && review.user.toString() !== req.user.id) {
      throw new HttpError(403, 'Not your review');
    }
    await review.deleteOne();
    await refreshRating(review.product.toString());
    res.status(204).end();
  }),
);

export default router;
