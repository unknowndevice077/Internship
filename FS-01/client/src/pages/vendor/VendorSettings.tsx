import { useState, type FormEvent } from 'react';
import { api, money } from '../../api/client';
import { ErrorText } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import type { Vendor } from '../../types';

export default function VendorSettings() {
  const { vendor, setVendor } = useAuth();
  const [form, setForm] = useState({
    storeName: vendor?.storeName ?? '',
    description: vendor?.description ?? '',
    shippingFee: String(vendor?.shippingFee ?? 0),
    freeShippingOver: vendor?.freeShippingOver != null ? String(vendor.freeShippingOver) : '',
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      const res = await api<{ vendor: Vendor }>('/vendors/me', {
        method: 'PATCH',
        body: {
          storeName: form.storeName,
          description: form.description,
          shippingFee: Number(form.shippingFee) || 0,
          freeShippingOver: form.freeShippingOver === '' ? null : Number(form.freeShippingOver),
        },
      });
      setVendor(res.vendor);
      setSaved(true);
    } catch (err) {
      setError(err);
    }
  };

  const fee = Number(form.shippingFee) || 0;

  return (
    <form className="card stack settings-form" onSubmit={submit}>
      <h1>Store settings</h1>
      <label>
        Store name
        <input
          value={form.storeName}
          onChange={(e) => setForm({ ...form, storeName: e.target.value })}
          required
        />
      </label>
      <label>
        Description
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </label>

      <h3>Shipping</h3>
      <div className="two">
        <label>
          Flat rate per order ($)
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.shippingFee}
            onChange={(e) => setForm({ ...form, shippingFee: e.target.value })}
          />
        </label>
        <label>
          Free when the order is over ($)
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="never"
            value={form.freeShippingOver}
            onChange={(e) => setForm({ ...form, freeShippingOver: e.target.value })}
          />
        </label>
      </div>
      <p className="muted small">
        {fee
          ? `Customers pay ${money(fee)} per order from your store${
              form.freeShippingOver
                ? `, or nothing once they spend ${money(Number(form.freeShippingOver))}`
                : ''
            }. You keep all of it, commission is only taken on the goods.`
          : 'Shipping is free on all your orders.'}
      </p>

      <button className="primary">Save</button>
      {saved && (
        <p className="ok small" role="status">
          Saved.
        </p>
      )}
      <ErrorText error={error} />
    </form>
  );
}
