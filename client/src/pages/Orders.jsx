import { Link, useSearchParams } from 'react-router-dom';
import { api, money } from '../api/client';
import { Empty, ErrorText, Spinner, StatusBadge, useFetch } from '../components/ui';

export default function Orders() {
  const [params] = useSearchParams();
  const { data, error, loading } = useFetch(() => api('/orders').then((d) => d.items));

  if (loading) return <Spinner />;
  const orders = data?.filter((o) => o.status !== 'pending_payment') || [];

  return (
    <>
      <h1>Your orders</h1>
      {params.get('placed') && (
        <p className="notice ok">
          Thanks! Your payment went through. Items from different sellers ship as separate orders.
        </p>
      )}
      <ErrorText error={error} />
      {!orders.length && <Empty>No orders yet.</Empty>}
      {orders.map((o) => (
        <Link key={o._id} to={`/orders/${o._id}`} className="card order-row">
          <div>
            <strong>{o.orderNumber}</strong>
            <div className="muted small">
              {new Date(o.createdAt).toLocaleDateString()} · {o.vendor?.storeName} · {o.items.length} item(s)
            </div>
          </div>
          <StatusBadge status={o.status} />
          <strong>{money(o.total)}</strong>
        </Link>
      ))}
    </>
  );
}
