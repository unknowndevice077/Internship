import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../api/client";
import { useAuth } from "../auth/useAuth";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [needsOtp, setNeedsOtp] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password, needsOtp ? otp : undefined);
    } catch (err) {
      if (err instanceof ApiError && err.code === "otp_required") setNeedsOtp(true);
      else if (err instanceof ApiError && err.code === "invalid_otp") setError("That code didn't work.");
      else if (err instanceof ApiError && err.code === "locked") setError(err.message);
      else if (err instanceof ApiError && err.status === 401) setError("Wrong email or password.");
      else if (err instanceof ApiError && err.status === 429)
        setError("Too many attempts. Wait a minute and try again.");
      else setError("Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand brand-lg">Sprintboard</div>
        <h1>Sign in</h1>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        {needsOtp && (
          <label>
            Authentication code
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              autoComplete="one-time-code"
              placeholder="6-digit code or recovery code"
              required
              autoFocus
            />
          </label>
        )}
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <Link className="small" to="/forgot-password">
          Forgot password?
        </Link>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="muted">
          New here? <Link to="/register">Create a workspace</Link>
        </p>
      </form>
    </div>
  );
}
