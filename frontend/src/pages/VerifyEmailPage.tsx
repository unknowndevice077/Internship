import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api } from "../api/client";
import { useAuth } from "../auth/useAuth";

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const { me, refreshMe } = useAuth();
  const [state, setState] = useState<"checking" | "ok" | "failed">("checking");
  const sent = useRef(false);

  useEffect(() => {
    // StrictMode runs effects twice in dev
    if (sent.current) return;
    sent.current = true;
    api("/auth/verify-email/", { method: "POST", body: { token: params.get("token") }, auth: false })
      .then(() => {
        setState("ok");
        if (me) refreshMe();
      })
      .catch(() => setState("failed"));
  }, [params, me, refreshMe]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand brand-lg">Sprintboard</div>
        <h1>Email confirmation</h1>
        {state === "checking" && <p>Checking your link…</p>}
        {state === "ok" && <p role="status">Your email is confirmed.</p>}
        {state === "failed" && (
          <p className="form-error">This link is invalid or has expired. Sign in to send a new one.</p>
        )}
        <p className="muted">
          <Link to="/">{me ? "Go to Sprintboard" : "Sign in"}</Link>
        </p>
      </div>
    </div>
  );
}
