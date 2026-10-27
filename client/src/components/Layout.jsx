import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const { cart } = useCart();
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  const onSearch = (e) => {
    e.preventDefault();
    navigate(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : '/');
  };

  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <Link to="/" className="logo">
            vendora
          </Link>
          <form className="search" onSubmit={onSearch}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products, brands…" />
            <button type="submit">Search</button>
          </form>
          <nav className="nav">
            {user?.role === 'vendor' && <NavLink to="/vendor">Seller hub</NavLink>}
            {user?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
            {user?.role === 'customer' && <NavLink to="/orders">Orders</NavLink>}
            {user ? (
              <button
                className="link"
                onClick={async () => {
                  await logout();
                  navigate('/');
                }}
              >
                Log out
              </button>
            ) : (
              <NavLink to="/login">Sign in</NavLink>
            )}
            {(!user || user.role === 'customer') && (
              <NavLink to="/cart" className="cart-link">
                Cart <span className="cart-count">{cart.count}</span>
              </NavLink>
            )}
          </nav>
        </div>
      </header>
      <main className="container page">
        <Outlet />
      </main>
      <footer className="footer">
        <div className="container">Vendora marketplace · payments run in Stripe test mode</div>
      </footer>
    </>
  );
}
