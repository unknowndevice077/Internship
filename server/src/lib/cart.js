import Product from '../models/Product.js';
import { getRedis } from './redis.js';

// Carts live in Redis as a hash: field = productId, value = quantity.
const key = (userId) => `cart:${userId}`;
const CART_TTL = 60 * 60 * 24 * 30;

export async function getRawCart(userId) {
  const raw = await getRedis().hgetall(key(userId));
  return Object.entries(raw).map(([productId, qty]) => ({ productId, quantity: Number(qty) }));
}

export async function setItem(userId, productId, quantity) {
  const redis = getRedis();
  if (quantity <= 0) await redis.hdel(key(userId), productId);
  else await redis.hset(key(userId), productId, quantity);
  await redis.expire(key(userId), CART_TTL);
}

export async function clearCart(userId) {
  await getRedis().del(key(userId));
}

// Joins the cart with current product data. Prices always come from the DB, never the client.
export async function getCart(userId) {
  const raw = await getRawCart(userId);
  if (!raw.length) return { items: [], subtotal: 0, count: 0 };

  const products = await Product.find({ _id: { $in: raw.map((r) => r.productId) } })
    .populate('vendor', 'storeName status')
    .lean();
  const byId = new Map(products.map((p) => [p._id.toString(), p]));

  const items = [];
  for (const { productId, quantity } of raw) {
    const p = byId.get(productId);
    const available = p && p.isActive && p.vendor?.status === 'approved';
    items.push({
      productId,
      quantity,
      title: p?.title ?? 'Unavailable product',
      image: p?.images?.[0],
      price: p?.price ?? 0,
      stock: p?.stock ?? 0,
      vendorId: p?.vendor?._id?.toString(),
      vendorName: p?.vendor?.storeName,
      available: Boolean(available && p.stock >= quantity),
    });
  }

  const valid = items.filter((i) => i.available);
  const subtotal = valid.reduce((sum, i) => sum + i.price * i.quantity, 0);
  return {
    items,
    subtotal: Math.round(subtotal * 100) / 100,
    count: items.reduce((n, i) => n + i.quantity, 0),
  };
}
