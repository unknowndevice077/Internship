import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ErrorText, Spinner } from '../components/ui';

// pages people land on from the links in our emails

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email } });
      setSent(true);
    } catch (err) {
      setError(err);
    }
  };

  return (
    <div className="auth-box card">
      <h1>Reset password</h1>
      {sent ? (
        <p role="status">If {email} has an account, a reset link is on its way. It works for an hour.</p>
      ) : (
        <form onSubmit={submit} className="stack">
          <p className="muted">Enter your email and we'll send you a link to set a new password.</p>
          <input
            type="email"
            placeholder="Email"
            aria-label="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button className="primary">Send reset link</button>
          <ErrorText error={error} />
        </form>
      )}
      <p>
        <Link to="/login">Back to sign in</Link>
      </p>
    </div>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token: params.get('token'), password } });
      setDone(true);
    } catch (err) {
      setError(err);
    }
  };

  return (
    <div className="auth-box card">
      <h1>Choose a new password</h1>
      {done ? (
        <p role="status">
          Password changed. You've been signed out everywhere, <Link to="/login">sign in again</Link>.
        </p>
      ) : (
        <form onSubmit={submit} className="stack">
          <input
            type="password"
            placeholder="New password (8+ characters)"
            aria-label="New password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button className="primary">Save password</button>
          <ErrorText error={error} />
        </form>
      )}
    </div>
  );
}

export function VerifyEmail() {
  const [params] = useSearchParams();
  const { user, setUser } = useAuth();
  const [state, setState] = useState<'working' | 'done' | Error>('working');
  const started = useRef(false);

  useEffect(() => {
    // tokens are single use, so don't let StrictMode's double effect spend it twice
    if (started.current) return;
    started.current = true;
    api('/auth/verify-email', { method: 'POST', body: { token: params.get('token') } })
      .then(() => setState('done'))
      .catch((err: Error) => setState(err));
  }, [params]);

  useEffect(() => {
    if (state === 'done' && user && !user.emailVerified) setUser({ ...user, emailVerified: true });
  }, [state, user, setUser]);

  return (
    <div className="auth-box card">
      <h1>Confirm email</h1>
      {state === 'working' && <Spinner />}
      {state === 'done' && (
        <p role="status">
          Thanks, your email is confirmed. <Link to="/">Start shopping</Link>
        </p>
      )}
      {state instanceof Error && <ErrorText error={state} />}
    </div>
  );
}
