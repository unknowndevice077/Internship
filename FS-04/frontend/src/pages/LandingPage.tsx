import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";

import ThemeToggle from "../components/ThemeToggle";
import { DEMO_LOGIN } from "../platform";

const FEATURES = [
  {
    title: "A board that keeps up",
    body: "Drag cards between columns, filter as you type and open any issue without leaving the board.",
  },
  {
    title: "Your workflow, not ours",
    body: "Name your own statuses per project and decide which moves between them are allowed.",
  },
  {
    title: "Sprints with a burndown",
    body: "Plan from the backlog, watch the points burn down, and get a report when the sprint closes.",
  },
  {
    title: "One workspace per company",
    body: "Owners, admins, members and viewers. Nobody outside a workspace can tell it exists.",
  },
  {
    title: "Hooks into your tools",
    body: "Signed webhooks with retries, in-app and email notifications, CSV and JSON exports.",
  },
  {
    title: "Locked down by default",
    body: "Two-factor sign-in, rotating sessions, account lockout, rate limits and upload scanning.",
  },
];

const PLANS = [
  { name: "Free", price: 0, points: ["3 projects", "5 members", "Kanban, backlog and sprints", "Custom workflows"] },
  { name: "Pro", price: 29, points: ["25 projects", "25 members", "Webhooks", "5 GB storage"], featured: true },
  { name: "Business", price: 99, points: ["Unlimited projects", "Unlimited members", "Webhooks", "50 GB storage"] },
];

const COLUMNS = [
  { name: "To do", cards: ["Invite flow copy", "Export to CSV"] },
  { name: "In progress", cards: ["Sprint burndown", "Webhook retries"] },
  { name: "Done", cards: ["Two-factor sign-in", "Dark theme", "Command palette"] },
];

// fades a block in the first time it scrolls into view
function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.classList.add("seen");
        observer.disconnect();
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${className}`}>
      {children}
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="brand brand-lg">Sprintboard</div>
        <nav>
          <a href="#features">Features</a>
          <a href="#plans">Plans</a>
          <ThemeToggle />
          <Link className="btn" to="/login">
            Sign in
          </Link>
          <Link className="btn btn-primary" to="/register">
            Get started
          </Link>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Project tracking for small teams</span>
          <h1>
            Plan the sprint.
            <br />
            <em>Ship the work.</em>
          </h1>
          <p>
            Sprintboard gives every company its own workspace with a Kanban board, a backlog, sprints and reports,
            without the weight of the big trackers.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary btn-lg" to="/register">
              Create a workspace
            </Link>
            {DEMO_LOGIN && (
              <Link className="btn btn-lg" to="/login?demo=1">
                Try the demo
              </Link>
            )}
          </div>
          <p className="muted small">Free for 5 people and 3 projects. No card needed.</p>
        </div>

        <div className="hero-board" aria-hidden="true">
          <div className="hero-board-bar">
            <i />
            <i />
            <i />
            <span>WEB board</span>
          </div>
          <div className="hero-columns">
            {COLUMNS.map((col) => (
              <div key={col.name} className="hero-column">
                <h4>
                  {col.name} <span>{col.cards.length}</span>
                </h4>
                {col.cards.map((card, i) => (
                  <div key={card} className="hero-card" style={{ animationDelay: `${0.25 + i * 0.08}s` }}>
                    {card}
                    <small>
                      <b className={`type-icon type-${["task", "story", "bug"][i % 3]}`} />
                      WEB-{card.length + i}
                    </small>
                  </div>
                ))}
              </div>
            ))}
            <div className="hero-card hero-flying">
              Burndown chart
              <small>
                <b className="type-icon type-story" />
                WEB-31
              </small>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="landing-section">
        <Reveal>
          <h2>Everything a team needs to run a sprint</h2>
          <p className="muted">And nothing you have to configure for a week first.</p>
        </Reveal>
        <div className="feature-grid">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} className={`delay-${i % 3}`}>
              <article className="feature">
                <span className="feature-mark">{String(i + 1).padStart(2, "0")}</span>
                <h3>{f.title}</h3>
                <p className="muted">{f.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="plans" className="landing-section">
        <Reveal>
          <h2>Simple plans</h2>
          <p className="muted">Start free and upgrade from the billing page when the team grows.</p>
        </Reveal>
        <div className="landing-plans">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.name} className={`delay-${i}`}>
              <article className={`landing-plan ${plan.featured ? "featured" : ""}`}>
                <h3>{plan.name}</h3>
                <p className="price">
                  ${plan.price}
                  <span> / month</span>
                </p>
                <ul>
                  {plan.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <Link className={`btn ${plan.featured ? "btn-primary" : ""}`} to="/register">
                  {plan.price ? "Start free, upgrade later" : "Start free"}
                </Link>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <div className="brand">Sprintboard</div>
        <span className="muted small">Django, React and PostgreSQL. Payments run in Stripe test mode.</span>
        <a className="small" href="/api/docs/">
          API docs
        </a>
      </footer>
    </div>
  );
}
