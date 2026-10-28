import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, imageUrl, money, openInvoice } from '../api/client';
import { ErrorText, Spinner, StatusBadge, useFetch } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import type { Order, OrderStatus } from '../types';

const STEPS: OrderStatus[] = ['placed', 'packed', 'shipped', 'delivered'];
const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  placed: 'packed',
  packed: 'shipped',
  shipped: 'delivered',
};

const PAYOUT_LABEL = {
  pending: 'Payout pending',
  paid: 'Paid out',
  failed: 'Payout failed, retrying automatically',
  skipped: 'No payout (cancelled)',
};

function RefundForm({ order, onDone }: { order: Order; onDone: () => void }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<number | null>(null);

  const lines = Object.entries(qty)
    .filter(([, q]) => q > 0)
    .map(([product, quantity]) => ({ product, quantity }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await api<{ amount: number }>(`/orders/${order._id}/refund`, {
        method: 'POST',
        body: { items: lines, reason: reason || undefined },
      });
      setResult(res.amount);
      setQty({});
      setReason('');
      onDone();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <form className="card stack refund-form" onSubmit={submit}>
      <h3>Refund items</h3>
      {order.items.map((i) => {
        const left = i.quantity - (i.refundedQuantity || 0);
        return (
          <label key={i.product} className="row small">
            <span>{i.title}</span>
            <select
              value={qty[i.product] || 0}
              disabled={!left}
              aria-label={`Units of ${i.title} to refund`}
              onChange={(e) => setQty({ ...qty, [i.product]: Number(e.target.value) })}
            >
              {Array.from({ length: left + 1 }, (_, n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        );
      })}
      <input
        placeholder="Reason (optional)"
        aria-label="Refund reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <button disabled={!lines.length}>Refund selected</button>
      {result !== null && (
        <p className="ok small" role="status">
          Refunded {money(result)} to the customer.
        </p>
      )}
      <ErrorText error={error} />
    </form>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const {
    data: order,
    error,
    loading,
    reload,
  } = useFetch(() => api<{ order: Order }>(`/orders/${id}`).then((d) => d.order), [id]);
  const [actionError, setActionError] = useState<unknown>(null);

  if (loading) return <Spinner />;
  if (error || !order || !user) return <ErrorText error={error} />;

  const run = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
      reload();
    } catch (err) {
      setActionError(err);
    }
  };

  const setStatus = (status: OrderStatus) =>
    run(() => api(`/orders/${order._id}/status`, { method: 'PATCH', body: { status } }));

  const vendor = typeof order.vendor === 'string' ? null : order.vendor;
  const stepIndex = STEPS.indexOf(order.status);
  const at = (s: OrderStatus) => order.statusHistory.find((h) => h.status === s)?.at;
  const next = NEXT[order.status];
  const isVendor = user.role === 'vendor';
  const transfer = order.payment?.transferStatus;

  return (
    <div className="stack">
      <div className="order-head">
        <div>
          <h1>Order {order.orderNumber}</h1>
          <span className="muted">
            Placed {new Date(order.createdAt).toLocaleString()}
            {vendor && (
              <>
                {' '}
                · sold by <Link to={`/stores/${vendor.slug}`}>{vendor.storeName}</Link>
              </>
            )}
          </span>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {order.status !== 'cancelled' && (
        <ol className="timeline" aria-label="Order progress">
          {STEPS.map((s, i) => {
            const when = at(s);
            return (
              <li
                key={s}
                className={i <= stepIndex ? 'done' : ''}
                aria-current={i === stepIndex ? 'step' : undefined}
              >
                <span className="dot" />
                <span>{s}</span>
                {when && <span className="muted small">{new Date(when).toLocaleDateString()}</span>}
              </li>
            );
          })}
        </ol>
      )}

      <div className="cart-page">
        <section className="stack">
          <div className="card">
            {order.items.map((i) => (
              <div key={i.product} className="cart-row">
                <img src={imageUrl(i.image)} alt="" />
                <div className="grow">
                  <Link to={`/products/${i.product}`}>{i.title}</Link>
                  <div className="muted small">
                    {i.quantity} × {money(i.price)}
                    {i.refundedQuantity ? (
                      <span className="warn"> · {i.refundedQuantity} refunded</span>
                    ) : null}
                  </div>
                </div>
                <strong>{money(i.price * i.quantity)}</strong>
              </div>
            ))}
            {order.shippingAddress && (
              <p className="muted small">
                Ship to: {order.shippingAddress.line1}, {order.shippingAddress.city}{' '}
                {order.shippingAddress.postalCode}, {order.shippingAddress.country}
              </p>
            )}
          </div>

          {order.refunds.length > 0 && (
            <div className="card">
              <h3>Refunds</h3>
              {order.refunds.map((r, i) => (
                <div key={i} className="row small">
                  <span>
                    {new Date(r.at).toLocaleDateString()}
                    {r.reason && ` · ${r.reason}`}
                  </span>
                  <span>-{money(r.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {isVendor && STEPS.includes(order.status) && order.refundedTotal < order.total && (
            <RefundForm order={order} onDone={reload} />
          )}
        </section>

        <aside className="card summary">
          <div className="row">
            <span>Subtotal</span>
            <span>{money(order.subtotal)}</span>
          </div>
          {order.discount > 0 && (
            <div className="row ok">
              <span>Discount {order.couponCode}</span>
              <span>-{money(order.discount)}</span>
            </div>
          )}
          <div className="row">
            <span>Shipping</span>
            <span>{order.shippingFee ? money(order.shippingFee) : 'Free'}</span>
          </div>
          <div className="row total">
            <span>Total</span>
            <span>{money(order.total)}</span>
          </div>
          {order.refundedTotal > 0 && (
            <div className="row warn">
              <span>Refunded</span>
              <span>-{money(order.refundedTotal)}</span>
            </div>
          )}
          {user.role !== 'customer' && (
            <>
              <div className="row small muted">
                <span>Platform commission ({Math.round(order.commissionRate * 100)}%)</span>
                <span>-{money(order.commission)}</span>
              </div>
              <div className="row">
                <span>Seller payout</span>
                <strong>{money(order.vendorPayout)}</strong>
              </div>
              {transfer && (
                <p className={`small ${transfer === 'failed' ? 'error' : 'muted'}`}>
                  {PAYOUT_LABEL[transfer]}
                </p>
              )}
            </>
          )}

          {order.status !== 'pending_payment' && (
            <button onClick={() => run(() => openInvoice(order._id))}>Download invoice (PDF)</button>
          )}
          {user.role === 'customer' && order.status === 'placed' && (
            <button
              className="danger"
              onClick={() => run(() => api(`/orders/${order._id}/cancel`, { method: 'POST' }))}
            >
              Cancel order
            </button>
          )}
          {isVendor && next && (
            <button className="primary" onClick={() => setStatus(next)}>
              Mark as {next}
            </button>
          )}
          {isVendor && ['placed', 'packed'].includes(order.status) && (
            <button className="danger" onClick={() => setStatus('cancelled')}>
              Cancel and refund
            </button>
          )}
          <ErrorText error={actionError} />
        </aside>
      </div>
    </div>
  );
}
