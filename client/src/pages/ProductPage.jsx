import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, imageUrl, money } from '../api/client';
import { ErrorText, Spinner, Stars, useFetch } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

export default function ProductPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { add } = useCart();
  const navigate = useNavigate();
  const product = useFetch(() => api(`/products/${id}`).then((d) => d.product), [id]);
  const reviews = useFetch(() => api(`/products/${id}/reviews`).then((d) => d.items), [id]);

  const [active, setActive] = useState(0);
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  if (product.loading) return <Spinner />;
  if (product.error) return <ErrorText error={product.error} />;
  const p = product.data;

  const addToCart = async () => {
    if (!user) return navigate('/login', { state: { from: `/products/${id}` } });
    setError(null);
    try {
      await add(p._id, qty);
      setMsg('Added to cart');
    } catch (err) {
      setError(err);
    }
  };

  return (
    <>
      <div className="product-page">
        <div>
          <div className="main-image card">
            {p.images[active] && <img src={imageUrl(p.images[active])} alt={p.title} />}
          </div>
          {p.images.length > 1 && (
            <div className="thumbs">
              {p.images.map((src, i) => (
                <button key={src} className={i === active ? 'active' : ''} onClick={() => setActive(i)}>
                  <img src={imageUrl(src)} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <h1>{p.title}</h1>
          <p className="muted">
            {p.brand && <>by {p.brand} · </>}sold by <Link to={`/stores/${p.vendor.slug}`}>{p.vendor.storeName}</Link>
          </p>
          <Stars value={p.ratingAvg} count={p.ratingCount} />
          <div className="price big">{money(p.price)}</div>
          <p>{p.description}</p>
          <p className={p.stock > 0 ? 'ok' : 'error'}>{p.stock > 0 ? `${p.stock} in stock` : 'Out of stock'}</p>

          {(!user || user.role === 'customer') && p.stock > 0 && (
            <div className="buy-row">
              <select value={qty} onChange={(e) => setQty(Number(e.target.value))}>
                {Array.from({ length: Math.min(10, p.stock) }, (_, i) => i + 1).map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
              <button className="primary" onClick={addToCart}>
                Add to cart
              </button>
              {msg && (
                <Link to="/cart" className="ok">
                  {msg} · view cart
                </Link>
              )}
            </div>
          )}
          <ErrorText error={error} />
        </div>
      </div>

      <section className="reviews">
        <h2>Customer reviews</h2>
        {user?.role === 'customer' && <ReviewForm productId={id} onSaved={() => { reviews.reload(); product.reload(); }} />}
        {reviews.data?.length === 0 && <p className="muted">No reviews yet.</p>}
        {reviews.data?.map((r) => (
          <div key={r._id} className="review">
            <Stars value={r.rating} /> <strong>{r.title}</strong>
            <div className="muted small">
              {r.user?.name} · {new Date(r.createdAt).toLocaleDateString()}
              {r.verifiedPurchase && <span className="ok"> · Verified purchase</span>}
            </div>
            {r.body && <p>{r.body}</p>}
          </div>
        ))}
      </section>
    </>
  );
}

function ReviewForm({ productId, onSaved }) {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api(`/products/${productId}/reviews`, { method: 'POST', body: { rating, body } });
      setBody('');
      onSaved();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <form className="card review-form" onSubmit={submit}>
      <label>
        Your rating{' '}
        <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} star{n > 1 && 's'}
            </option>
          ))}
        </select>
      </label>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="What did you think?" rows={3} />
      <button type="submit">Post review</button>
      <ErrorText error={error} />
    </form>
  );
}
