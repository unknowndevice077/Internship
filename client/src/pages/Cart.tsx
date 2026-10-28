import { Link } from 'react-router-dom';
import { api, imageUrl, money } from '../api/client';
import { Empty, useFetch } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import type { CartItem, Quote } from '../types';

function StockNote({ item }: { item: CartItem }) {
  if (item.stock === 0) return <div className="error small">Sold out, remove it to check out</div>;
  if (!item.available) return <div className="error small">Only {item.stock} left, lower the quantity</div>;
  if (item.stock <= 5) return <div className="warn small">Only {item.stock} left</div>;
  return null;
}

export default function Cart() {
  const { user } = useAuth();
  const { cart, update, remove } = useCart();
  // re-quote whenever the cart changes so shipping stays right
  const quote = useFetch(
    () => (user?.role === 'customer' && cart.count ? api<Quote>('/cart/quote') : Promise.resolve(null)),
    [cart],
  );

  if (!user) {
    return (
      <Empty>
        <Link to="/login" state={{ from: '/cart' }}>
          Sign in
        </Link>{' '}
        to see your cart.
      </Empty>
    );
  }
  if (!cart.items.length) {
    return (
      <Empty>
        Your cart is empty. <Link to="/">Keep shopping</Link>
      </Empty>
    );
  }

  const blocked = cart.items.some((i) => !i.available);
  const q = quote.data;

  return (
    <div className="cart-page">
      <section className="card">
        <h1>Shopping cart</h1>
        {cart.items.map((item) => (
          <div key={item.productId} className="cart-row">
            <img src={imageUrl(item.image)} alt="" />
            <div className="grow">
              <Link to={`/products/${item.productId}`}>{item.title}</Link>
              <div className="muted small">Sold by {item.vendorName}</div>
              <StockNote item={item} />
              <div className="cart-actions">
                <select
                  value={item.quantity}
                  aria-label={`Quantity of ${item.title}`}
                  onChange={(e) => update(item.productId, Number(e.target.value))}
                >
                  {Array.from(
                    { length: Math.max(item.quantity, Math.min(10, item.stock)) },
                    (_, i) => i + 1,
                  ).map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
                <button className="link" onClick={() => remove(item.productId)}>
                  Remove
                </button>
              </div>
            </div>
            <strong>{money(item.price * item.quantity)}</strong>
          </div>
        ))}
      </section>
      <aside className="card summary">
        <div className="row">
          <span>
            Subtotal ({cart.count} {cart.count === 1 ? 'item' : 'items'})
          </span>
          <strong>{money(cart.subtotal)}</strong>
        </div>
        {q && (
          <div className="row">
            <span>Shipping</span>
            <span>{q.shipping ? money(q.shipping) : 'Free'}</span>
          </div>
        )}
        {q?.stores
          .filter((s) => s.shippingFee && s.freeShippingOver != null)
          .map((s) => (
            <p key={s.vendorId} className="muted small">
              Add {money(s.freeShippingOver! - s.subtotal)} more from {s.vendorName} for free shipping
            </p>
          ))}
        <p className="muted small">Coupons and shipping address are added at checkout.</p>
        {blocked ? (
          <button disabled>Fix the items above first</button>
        ) : (
          <Link to="/checkout" className="button primary">
            Proceed to checkout
          </Link>
        )}
      </aside>
    </div>
  );
}
