import { Link, useSearchParams } from 'react-router-dom';
import { api, money } from '../api/client';
import { Empty, ErrorText, Spinner, StatusBadge, useFetch } from '../components/ui';
import type { Items, Order } from '../types';

const storeName = (o: Order) => (typeof o.vendor === 'string' ? '' : o.vendor.storeName);

export default function Orders() {
  const [params] = useSearchParams();
  const { data, error, loading } = useFetch(() => api<Items<Order>>('/orders').then((d) => d.items));

  if (loading) return <Spinner />;
  const orders = data?.filter((o) => o.status !== 'pending_payment') || [];
  const placed = Number(params.get('placed'));

  return (
    <>
      <h1>Your orders</h1>
      {params.has('placed') &&
        (placed ? (
          <p className="notice ok" role="status">
            Thanks! Your payment went through. Items from different sellers ship as separate orders.
          </p>
        ) : (
          <p className="notice error" role="alert">
            Your items were no longer held, so nothing was charged. Please check out again.
          </p>
        ))}
      <ErrorText error={error} />
      {!orders.length && <Empty>No orders yet.</Empty>}
      {orders.map((o) => (
        <Link key={o._id} to={`/orders/${o._id}`} className="card order-row">
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
