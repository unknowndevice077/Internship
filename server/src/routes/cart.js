import { Router } from 'express';
import { z } from 'zod';
import Product from '../models/Product.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { clearCart, getCart, getRawCart, setItem } from '../lib/cart.js';

const router = Router();
router.use(requireAuth, requireRole('customer'));

router.get(
  '/',
  asyncHandler(async (req, res) => res.json(await getCart(req.user.id))),
);

const itemSchema = z.object({
  productId: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid product id'),
  quantity: z.coerce.number().int().min(0).max(99),
});

async function checkStock(productId, quantity) {
  if (quantity === 0) return;
  const product = await Product.findById(productId).select('stock isActive');
  if (!product || !product.isActive) throw new HttpError(404, 'Product not found');
  if (product.stock < quantity) throw new HttpError(400, `Only ${product.stock} left in stock`);
}

// adds to whatever is already in the cart
router.post(
  '/items',
  asyncHandler(async (req, res) => {
    const { productId, quantity } = itemSchema.parse(req.body);
    const current = (await getRawCart(req.user.id)).find((i) => i.productId === productId);
    const next = (current?.quantity || 0) + Math.max(1, quantity);
    await checkStock(productId, next);
    await setItem(req.user.id, productId, next);
    res.status(201).json(await getCart(req.user.id));
  }),
);

// sets an exact quantity (0 removes)
router.put(
  '/items/:productId',
  asyncHandler(async (req, res) => {
    const { productId, quantity } = itemSchema.parse({ ...req.body, productId: req.params.productId });
    await checkStock(productId, quantity);
    await setItem(req.user.id, productId, quantity);
    res.json(await getCart(req.user.id));
  }),
);

router.delete(
  '/items/:productId',
  asyncHandler(async (req, res) => {
    await setItem(req.user.id, req.params.productId, 0);
    res.json(await getCart(req.user.id));
  }),
);

router.delete(
  '/',
  asyncHandler(async (req, res) => {
    await clearCart(req.user.id);
    res.status(204).end();
  }),
);

export default router;
