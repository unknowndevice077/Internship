import { Link, useSearchParams } from 'react-router-dom';
import { api, money } from '../api/client';
import { Confetti } from '../components/motion';
import { Empty, ErrorText, Spinner, StatusBadge, useFetch, useTitle } from '../components/ui';
import type { Items, Order } from '../types';

const storeName = (o: Order) => (typeof o.vendor === 'string' ? '' : o.vendor.storeName);

export default function Orders() {
  const [params] = useSearchParams();
  const { data, error, loading } = useFetch(() => api<Items<Order>>('/orders').then((d) => d.items));

  useTitle('Your orders');

  if (loading) return <Spinner />;
  const orders = data?.filter((o) => o.status !== 'pending_payment') || [];
  const placed = Number(params.get('placed'));

  return (
    <>
      <h1>Your orders</h1>
      {params.has('placed') &&
        (placed ? (
          <p className="notice ok placed" role="status">
            <Confetti />
            <svg className="check" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M7.5 12.5l3 3 6-6.5" />
            </svg>
            <span>
              Thanks! Your payment went through. Items from different sellers ship as separate orders.
            </span>
          </p>
        ) : (
          <p className="notice error" role="alert">
            Your items were no longer held, so nothing was charged. Please check out again.
          </p>
        ))}
      <ErrorText error={error} />
      {!orders.length && (
        <Empty>
          No orders yet. <Link to="/">Start shopping</Link>
        </Empty>
      )}
      {orders.map((o, i) => (
        <Link
          key={o._id}
          to={`/orders/${o._id}`}
          className="card order-row"
          style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
        >
          <div>
            <strong>{o.orderNumber}</strong>
            <div className="muted small">
              {new Date(o.createdAt).toLocaleDateString()} · {storeName(o)} · {o.items.length}{' '}
              {o.items.length === 1 ? 'item' : 'items'}
            </div>
          </div>
          <StatusBadge status={o.status} />
          <strong>{money(o.total)}</strong>
        </Link>
      ))}
    </>
  );
}
