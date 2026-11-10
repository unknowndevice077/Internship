import Coupon from '../models/Coupon.js';
import { HttpError } from '../middleware/error.js';
import { round2 } from './payments.js';

// groups: Map of vendorId -> subtotal
export async function applyCoupon(code, groups) {
  const discounts = new Map([...groups.keys()].map((id) => [id, 0]));
  if (!code) return { coupon: null, discounts };

  const coupon = await Coupon.findOne({ code: code.trim().toUpperCase(), isActive: true });
  if (!coupon) throw new HttpError(400, 'Coupon not found');
  if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new HttpError(400, 'Coupon has expired');
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) throw new HttpError(400, 'Coupon is used up');

  // vendor coupons only touch that vendor's items
  const eligible = coupon.vendor
    ? [...groups].filter(([id]) => id === coupon.vendor.toString())
    : [...groups];
  const base = eligible.reduce((sum, [, subtotal]) => sum + subtotal, 0);
  if (!base) throw new HttpError(400, 'Coupon does not apply to anything in your cart');
  if (base < coupon.minOrder) throw new HttpError(400, `Coupon needs a minimum order of $${coupon.minOrder}`);

  const total = Math.min(base, coupon.type === 'percent' ? (base * coupon.value) / 100 : coupon.value);

  // split the discount proportionally, putting any rounding leftover on the last vendor
  let left = round2(total);
  eligible.forEach(([id, subtotal], i) => {
    const share = i === eligible.length - 1 ? left : round2((total * subtotal) / base);
    discounts.set(id, share);
    left = round2(left - share);
  });

  return { coupon, discounts };
}
