import { useState } from 'react';
import { api } from '../../api/client';
import { Empty, ErrorText, Spinner, StatusBadge, useFetch } from '../../components/ui';
import type { Items, Vendor } from '../../types';

export default function AdminVendors() {
  const [filter, setFilter] = useState('');
  const { data, error, loading, reload } = useFetch(
    () => api<Items<Vendor>>(`/admin/vendors${filter ? `?status=${filter}` : ''}`).then((d) => d.items),
    [filter],
  );

  const update = async (id: string, body: Partial<Pick<Vendor, 'status' | 'commissionRate'>>) => {
    await api(`/admin/vendors/${id}`, { method: 'PATCH', body });
    reload();
  };

  const editCommission = (v: Vendor) => {
    const current = v.commissionRate != null ? String(v.commissionRate * 100) : '';
    const input = window.prompt('Commission % for this vendor (blank = platform default)', current);
    if (input === null) return;
    update(v._id, { commissionRate: input === '' ? null : Number(input) / 100 });
  };

  return (
    <>
      <div className="shop-head">
        <h1>Vendors</h1>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by status">
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>
      <ErrorText error={error} />
      {loading ? (
        <Spinner />
      ) : !data?.length ? (
        <Empty>No vendors.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table card">
            <thead>
              <tr>
                <th>Store</th>
                <th>Owner</th>
                <th>Commission</th>
                <th>Payouts</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
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
                    <button className="link" onClick={() => editCommission(v)} title="Change commission">
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
                      <button
                        className="small-btn danger"
                        onClick={() => update(v._id, { status: 'suspended' })}
                      >
                        Suspend
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
