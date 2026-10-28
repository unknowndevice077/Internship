import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import SearchBox from './SearchBox';
import ThemeToggle from './ThemeToggle';

function VerifyBanner() {
  const [sent, setSent] = useState(false);
  return (
    <div className="banner" role="status">
      <div className="container">
        Please confirm your email address, we sent you a link.{' '}
        {sent ? (
          <span>Sent again, check your inbox.</span>
        ) : (
          <button
            className="link"
            onClick={() => api('/auth/resend-verification', { method: 'POST' }).then(() => setSent(true))}
          >
            Resend it
          </button>
        )}
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { cart } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="topbar">
        <div className="container topbar-inner">
          <Link to="/" className="logo">
            vendora
          </Link>
          <SearchBox />
          <nav className="nav" aria-label="Account">
            {user?.role === 'vendor' && <NavLink to="/vendor">Seller hub</NavLink>}
            {user?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
            {user?.role === 'customer' && (
              <>
                <NavLink to="/wishlist">Saved</NavLink>
                <NavLink to="/orders">Orders</NavLink>
              </>
            )}
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
              <NavLink to="/cart" className="cart-link" aria-label={`Cart, ${cart.count} items`}>
                Cart {/* keyed on the count so the bump animation replays when it changes */}
                <span key={cart.count} className="cart-count bump">
                  {cart.count}
                </span>
              </NavLink>
            )}
            <ThemeToggle />
          </nav>
        </div>
      </header>
      {user && !user.emailVerified && <VerifyBanner />}
      <main id="main" className="container page" tabIndex={-1}>
        <div key={location.pathname} className="page-enter">
          <Outlet />
        </div>
      </main>
      <footer className="footer">
        <div className="container">Vendora marketplace · payments run in Stripe test mode</div>
      </footer>
    </>
  );
}
