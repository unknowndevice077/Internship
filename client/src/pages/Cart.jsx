import { Link } from 'react-router-dom';
import { imageUrl, money } from '../api/client';
import { Empty } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

export default function Cart() {
  const { user } = useAuth();
  const { cart, update, remove } = useCart();

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
              {!item.available && <div className="error small">Not enough stock ({item.stock} left)</div>}
              <div className="cart-actions">
                <select value={item.quantity} onChange={(e) => update(item.productId, Number(e.target.value))}>
                  {Array.from({ length: Math.max(item.quantity, Math.min(10, item.stock)) }, (_, i) => i + 1).map(
                    (n) => (
                      <option key={n}>{n}</option>
                    ),
                  )}
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
          <span>Subtotal ({cart.count} items)</span>
          <strong>{money(cart.subtotal)}</strong>
        </div>
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
