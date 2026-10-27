import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ErrorText } from '../components/ui';
import { homeFor } from './Login';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'customer' });
  const [error, setError] = useState(null);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
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
        <input placeholder="Full name" value={form.name} onChange={set('name')} required />
        <input type="email" placeholder="Email" value={form.email} onChange={set('email')} required />
        <input
          type="password"
          placeholder="Password (8+ characters)"
          minLength={8}
          value={form.password}
          onChange={set('password')}
          required
        />
        <div className="role-pick">
          {[
            ['customer', 'I want to shop'],
            ['vendor', 'I want to sell'],
          ].map(([value, label]) => (
            <label key={value} className={form.role === value ? 'active' : ''}>
              <input type="radio" name="role" value={value} checked={form.role === value} onChange={set('role')} />
              {label}
            </label>
          ))}
        </div>
        <button className="primary">Create account</button>
        <ErrorText error={error} />
      </form>
      <p>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}
