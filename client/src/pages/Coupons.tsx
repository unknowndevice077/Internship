import { useState, type ChangeEvent, type FormEvent } from 'react';
import { api, money } from '../api/client';
import { Empty, ErrorText, Spinner, useFetch } from '../components/ui';
import type { Coupon, Items } from '../types';

const EMPTY_FORM = { code: '', type: 'percent', value: '', minOrder: '', maxUses: '', expiresAt: '' };

// vendors and admins share this page, the API scopes the list
export default function Coupons() {
  const { data, error, loading, reload } = useFetch(() =>
    api<Items<Coupon>>('/coupons').then((d) => d.items),
  );
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<unknown>(null);

  const set = (key: keyof typeof EMPTY_FORM) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      await api('/coupons', {
        method: 'POST',
        body: {
          code: form.code,
          type: form.type,
          value: Number(form.value),
          minOrder: Number(form.minOrder) || 0,
          maxUses: Number(form.maxUses) || 0,
          ...(form.expiresAt && { expiresAt: form.expiresAt }),
        },
      });
      setForm({ ...form, code: '', value: '' });
      reload();
    } catch (err) {
      setFormError(err);
    }
  };

  const toggle = async (c: Coupon) => {
    await api(`/coupons/${c._id}`, { method: 'PATCH', body: { isActive: !c.isActive } });
    reload();
  };

  return (
    <>
      <h1>Coupons</h1>
      <form className="card coupon-form" onSubmit={create}>
        <input placeholder="CODE" aria-label="Code" value={form.code} onChange={set('code')} required />
        <select value={form.type} onChange={set('type')} aria-label="Discount type">
          <option value="percent">% off</option>
          <option value="fixed">$ off</option>
        </select>
        <input
          type="number"
          placeholder="Value"
          aria-label="Value"
          min="0"
          step="0.01"
          value={form.value}
          onChange={set('value')}
          required
        />
        <input
          type="number"
          placeholder="Min order"
          aria-label="Minimum order"
          min="0"
          value={form.minOrder}
          onChange={set('minOrder')}
        />
        <input
          type="number"
          placeholder="Max uses"
          aria-label="Maximum uses"
          min="0"
          value={form.maxUses}
          onChange={set('maxUses')}
        />
        <input
          type="date"
          value={form.expiresAt}
          onChange={set('expiresAt')}
          title="Expires"
          aria-label="Expires"
        />
        <button className="primary">Create</button>
      </form>
      <ErrorText error={formError || error} />

      {loading ? (
        <Spinner />
      ) : !data?.length ? (
        <Empty>No coupons yet.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table card">
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Min order</th>
                <th>Used</th>
                <th>Expires</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c._id} className={c.isActive ? '' : 'faded'}>
                  <td>
                    <code>{c.code}</code>
                  </td>
                  <td>{c.type === 'percent' ? `${c.value}%` : money(c.value)}</td>
                  <td>{c.minOrder ? money(c.minOrder) : '–'}</td>
                  <td>
                    {c.usedCount}
                    {c.maxUses ? ` / ${c.maxUses}` : ''}
                  </td>
                  <td>{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : 'never'}</td>
                  <td>
                    <button className="link" onClick={() => toggle(c)} title="Click to switch on or off">
                      {c.isActive ? 'Active' : 'Disabled'}
                    </button>
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
