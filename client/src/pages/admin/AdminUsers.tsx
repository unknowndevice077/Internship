import { useState } from 'react';
import { api } from '../../api/client';
import { ErrorText, Spinner, useFetch } from '../../components/ui';
import type { Items, User } from '../../types';

export default function AdminUsers() {
  const [role, setRole] = useState('');
  const { data, error, loading, reload } = useFetch(
    () => api<Items<User>>(`/admin/users${role ? `?role=${role}` : ''}`).then((d) => d.items),
    [role],
  );

  const toggle = async (u: User) => {
    await api(`/admin/users/${u._id}`, { method: 'PATCH', body: { isActive: !u.isActive } });
    reload();
  };

  return (
    <>
      <div className="shop-head">
        <h1>Users</h1>
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role">
          <option value="">All roles</option>
          <option value="customer">Customers</option>
          <option value="vendor">Vendors</option>
          <option value="admin">Admins</option>
        </select>
      </div>
      <ErrorText error={error} />
      {loading || !data ? (
        <Spinner />
      ) : (
        <div className="table-wrap">
          <table className="table card">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u._id} className={u.isActive ? '' : 'faded'}>
                  <td>{u.name}</td>
                  <td>
                    {u.email}
                    {!u.emailVerified && <div className="muted small">not verified</div>}
                  </td>
                  <td>{u.role}</td>
                  <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td>
                    {u.role === 'admin' ? (
                      'active'
                    ) : (
                      <button className="link" onClick={() => toggle(u)} title="Click to enable or disable">
                        {u.isActive ? 'Active' : 'Disabled'}
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
