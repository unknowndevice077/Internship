import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { api, ApiError } from "../api/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/password-reset/", { method: "POST", body: { email }, auth: false });
      setSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : "Could not send the email.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand brand-lg">Sprintboard</div>
        <h1>Reset password</h1>
        {sent ? (
          <p role="status">If an account exists for {email}, we sent a link to reset the password.</p>
        ) : (
          <>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </>
        )}
        <p className="muted">
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </div>
  );
}
