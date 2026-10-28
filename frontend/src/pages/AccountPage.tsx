import { useMutation } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useState, type FormEvent } from "react";

import { api, fieldErrors, session } from "../api/client";
import { useAuth } from "../auth/useAuth";

export default function AccountPage() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="muted small">Signed in as {useAuth().me?.email}</p>
          <h1>Account</h1>
        </div>
      </header>
      <Profile />
      <Password />
      <TwoFactor />
    </div>
  );
}

function Profile() {
  const { me, refreshMe } = useAuth();
  const [name, setName] = useState(me?.full_name ?? "");
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () => api("/auth/me/", { method: "PATCH", body: { full_name: name } }),
    onSuccess: async () => {
      await refreshMe();
      setSaved(true);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    save.mutate();
  }

  return (
    <section className="card settings-section">
      <h2>Profile</h2>
      <form className="account-form" onSubmit={submit}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} />
        </label>
        <div className="row-inline">
          <button className="btn btn-primary" disabled={save.isPending}>
            Save
          </button>
          {saved && <span role="status">Saved.</span>}
        </div>
      </form>
    </section>
  );
}

function Password() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const change = useMutation({
    mutationFn: () =>
      api<{ access: string; refresh: string }>("/auth/password/change/", {
        method: "POST",
        body: { current_password: current, new_password: next },
      }),
    onSuccess: (tokens) => {
      // other devices were signed out, so this one needs the new tokens
      session.setTokens(tokens.access, tokens.refresh);
      setCurrent("");
      setNext("");
      setDone(true);
    },
    onError: (err) => setErrors(fieldErrors(err)),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setDone(false);
    change.mutate();
  }

  return (
    <section className="card settings-section">
      <h2>Password</h2>
      <form className="account-form" onSubmit={submit}>
        <label>
          Current password
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          {errors.current_password && <span className="field-error">{errors.current_password}</span>}
        </label>
        <label>
          New password
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required />
          {errors.new_password && <span className="field-error">{errors.new_password}</span>}
        </label>
        <div className="row-inline">
          <button className="btn btn-primary" disabled={change.isPending}>
            Change password
          </button>
          {done && <span role="status">Password changed. Other devices were signed out.</span>}
        </div>
      </form>
    </section>
  );
}

type Setup = { secret: string; otpauth_url: string };

function TwoFactor() {
  const { me, refreshMe } = useAuth();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recovery, setRecovery] = useState<string[]>([]);
  const [disabling, setDisabling] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const start = useMutation({
    mutationFn: () => api<Setup>("/auth/2fa/setup/", { method: "POST" }),
    onSuccess: setSetup,
  });
  const enable = useMutation({
    mutationFn: () => api<{ recovery_codes: string[] }>("/auth/2fa/enable/", { method: "POST", body: { code } }),
    onSuccess: async (res) => {
      setRecovery(res.recovery_codes);
      setSetup(null);
      setCode("");
      await refreshMe();
    },
    onError: (err) => setErrors(fieldErrors(err)),
  });
  const disable = useMutation({
    mutationFn: () => api("/auth/2fa/disable/", { method: "POST", body: { password, code } }),
    onSuccess: async () => {
      setDisabling(false);
      setPassword("");
      setCode("");
      await refreshMe();
    },
    onError: (err) => setErrors(fieldErrors(err)),
  });

  function submitEnable(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    enable.mutate();
  }

  function submitDisable(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    disable.mutate();
  }

  return (
    <section className="card settings-section">
      <h2>Two-factor authentication</h2>

      {recovery.length > 0 && (
        <div className="notice recovery">
          <div>
            <strong>Save these recovery codes.</strong> Each one works once if you lose your phone. They won&apos;t be
            shown again.
            <ul className="recovery-codes">
              {recovery.map((c) => (
                <li key={c}>
                  <code>{c}</code>
                </li>
              ))}
            </ul>
            <button className="btn" onClick={() => setRecovery([])}>
              I&apos;ve saved them
            </button>
          </div>
        </div>
      )}

      {!me?.totp_enabled && !setup && (
        <>
          <p className="muted">
            Ask for a code from an authenticator app (Google Authenticator, 1Password, Authy) when you sign in.
          </p>
          <button className="btn btn-primary" onClick={() => start.mutate()} disabled={start.isPending}>
            Set up
          </button>
        </>
      )}

      {setup && (
        <form className="account-form" onSubmit={submitEnable}>
          <p>Scan this with your authenticator app, then enter the 6-digit code it shows.</p>
          <div className="qr">
            <QRCodeSVG value={setup.otpauth_url} size={160} />
          </div>
          <p className="muted small">
            Can&apos;t scan? Enter this key instead: <code>{setup.secret}</code>
          </p>
          <label>
            Code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
            />
            {errors.code && <span className="field-error">{errors.code}</span>}
          </label>
          <div className="row-inline">
            <button className="btn btn-primary" disabled={enable.isPending}>
              Turn on
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setSetup(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {me?.totp_enabled && !disabling && (
        <>
          <p role="status">Two-factor authentication is on.</p>
          <button className="btn" onClick={() => setDisabling(true)}>
            Turn off
          </button>
        </>
      )}

      {me?.totp_enabled && disabling && (
        <form className="account-form" onSubmit={submitDisable}>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {errors.password && <span className="field-error">{errors.password}</span>}
          </label>
          <label>
            Code or recovery code
            <input value={code} onChange={(e) => setCode(e.target.value)} required />
            {errors.code && <span className="field-error">{errors.code}</span>}
          </label>
          <div className="row-inline">
            <button className="btn btn-danger" disabled={disable.isPending}>
              Turn off
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setDisabling(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
