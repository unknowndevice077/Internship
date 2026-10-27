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

export default function AdminAnalytics() {
  const [days, setDays] = useState(30);
  const { data, error, loading } = useFetch(() => api(`/admin/analytics?days=${days}`), [days]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  const { totals, daily, topVendors, topProducts, byStatus, counts } = data;

  return (
    <>
      <div className="shop-head">
        <h1>Marketplace analytics</h1>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      <div className="stats">
        <Stat label="Gross sales (GMV)" value={money(totals.gmv)} />
        <Stat label="Commission earned" value={money(totals.commission)} />
        <Stat label="Paid out to vendors" value={money(totals.payouts)} />
        <Stat label="Orders" value={totals.orders} />
        <Stat label="Avg order value" value={money(totals.avgOrderValue)} />
        <Stat label="Customers" value={counts.customers} />
        <Stat label="Live vendors" value={counts.vendors} />
        <Stat label="Awaiting approval" value={counts.pendingVendors} />
      </div>

      <section className="card chart">
        <h3>Daily sales and commission</h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={daily}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip formatter={(v) => money(v)} />
            <Line type="monotone" dataKey="gmv" name="Sales" stroke="#ea580c" strokeWidth={2} dot={false} />
            <Line
              type="monotone"
              dataKey="commission"
              name="Commission"
              stroke="#2563eb"
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
              <Tooltip formatter={(v) => money(v)} />
              <Bar dataKey="gmv" name="Sales" fill="#ea580c" />
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
