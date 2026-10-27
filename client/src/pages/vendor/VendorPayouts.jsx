import { useState } from 'react';
import { api } from '../../api/client';
import { ErrorText, Spinner, useFetch } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';

export default function VendorPayouts() {
  const { setVendor } = useAuth();
  const { data: vendor, loading, reload } = useFetch(() => api('/vendors/me/payouts').then((d) => d.vendor));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api('/vendors/me/payouts', { method: 'POST' });
      setVendor(res.vendor);
      // real Stripe sends you to their hosted onboarding, mock mode is instant
      if (res.url) window.location.href = res.url;
      else reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="card stack">
      <h1>Payouts</h1>
      <p className="muted">
        Customers pay Vendora, and your share (order total minus the{' '}
        {vendor.commissionRate != null ? `${Math.round(vendor.commissionRate * 100)}%` : 'platform'} commission) is
        transferred to your Stripe account when the payment clears.
      </p>
      <div className="row">
        <span>Stripe account</span>
        <code>{vendor.stripeAccountId || 'not connected'}</code>
      </div>
      <div className="row">
        <span>Payouts</span>
        <strong className={vendor.payoutsEnabled ? 'ok' : 'error'}>
          {vendor.payoutsEnabled ? 'Enabled' : 'Not enabled'}
        </strong>
      </div>
      {!vendor.payoutsEnabled && (
        <button className="primary" onClick={connect} disabled={busy}>
          {vendor.stripeAccountId ? 'Continue Stripe onboarding' : 'Connect with Stripe'}
        </button>
      )}
      <ErrorText error={error} />
    </div>
  );
}
