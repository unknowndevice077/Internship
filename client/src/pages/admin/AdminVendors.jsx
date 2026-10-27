import { useState } from 'react';
import { api } from '../../api/client';
import { Empty, ErrorText, Spinner, StatusBadge, useFetch } from '../../components/ui';

export default function AdminVendors() {
  const [filter, setFilter] = useState('');
  const { data, error, loading, reload } = useFetch(
    () => api(`/admin/vendors${filter ? `?status=${filter}` : ''}`).then((d) => d.items),
    [filter],
  );

  const update = async (id, body) => {
    await api(`/admin/vendors/${id}`, { method: 'PATCH', body });
    reload();
  };

  const editCommission = (v) => {
    const current = v.commissionRate != null ? v.commissionRate * 100 : '';
    const input = window.prompt('Commission % for this vendor (blank = platform default)', current);
    if (input === null) return;
    update(v._id, { commissionRate: input === '' ? null : Number(input) / 100 });
  };

  return (
    <>
      <div className="shop-head">
        <h1>Vendors</h1>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>
      <ErrorText error={error} />
      {loading ? (
        <Spinner />
      ) : !data.length ? (
        <Empty>No vendors.</Empty>
      ) : (
        <table className="table card">
          <thead>
            <tr>
              <th>Store</th>
              <th>Owner</th>
              <th>Commission</th>
              <th>Payouts</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.map((v) => (
              <tr key={v._id}>
                <td>{v.storeName}</td>
                <td>
                  {v.owner?.name}
                  <div className="muted small">{v.owner?.email}</div>
                </td>
                <td>
                  <button className="link" onClick={() => editCommission(v)}>
                    {v.commissionRate != null ? `${Math.round(v.commissionRate * 100)}%` : 'default'}
                  </button>
                </td>
                <td>{v.payoutsEnabled ? 'yes' : 'no'}</td>
                <td>
                  <StatusBadge status={v.status} />
                </td>
                <td className="actions">
                  {v.status !== 'approved' && (
                    <button className="small-btn" onClick={() => update(v._id, { status: 'approved' })}>
                      Approve
                    </button>
                  )}
                  {v.status === 'approved' && (
                    <button className="small-btn danger" onClick={() => update(v._id, { status: 'suspended' })}>
                      Suspend
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
