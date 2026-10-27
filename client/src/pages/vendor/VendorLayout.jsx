import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { api } from '../../api/client';
import { ErrorText } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';

export default function VendorLayout() {
  const { vendor } = useAuth();
  if (!vendor) return <Onboarding />;

  return (
    <div className="dash">
      <nav className="side card">
        <strong>{vendor.storeName}</strong>
        <NavLink end to="/vendor">
          Overview
        </NavLink>
        <NavLink to="/vendor/products">Products</NavLink>
        <NavLink to="/vendor/orders">Orders</NavLink>
        <NavLink to="/vendor/coupons">Coupons</NavLink>
        <NavLink to="/vendor/payouts">Payouts</NavLink>
      </nav>
      <div>
        {vendor.status !== 'approved' && (
          <p className="notice">
            {vendor.status === 'pending'
              ? 'Your store is waiting for admin approval. You can set up payouts in the meantime.'
              : 'Your store is suspended. Contact support.'}
          </p>
        )}
        <Outlet />
      </div>
    </div>
  );
}

function Onboarding() {
  const { setVendor } = useAuth();
  const [form, setForm] = useState({ storeName: '', description: '' });
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const { vendor } = await api('/vendors/onboard', { method: 'POST', body: form });
      setVendor(vendor);
    } catch (err) {
      setError(err);
    }
  };

  return (
    <div className="auth-box card">
      <h1>Open your store</h1>
      <p className="muted">Tell customers who you are. An admin reviews new stores before they go live.</p>
      <form className="stack" onSubmit={submit}>
        <input
          placeholder="Store name"
          value={form.storeName}
          onChange={(e) => setForm({ ...form, storeName: e.target.value })}
          required
        />
        <textarea
          placeholder="What do you sell?"
          rows={4}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <button className="primary">Create store</button>
        <ErrorText error={error} />
      </form>
    </div>
  );
}
