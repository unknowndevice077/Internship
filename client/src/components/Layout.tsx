import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, imageUrl, money } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const { cart } = useCart();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);

  // wait for a pause in typing before asking the API
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      api(`/products/suggest?q=${encodeURIComponent(term)}`)
        .then((res) => setSuggestions(res.items))
        .catch(() => setSuggestions([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [q]);

  const onSearch = (e) => {
    e.preventDefault();
    setOpen(false);
    navigate(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : '/');
  };

  const pick = (id) => {
    setOpen(false);
    setQ('');
    navigate(`/products/${id}`);
  };

  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <Link to="/" className="logo">
            vendora
          </Link>
          <form className="search" onSubmit={onSearch}>
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
              placeholder="Search products, brands…"
              aria-label="Search"
            />
            <button type="submit">Search</button>
            {open && suggestions.length > 0 && (
              <ul className="suggestions" role="listbox">
                {suggestions.map((item) => (
                  <li key={item._id}>
                    <button type="button" onMouseDown={() => pick(item._id)}>
                      {item.image && <img src={imageUrl(item.image)} alt="" />}
                      <span className="suggestion-title">{item.title}</span>
                      <span className="muted small">{money(item.price)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
