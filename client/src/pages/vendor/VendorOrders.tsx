import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, apiBlob, money, saveBlob } from '../../api/client';
import { Empty, ErrorText, Spinner, StatusBadge, useFetch } from '../../components/ui';
import type { Items, Order, OrderStatus } from '../../types';

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  placed: 'packed',
  packed: 'shipped',
  shipped: 'delivered',
};
const TABS = ['', 'placed', 'packed', 'shipped', 'delivered', 'cancelled'];

// filters live in the URL so a filtered view can be bookmarked or shared
export default function VendorOrders() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('status') || '';
  const query = params.toString();
  const { data, error, loading, reload } = useFetch(
    () => api<Items<Order>>(`/orders?${query}`).then((d) => d.items),
    [query],
  );
  const [actionError, setActionError] = useState<unknown>(null);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  const onSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const next = new URLSearchParams(params);
    for (const k of ['q', 'from', 'to']) {
      const v = f.get(k);
      if (typeof v === 'string' && v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next);
  };

  const advance = async (order: Order) => {
    const status = NEXT[order.status];
    if (!status) return;
    setActionError(null);
    try {
      await api(`/orders/${order._id}/status`, { method: 'PATCH', body: { status } });
      reload();
    } catch (err) {
      setActionError(err);
    }
  };

  const exportCsv = async () => {
    setActionError(null);
    try {
      saveBlob(
        await apiBlob(`/orders/export.csv?${query}`),
        `orders-${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } catch (err) {
      setActionError(err);
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>Orders</h1>
        <button onClick={exportCsv}>Export CSV</button>
      </div>
      <div className="tabs" role="group" aria-label="Filter by status">
        {TABS.map((t) => (
          <button
            key={t}
            className={tab === t ? 'active' : ''}
            aria-pressed={tab === t}
            onClick={() => setParam('status', t)}
          >
            {t || 'all'}
          </button>
        ))}
      </div>
      <form className="order-filters" onSubmit={onSearch} key={query}>
        <input
          name="q"
          placeholder="Order number"
          aria-label="Order number"
          defaultValue={params.get('q') || ''}
        />
        <label>
          From <input name="from" type="date" defaultValue={params.get('from') || ''} />
        </label>
        <label>
          To <input name="to" type="date" defaultValue={params.get('to') || ''} />
        </label>
        <button type="submit">Filter</button>
        {(params.get('q') || params.get('from') || params.get('to')) && (
          <button type="button" className="link" onClick={() => setParams(tab ? { status: tab } : {})}>
            Clear
          </button>
        )}
      </form>
      <ErrorText error={error || actionError} />
      {loading && !data ? (
        <Spinner />
      ) : !data?.length ? (
        <Empty>No orders here.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table card">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Payout</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((o) => {
                const next = NEXT[o.status];
                return (
                  <tr key={o._id}>
                    <td>
                      <Link to={`/orders/${o._id}`}>{o.orderNumber}</Link>
                      <div className="muted small">{new Date(o.createdAt).toLocaleDateString()}</div>
                    </td>
                    <td>{typeof o.customer === 'string' ? '' : o.customer.name}</td>
                    <td>{o.items.reduce((n, i) => n + i.quantity, 0)}</td>
                    <td>
                      {money(o.total)}
                      {o.refundedTotal > 0 && (
                        <div className="warn small">-{money(o.refundedTotal)} refunded</div>
                      )}
                    </td>
                    <td>{money(o.vendorPayout)}</td>
                    <td>
                      <StatusBadge status={o.status} />
                    </td>
                    <td>
                      {next && (
                        <button className="small-btn" onClick={() => advance(o)}>
                          Mark {next}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
