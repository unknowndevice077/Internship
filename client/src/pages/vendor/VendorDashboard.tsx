import { Link } from 'react-router-dom';
import { api, money } from '../../api/client';
import { CountUp } from '../../components/motion';
import { ErrorText, Spinner, useFetch, useTitle } from '../../components/ui';

interface VendorStats {
  sales: { orders: number; revenue: number; payout: number; commission: number };
  byStatus: Record<string, number>;
  products: number;
  lowStock: { _id: string; title: string; stock: number }[];
}

const STATUSES = ['placed', 'packed', 'shipped', 'delivered', 'cancelled'];

export default function VendorDashboard() {
  const { data, error, loading } = useFetch(() => api<VendorStats>('/vendors/me/stats'));
  useTitle('Seller hub');
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorText error={error} />;

  const { sales, byStatus, products, lowStock } = data;
  const toShip = (byStatus.placed || 0) + (byStatus.packed || 0);
  const allOrders = STATUSES.reduce((sum, s) => sum + (byStatus[s] || 0), 0);

  return (
    <>
      <h1>Overview</h1>
      <div className="stats">
        <Stat label="Revenue" value={sales.revenue} money />
        <Stat label="Your payout" value={sales.payout} money />
        <Stat label="Commission paid" value={sales.commission} money />
        <Stat label="Orders" value={sales.orders} />
        <Stat label="Waiting to ship" value={toShip} />
        <Stat label="Products" value={products} />
      </div>

      <section className="card">
        <h3>Orders by status</h3>
        {allOrders ? (
          STATUSES.map((s) => (
            <div key={s} className="status-bar">
              <span>{s}</span>
              <div className="bar">
                <div style={{ width: `${((byStatus[s] || 0) / allOrders) * 100}%` }} />
              </div>
              <span className="muted">{byStatus[s] || 0}</span>
            </div>
          ))
        ) : (
          <p className="muted">No orders yet.</p>
        )}
      </section>

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

export function Stat({ label, value, money: isMoney }: { label: string; value: number; money?: boolean }) {
  return (
    <div className="card stat">
      <span className="muted small">{label}</span>
      <strong>
        <CountUp value={value} format={isMoney ? money : String} />
      </strong>
    </div>
  );
}
