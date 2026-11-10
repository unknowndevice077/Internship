import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { fieldErrors } from "../api/client";
import { useAuth } from "../auth/useAuth";

export default function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState({ full_name: "", email: "", password: "", workspace_name: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [field]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await register({ ...form, workspace_name: form.workspace_name || undefined });
    } catch (err) {
      setErrors(fieldErrors(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand brand-lg">Sprintboard</div>
        <h1>Create your workspace</h1>
        <label>
          Your name
          <input value={form.full_name} onChange={set("full_name")} />
        </label>
        <label>
          Work email
          <input type="email" value={form.email} onChange={set("email")} required />
          {errors.email && <span className="field-error">{errors.email}</span>}
        </label>
        <label>
          Password
          <input type="password" value={form.password} onChange={set("password")} required minLength={8} />
          {errors.password && <span className="field-error">{errors.password}</span>}
        </label>
        <label>
          Company / workspace name
          <input
            value={form.workspace_name}
            onChange={set("workspace_name")}
            placeholder="Leave empty if you were invited"
          />
          {errors.workspace_name && <span className="field-error">{errors.workspace_name}</span>}
        </label>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
        <p className="muted">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
