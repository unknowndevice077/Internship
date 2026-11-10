import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api, fieldErrors } from "../api/client";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api("/auth/password-reset/confirm/", {
        method: "POST",
        body: { uid: params.get("uid"), token: params.get("token"), password },
        auth: false,
      });
      setDone(true);
    } catch (err) {
      const fields = fieldErrors(err);
      setErrors(Object.keys(fields).length ? fields : { token: "Could not reset the password." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand brand-lg">Sprintboard</div>
        <h1>Choose a new password</h1>
        {done ? (
          <p role="status">
            Password updated. <Link to="/login">Sign in</Link>
          </p>
        ) : (
          <>
            <label>
              New password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
                autoFocus
              />
              {errors.password && <span className="field-error">{errors.password}</span>}
            </label>
            {errors.token && (
              <p className="form-error">
                {errors.token} <Link to="/forgot-password">Request a new link</Link>
              </p>
            )}
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Set password"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
