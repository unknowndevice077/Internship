import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../../api/client';
import { Empty, ErrorText, Spinner, StatusBadge, useFetch } from '../../components/ui';

const NEXT = { placed: 'packed', packed: 'shipped', shipped: 'delivered' };
const TABS = ['', 'placed', 'packed', 'shipped', 'delivered', 'cancelled'];

export default function VendorOrders() {
  const [tab, setTab] = useState('');
  const { data, error, loading, reload } = useFetch(
    () => api(`/orders${tab ? `?status=${tab}` : ''}`).then((d) => d.items),
    [tab],
  );
  const [actionError, setActionError] = useState(null);

  const advance = async (order) => {
    setActionError(null);
    try {
      await api(`/orders/${order._id}/status`, { method: 'PATCH', body: { status: NEXT[order.status] } });
      reload();
    } catch (err) {
      setActionError(err);
    }
  };

  return (
    <>
      <h1>Orders</h1>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t || 'all'}
          </button>
        ))}
      </div>
      <ErrorText error={error || actionError} />
      {loading ? (
        <Spinner />
      ) : !data.length ? (
        <Empty>No orders here.</Empty>
      ) : (
        <table className="table card">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Payout</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.map((o) => (
              <tr key={o._id}>
                <td>
                  <Link to={`/orders/${o._id}`}>{o.orderNumber}</Link>
                  <div className="muted small">{new Date(o.createdAt).toLocaleDateString()}</div>
                </td>
                <td>{o.customer?.name}</td>
                <td>{o.items.reduce((n, i) => n + i.quantity, 0)}</td>
                <td>{money(o.total)}</td>
                <td>{money(o.vendorPayout)}</td>
                <td>
                  <StatusBadge status={o.status} />
                </td>
                <td>
                  {NEXT[o.status] && (
                    <button className="small-btn" onClick={() => advance(o)}>
                      Mark {NEXT[o.status]}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
