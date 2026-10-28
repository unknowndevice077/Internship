import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, imageUrl, money, openInvoice } from '../api/client';
import { ErrorText, Spinner, StatusBadge, useFetch } from '../components/ui';
import { useAuth } from '../context/AuthContext';

const STEPS = ['placed', 'packed', 'shipped', 'delivered'];
const NEXT = { placed: 'packed', packed: 'shipped', shipped: 'delivered' };

export default function OrderDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const {
    data: order,
    error,
    loading,
    reload,
  } = useFetch(() => api(`/orders/${id}`).then((d) => d.order), [id]);
  const [actionError, setActionError] = useState(null);

  if (loading) return <Spinner />;
  if (error) return <ErrorText error={error} />;

  const run = async (fn) => {
    setActionError(null);
    try {
      await fn();
      reload();
    } catch (err) {
      setActionError(err);
    }
  };

  const setStatus = (status) =>
    run(() => api(`/orders/${order._id}/status`, { method: 'PATCH', body: { status } }));

  const stepIndex = STEPS.indexOf(order.status);
  const at = (s) => order.statusHistory.find((h) => h.status === s)?.at;

  return (
    <div className="stack">
      <div className="order-head">
        <div>
          <h1>Order {order.orderNumber}</h1>
          <span className="muted">
            Placed {new Date(order.createdAt).toLocaleString()} · sold by{' '}
            <Link to={`/stores/${order.vendor.slug}`}>{order.vendor.storeName}</Link>
          </span>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {order.status !== 'cancelled' && (
        <ol className="timeline">
          {STEPS.map((s, i) => (
            <li key={s} className={i <= stepIndex ? 'done' : ''}>
              <span className="dot" />
              <span>{s}</span>
              {at(s) && <span className="muted small">{new Date(at(s)).toLocaleDateString()}</span>}
            </li>
          ))}
        </ol>
      )}

      <div className="cart-page">
        <section className="card">
          {order.items.map((i) => (
            <div key={i.product} className="cart-row">
              <img src={imageUrl(i.image)} alt="" />
              <div className="grow">
                <Link to={`/products/${i.product}`}>{i.title}</Link>
                <div className="muted small">
                  {i.quantity} × {money(i.price)}
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
          <div className="row total">
            <span>Total</span>
            <span>{money(order.total)}</span>
          </div>
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
          {user.role === 'vendor' && NEXT[order.status] && (
            <button className="primary" onClick={() => setStatus(NEXT[order.status])}>
              Mark as {NEXT[order.status]}
            </button>
          )}
          {user.role === 'vendor' && ['placed', 'packed'].includes(order.status) && (
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
