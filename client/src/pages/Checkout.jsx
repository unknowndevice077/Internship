import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { api, money } from '../api/client';
import { Empty, ErrorText } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripeKey ? loadStripe(stripeKey) : null;

export default function Checkout() {
  const { user } = useAuth();
  const { cart, reload } = useCart();
  const navigate = useNavigate();

  const [address, setAddress] = useState({
    line1: user.address?.line1 || '',
    city: user.address?.city || '',
    state: user.address?.state || '',
    postalCode: user.address?.postalCode || '',
    country: user.address?.country || 'PH',
  });
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState(null);
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const total = preview ? preview.total : cart.subtotal;

  const checkCoupon = async () => {
    setError(null);
    try {
      setPreview(await api('/coupons/validate', { method: 'POST', body: { code } }));
    } catch (err) {
      setPreview(null);
      setError(err);
    }
  };

  const finish = async (paymentGroup) => {
    const { orders } = await api(`/orders/confirm/${paymentGroup}`, { method: 'POST' });
    await reload();
    navigate(`/orders?placed=${orders.length}`);
  };

  const placeOrder = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api('/orders/checkout', {
        method: 'POST',
        body: { shippingAddress: address, couponCode: preview?.code || '' },
      });
      // save the address for next time, no need to wait on it
      api('/auth/me', { method: 'PATCH', body: { address } }).catch(() => {});
      if (result.provider === 'mock') await finish(result.paymentGroup);
      else setSession(result);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const elementsOptions = useMemo(
    () => session?.clientSecret && { clientSecret: session.clientSecret, appearance: { theme: 'stripe' } },
    [session],
  );

  if (!cart.items.length && !session) {
    return (
      <Empty>
        Nothing to check out. <Link to="/">Browse products</Link>
      </Empty>
    );
  }

  return (
    <div className="cart-page">
      <section className="card">
        <h1>Checkout</h1>
        {!session ? (
          <form id="checkout" onSubmit={placeOrder} className="stack">
            <h3>Shipping address</h3>
            <input
              placeholder="Street address"
              value={address.line1}
              onChange={(e) => setAddress({ ...address, line1: e.target.value })}
              required
            />
            <div className="two">
              <input
                placeholder="City"
                value={address.city}
                onChange={(e) => setAddress({ ...address, city: e.target.value })}
                required
              />
              <input
                placeholder="State / province"
                value={address.state}
                onChange={(e) => setAddress({ ...address, state: e.target.value })}
              />
            </div>
            <div className="two">
              <input
                placeholder="Postal code"
                value={address.postalCode}
                onChange={(e) => setAddress({ ...address, postalCode: e.target.value })}
                required
              />
              <input
                placeholder="Country"
                value={address.country}
                onChange={(e) => setAddress({ ...address, country: e.target.value })}
                required
              />
            </div>
          </form>
        ) : stripePromise && elementsOptions ? (
          <Elements stripe={stripePromise} options={elementsOptions}>
            <StripePayment session={session} onPaid={() => finish(session.paymentGroup)} />
          </Elements>
        ) : (
          <p className="error">Stripe publishable key is missing (VITE_STRIPE_PUBLISHABLE_KEY).</p>
        )}
        <ErrorText error={error} />
      </section>

      <aside className="card summary">
        {cart.items.map((i) => (
          <div key={i.productId} className="row small">
            <span>
              {i.quantity} × {i.title}
            </span>
            <span>{money(i.price * i.quantity)}</span>
          </div>
        ))}
        <hr />
        {!session && (
          <div className="coupon">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Coupon code" />
            <button type="button" onClick={checkCoupon} disabled={!code}>
              Apply
            </button>
          </div>
        )}
        <div className="row">
          <span>Subtotal</span>
          <span>{money(cart.subtotal)}</span>
        </div>
        {preview && (
          <div className="row ok">
            <span>Coupon {preview.code}</span>
            <span>-{money(preview.discount)}</span>
          </div>
        )}
        <div className="row total">
          <span>Total</span>
          <span>{money(session ? session.amount : total)}</span>
        </div>
        {!session && (
          <button form="checkout" className="primary" disabled={busy}>
            {busy ? 'Placing order…' : 'Place order'}
          </button>
        )}
        <p className="muted small">Test mode: use card 4242 4242 4242 4242, any future date and CVC.</p>
      </aside>
    </div>
  );
}

function StripePayment({ session, onPaid }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const pay = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/orders` },
      redirect: 'if_required',
    });
    if (stripeError) {
      setError(stripeError);
      setBusy(false);
      return;
    }
    try {
      await onPaid();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={pay} className="stack">
      <h3>Payment</h3>
      <PaymentElement />
      <button className="primary" disabled={!stripe || busy}>
        {busy ? 'Paying…' : `Pay ${money(session.amount)}`}
      </button>
      <ErrorText error={error} />
    </form>
  );
}
