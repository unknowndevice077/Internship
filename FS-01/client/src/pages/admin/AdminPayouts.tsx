import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../../api/client';
import { Empty, ErrorText, Spinner, useFetch } from '../../components/ui';
import type { Items, Order, TransferStatus } from '../../types';

const TABS: TransferStatus[] = ['failed', 'pending', 'paid', 'skipped'];

export default function AdminPayouts() {
  const [tab, setTab] = useState<TransferStatus>('failed');
  const { data, error, loading, reload } = useFetch(
    () => api<Items<Order>>(`/admin/payouts?status=${tab}`).then((d) => d.items),
    [tab],
  );
  const [actionError, setActionError] = useState<unknown>(null);

  const retry = async (order: Order) => {
    setActionError(null);
    try {
      await api(`/admin/orders/${order._id}/retry-payout`, { method: 'POST' });
      reload();
    } catch (err) {
      setActionError(err);
    }
  };

  return (
    <>
      <h1>Vendor payouts</h1>
      <p className="muted">
        Failed transfers are retried automatically after 1, 5, 30, 120 and 360 minutes. You can also retry one
        now.
      </p>
      <div className="tabs" role="group" aria-label="Filter by payout status">
        {TABS.map((t) => (
          <button
            key={t}
            className={tab === t ? 'active' : ''}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <ErrorText error={error || actionError} />
      {loading && !data ? (
        <Spinner />
      ) : !data?.length ? (
        <Empty>{tab === 'failed' ? 'No failed payouts.' : 'Nothing here.'}</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table card">
            <thead>
              <tr>
                <th>Order</th>
                <th>Store</th>
                <th>Payout</th>
                <th>Attempts</th>
                <th>Last error</th>
                <th>Next try</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((o) => (
                <tr key={o._id}>
                  <td>
                    <Link to={`/orders/${o._id}`}>{o.orderNumber}</Link>
                  </td>
                  <td>{typeof o.vendor === 'string' ? '' : o.vendor.storeName}</td>
                  <td>{money(o.vendorPayout)}</td>
                  <td>{o.payment?.transferAttempts ?? 0}</td>
                  <td className="small">{o.payment?.transferError || '–'}</td>
                  <td className="small">
                    {o.payment?.nextTransferAt
                      ? new Date(o.payment.nextTransferAt).toLocaleTimeString()
                      : tab === 'failed'
                        ? 'manual only'
                        : '–'}
                  </td>
                  <td>
                    {tab === 'failed' && (
                      <button className="small-btn" onClick={() => retry(o)}>
                        Retry now
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
