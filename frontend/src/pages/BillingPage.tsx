import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import { api } from "../api/client";
import { useAuth, useCan } from "../auth/AuthContext";

interface Plan {
  code: string;
  name: string;
  price_usd: number;
  max_projects: number | null;
  max_members: number | null;
  max_storage_mb: number | null;
  features: string[];
}

interface Billing {
  plan: Plan;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  has_customer: boolean;
  usage: { projects: number; members: number; storage_mb: number };
  plans: Plan[];
  stripe_enabled: boolean;
}

export default function BillingPage() {
  const { workspace, refreshMe } = useAuth();
  const isAdmin = useCan("admin");
  const isOwner = workspace?.role === "owner";
  const [params] = useSearchParams();
  const checkout = params.get("checkout");

  const { data } = useQuery({
    queryKey: ["billing"],
    queryFn: () => api<Billing>("/billing/"),
    enabled: isAdmin,
    // right after Checkout the webhook may land a second later, so poll briefly
    refetchInterval: (q) => (checkout === "success" && q.state.data?.plan.code === "free" ? 2000 : false),
  });

  const upgraded = checkout === "success" && data !== undefined && data.plan.code !== "free";
  useEffect(() => {
    // the plan shown in the sidebar comes from /auth/me, refresh it once the upgrade lands
    if (upgraded) void refreshMe();
  }, [upgraded, refreshMe]);

  const redirect = (path: string, body?: unknown) =>
    api<{ url: string }>(path, { method: "POST", body }).then(({ url }) => window.location.assign(url));
  const upgrade = useMutation({ mutationFn: (plan: string) => redirect("/billing/checkout/", { plan }) });
  const portal = useMutation({ mutationFn: () => redirect("/billing/portal/") });

  if (!isAdmin) return <div className="page">Only workspace admins can see billing.</div>;
  if (!data) return <div className="page muted">Loading…</div>;

  const current = data.plan;
  const error = upgrade.error?.message || portal.error?.message;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="muted small">{workspace?.name}</p>
          <h1>Billing</h1>
        </div>
        {isOwner && data.has_customer && (
          <button className="btn" onClick={() => portal.mutate()} disabled={portal.isPending}>
            Manage billing
          </button>
        )}
      </header>

      {checkout === "success" && (
        <div className="notice">
          {current.code === "free" ? "Payment received, activating your plan…" : `You're on ${current.name}. Thanks!`}
        </div>
      )}
      {checkout === "cancelled" && <div className="notice">Checkout cancelled. You haven't been charged.</div>}
      {!data.stripe_enabled && (
        <div className="notice">Stripe isn't configured on this server, so upgrades are disabled. See the README for setup.</div>
      )}
      {error && <p className="form-error">{error}</p>}

      <section className="card settings-section">
        <h2>
          Current plan: {current.name}
          {data.status && data.status !== "active" && <span className="badge badge-pending">{data.status}</span>}
        </h2>
        {data.current_period_end && (
          <p className="muted small">
            {data.cancel_at_period_end ? "Ends" : "Renews"} on {new Date(data.current_period_end).toLocaleDateString()}
          </p>
        )}
        <div className="usage">
          <Meter label="Projects" used={data.usage.projects} limit={current.max_projects} />
          <Meter label="Members" used={data.usage.members} limit={current.max_members} />
          <Meter label="Storage" used={data.usage.storage_mb} limit={current.max_storage_mb} unit="MB" />
        </div>
      </section>

      <div className="plans">
        {data.plans.map((plan) => (
          <div key={plan.code} className={`plan-card ${plan.code === current.code ? "current" : ""}`}>
            <h3>{plan.name}</h3>
            <div className="price">
              ${plan.price_usd}
              <span className="muted small"> / month</span>
            </div>
            <ul>
              {plan.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            {plan.code === current.code ? (
              <button className="btn" disabled>
                Current plan
              </button>
            ) : plan.price_usd === 0 ? null : current.code === "free" ? (
              <button
                className="btn btn-primary"
                disabled={!isOwner || !data.stripe_enabled || upgrade.isPending}
                title={isOwner ? undefined : "Only owners can change the plan"}
                onClick={() => upgrade.mutate(plan.code)}
              >
                Upgrade to {plan.name}
              </button>
            ) : (
              <button className="btn" disabled={!isOwner} onClick={() => portal.mutate()}>
                Switch in billing portal
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="muted small">Test mode: use card 4242 4242 4242 4242, any future date and any CVC.</p>
    </div>
  );
}

function Meter({ label, used, limit, unit = "" }: { label: string; used: number; limit: number | null; unit?: string }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div className="meter">
      <div className="meter-label">
        <span>{label}</span>
        <span className="muted small">
          {used}
          {unit && ` ${unit}`} / {limit ?? "∞"}
          {unit && limit ? ` ${unit}` : ""}
        </span>
      </div>
      <div className="meter-track">
        <div className={`meter-fill ${pct >= 90 ? "full" : ""}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
