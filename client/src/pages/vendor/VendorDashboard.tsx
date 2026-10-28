import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../../api/client';
import { ErrorText, Spinner, useFetch } from '../../components/ui';

interface VendorStats {
  sales: { orders: number; revenue: number; payout: number; commission: number };
  byStatus: Record<string, number>;
  products: number;
  lowStock: { _id: string; title: string; stock: number }[];
}

export default function VendorDashboard() {
  const { data, error, loading } = useFetch(() => api<VendorStats>('/vendors/me/stats'));
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorText error={error} />;

  const { sales, byStatus, products, lowStock } = data;
  const toShip = (byStatus.placed || 0) + (byStatus.packed || 0);

  return (
    <>
      <h1>Overview</h1>
      <div className="stats">
        <Stat label="Revenue" value={money(sales.revenue)} />
        <Stat label="Your payout" value={money(sales.payout)} />
        <Stat label="Commission paid" value={money(sales.commission)} />
        <Stat label="Orders" value={sales.orders} />
        <Stat label="Waiting to ship" value={toShip} />
        <Stat label="Products" value={products} />
      </div>

      <section className="card">
        <h3>Low stock</h3>
        {lowStock.length ? (
          lowStock.map((p) => (
            <div key={p._id} className="row">
              <Link to={`/vendor/products/${p._id}/edit`}>{p.title}</Link>
              <span className={p.stock ? '' : 'error'}>{p.stock} left</span>
            </div>
          ))
        ) : (
          <p className="muted">Everything is well stocked.</p>
        )}
      </section>
    </>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="card stat">
      <span className="muted small">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
