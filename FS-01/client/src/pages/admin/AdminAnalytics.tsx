import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, money } from '../../api/client';
import { ErrorText, Spinner, useFetch } from '../../components/ui';
import { Stat } from '../vendor/VendorDashboard';

interface Analytics {
  totals: {
    gmv: number;
    commission: number;
    payouts: number;
    discounts: number;
    refunds: number;
    orders: number;
    avgOrderValue: number;
  };
  daily: { date: string; gmv: number; commission: number; orders: number }[];
  topVendors: { _id: string; storeName: string; gmv: number; orders: number }[];
  topProducts: { _id: string; title: string; units: number; revenue: number }[];
  byStatus: Record<string, number>;
  counts: { customers: number; vendors: number; pendingVendors: number; products: number };
}

// works on light and dark backgrounds
const GRID = 'rgba(128, 128, 128, 0.25)';
const tooltipStyle = { background: 'var(--card)', border: '1px solid var(--line)', color: 'var(--ink)' };
const asMoney = (v: unknown) => money(Number(v));

export default function AdminAnalytics() {
  const [days, setDays] = useState(30);
  const { data, error, loading } = useFetch(() => api<Analytics>(`/admin/analytics?days=${days}`), [days]);

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorText error={error} />;
  const { totals, daily, topVendors, topProducts, byStatus, counts } = data;

  return (
    <>
      <div className="shop-head">
        <h1>Marketplace analytics</h1>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Date range">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      <div className="stats">
        <Stat label="Gross sales (GMV)" value={totals.gmv} money />
        <Stat label="Commission earned" value={totals.commission} money />
        <Stat label="Paid out to vendors" value={totals.payouts} money />
        <Stat label="Refunded" value={totals.refunds} money />
        <Stat label="Orders" value={totals.orders} />
        <Stat label="Avg order value" value={totals.avgOrderValue} money />
        <Stat label="Customers" value={counts.customers} />
        <Stat label="Live vendors" value={counts.vendors} />
        <Stat label="Awaiting approval" value={counts.pendingVendors} />
      </div>

      <section className="card chart">
        <h3>Daily sales and commission</h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={daily}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip formatter={asMoney} contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey="gmv" name="Sales" stroke="#4f5bd5" strokeWidth={2} dot={false} />
            <Line
              type="monotone"
              dataKey="commission"
              name="Commission"
              stroke="#14b8a6"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <div className="two-col">
        <section className="card chart">
          <h3>Top vendors</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topVendors} layout="vertical" margin={{ left: 30 }}>
              <XAxis type="number" fontSize={12} />
              <YAxis type="category" dataKey="storeName" width={110} fontSize={12} />
              <Tooltip formatter={asMoney} contentStyle={tooltipStyle} cursor={{ fill: GRID }} />
              <Bar dataKey="gmv" name="Sales" fill="#4f5bd5" />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card">
          <h3>Best sellers</h3>
          {topProducts.map((p) => (
            <div key={p._id} className="row small">
              <span>{p.title}</span>
              <span>
                {p.units} sold · {money(p.revenue)}
              </span>
            </div>
          ))}
          <h3>Orders by status</h3>
          {Object.entries(byStatus).map(([status, count]) => (
            <div key={status} className="row small">
              <span>{status.replace('_', ' ')}</span>
              <strong>{count}</strong>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
