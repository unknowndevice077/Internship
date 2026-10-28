import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loadStripe, type StripeElementsOptions } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { api, money } from '../api/client';
import { Empty, ErrorText, useFetch } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import type { Address, Order, Quote } from '../types';

const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripeKey ? loadStripe(stripeKey) : null;

interface Session {
  paymentGroup: string;
  amount: number;
  provider: 'stripe' | 'mock';
  clientSecret: string | null;
  reservedUntil: string;
}

function HoldTimer({ until }: { until: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, new Date(until).getTime() - now);
  const mins = Math.floor(left / 60000);
  const secs = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
  return (
    <p className={left ? 'muted small' : 'error small'} role="timer">
      {left
        ? `Your items are held for ${mins}:${secs}`
        : 'The hold on your items ran out. Go back to the cart and check out again.'}
    </p>
  );
}

export default function Checkout() {
  const { user } = useAuth();
  const { cart, reload } = useCart();
  const navigate = useNavigate();

  const [address, setAddress] = useState<Address>({
    line1: user?.address?.line1 || '',
    city: user?.address?.city || '',
    state: user?.address?.state || '',
    postalCode: user?.address?.postalCode || '',
    country: user?.address?.country || 'PH',
  });
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState<Quote | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const base = useFetch(() => api<Quote>('/cart/quote'), [cart]);
  const quote = applied ?? base.data;

  const checkCoupon = async () => {
    setError(null);
    try {
      setApplied(await api<Quote>('/coupons/validate', { method: 'POST', body: { code } }));
    } catch (err) {
      setApplied(null);
      setError(err);
    }
  };

  const finish = async (paymentGroup: string) => {
    const { orders } = await api<{ orders: Order[] }>(`/orders/confirm/${paymentGroup}`, { method: 'POST' });
    await reload();
    navigate(`/orders?placed=${orders.filter((o) => o.status === 'placed').length}`);
  };

  const placeOrder = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api<Session>('/orders/checkout', {
        method: 'POST',
        body: { shippingAddress: address, couponCode: applied?.code || '' },
      });
      // save the address for next time, no need to wait on it
      api('/auth/me', { method: 'PATCH', body: { address } }).catch(() => {});
      if (result.provider === 'mock') await finish(result.paymentGroup);
      else setSession(result);
    } catch (err) {
      setError(err);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const elementsOptions = useMemo<StripeElementsOptions | null>(() => {
    if (!session?.clientSecret) return null;
    const dark = document.documentElement.dataset.theme === 'dark';
    return { clientSecret: session.clientSecret, appearance: { theme: dark ? 'night' : 'stripe' } };
  }, [session]);

  if (!cart.items.length && !session) {
    return (
      <Empty>
        Nothing to check out. <Link to="/">Browse products</Link>
      </Empty>
    );
  }

  const field = (key: keyof Address, label: string, required = true) => (
    <input
      placeholder={label}
      aria-label={label}
      value={address[key] ?? ''}
      onChange={(e) => setAddress({ ...address, [key]: e.target.value })}
      required={required}
    />
  );

  return (
    <div className="cart-page">
      <section className="card">
        <h1>Checkout</h1>
        {!session ? (
          <form id="checkout" onSubmit={placeOrder} className="stack">
            <h3>Shipping address</h3>
            {field('line1', 'Street address')}
            <div className="two">
              {field('city', 'City')}
              {field('state', 'State / province', false)}
            </div>
            <div className="two">
              {field('postalCode', 'Postal code')}
              {field('country', 'Country')}
            </div>
          </form>
        ) : stripePromise && elementsOptions ? (
          <>
            <HoldTimer until={session.reservedUntil} />
            <Elements stripe={stripePromise} options={elementsOptions}>
              <StripePayment session={session} onPaid={() => finish(session.paymentGroup)} />
            </Elements>
          </>
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
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Coupon code"
              aria-label="Coupon code"
            />
            <button type="button" onClick={checkCoupon} disabled={!code}>
              Apply
            </button>
          </div>
        )}
        <div className="row">
          <span>Subtotal</span>
          <span>{money(quote?.subtotal ?? cart.subtotal)}</span>
        </div>
        {applied && (
          <div className="row ok">
            <span>Coupon {applied.code}</span>
            <span>-{money(applied.discount)}</span>
          </div>
        )}
        {quote?.stores
          .filter((s) => s.shippingFee > 0)
          .map((s) => (
            <div key={s.vendorId} className="row small">
              <span>Shipping from {s.vendorName}</span>
              <span>{money(s.shippingFee)}</span>
            </div>
          ))}
        {quote && quote.shipping === 0 && (
          <div className="row small">
            <span>Shipping</span>
            <span>Free</span>
          </div>
        )}
        <div className="row total">
          <span>Total</span>
          <span>{money(session ? session.amount : (quote?.total ?? cart.subtotal))}</span>
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

function StripePayment({ session, onPaid }: { session: Session; onPaid: () => Promise<void> }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const pay = async (e: FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/orders` },
      redirect: 'if_required',
    });
    if (stripeError) {
      setError(new Error(stripeError.message || 'Payment failed'));
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
