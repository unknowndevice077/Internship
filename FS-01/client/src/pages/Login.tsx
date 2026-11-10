import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ErrorText } from '../components/ui';
import type { Role } from '../types';

export const homeFor = (role: Role) => ({ vendor: '/vendor', admin: '/admin', customer: '/' })[role];

const DEMO = [
  ['Customer', 'customer@vendora.test'],
  ['Vendor', 'vendor@vendora.test'],
  ['Admin', 'admin@vendora.test'],
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login(email, password);
      navigate(location.state?.from || homeFor(user.role), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-box card">
      <h1>Sign in</h1>
      <form onSubmit={submit} className="stack">
        <input
          type="email"
          placeholder="Email"
          aria-label="Email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          aria-label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button className="primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <ErrorText error={error} />
      </form>
      <p>
        <Link to="/forgot-password">Forgot your password?</Link>
      </p>
      <p>
        New here? <Link to="/register">Create an account</Link>
      </p>
      <div className="demo-logins">
        <span className="muted small">Demo accounts (after seeding):</span>
        {DEMO.map(([label, demoEmail]) => (
          <button
            key={label}
            type="button"
            className="link"
            onClick={() => {
              setEmail(demoEmail);
              setPassword('demo-pass-123');
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
