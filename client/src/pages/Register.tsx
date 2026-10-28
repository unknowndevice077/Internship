import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, type RegisterForm } from '../context/AuthContext';
import { ErrorText } from '../components/ui';
import { homeFor } from './Login';

const ROLES = [
  ['customer', 'I want to shop'],
  ['vendor', 'I want to sell'],
] as const;

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<RegisterForm>({ name: '', email: '', password: '', role: 'customer' });
  const [error, setError] = useState<unknown>(null);

  const set = (key: keyof RegisterForm) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const user = await register(form);
      navigate(homeFor(user.role));
    } catch (err) {
      setError(err);
    }
  };

  return (
    <div className="auth-box card">
      <h1>Create account</h1>
      <form onSubmit={submit} className="stack">
        <input
          placeholder="Full name"
          aria-label="Full name"
          autoComplete="name"
          value={form.name}
          onChange={set('name')}
          required
        />
        <input
          type="email"
          placeholder="Email"
          aria-label="Email"
          autoComplete="email"
          value={form.email}
          onChange={set('email')}
          required
        />
        <input
          type="password"
          placeholder="Password (8+ characters)"
          aria-label="Password"
          autoComplete="new-password"
          minLength={8}
          value={form.password}
          onChange={set('password')}
          required
        />
        <fieldset className="role-pick">
          <legend className="sr-only">Account type</legend>
          {ROLES.map(([value, label]) => (
            <label key={value} className={form.role === value ? 'active' : ''}>
              <input
                type="radio"
                name="role"
                value={value}
                checked={form.role === value}
                onChange={set('role')}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <button className="primary">Create account</button>
        <ErrorText error={error} />
      </form>
      <p>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}
