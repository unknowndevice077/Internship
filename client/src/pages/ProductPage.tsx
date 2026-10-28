import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, imageUrl, money } from '../api/client';
import { ErrorText, Spinner, Stars, useFetch } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import type { Items, Product, ProductSummary, Review } from '../types';
import { ProductCard } from './Shop';

function shippingNote(vendor: Product['vendor']) {
  if (!vendor.shippingFee) return 'Free shipping';
  if (vendor.freeShippingOver != null) {
    return `${money(vendor.shippingFee)} shipping, free over ${money(vendor.freeShippingOver)} from this store`;
  }
  return `${money(vendor.shippingFee)} shipping`;
}

function SaveButton({ productId }: { productId: string }) {
  const saved = useFetch(
    () => api<Items<ProductSummary>>('/me/wishlist').then((d) => d.items.some((p) => p._id === productId)),
    [productId],
  );
  const [on, setOn] = useState<boolean | null>(null);
  const isOn = on ?? saved.data ?? false;

  const toggle = async () => {
    await api(`/me/wishlist/${productId}`, { method: isOn ? 'DELETE' : 'PUT' });
    setOn(!isOn);
  };

  return (
    <button type="button" className="save-button" aria-pressed={isOn} onClick={toggle}>
      {isOn ? '♥ Saved' : '♡ Save'}
    </button>
  );
}

function RecentlyViewed({ exclude }: { exclude: string }) {
  const { data } = useFetch(() => api<Items<ProductSummary>>('/me/recent'), [exclude]);
  const items = data?.items.filter((p) => p._id !== exclude).slice(0, 6) ?? [];
  if (!items.length) return null;
  return (
    <section className="recent">
      <h2>Recently viewed</h2>
      <div className="grid">
        {items.map((p) => (
          <ProductCard key={p._id} p={p} />
        ))}
      </div>
    </section>
  );
}

export default function ProductPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const { add } = useCart();
  const navigate = useNavigate();
  const product = useFetch(() => api<{ product: Product }>(`/products/${id}`).then((d) => d.product), [id]);
  const reviews = useFetch(() => api<Items<Review>>(`/products/${id}/reviews`).then((d) => d.items), [id]);

  const [active, setActive] = useState(0);
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const isCustomer = user?.role === 'customer';

  useEffect(() => {
    if (isCustomer) api(`/me/recent/${id}`, { method: 'POST' }).catch(() => {});
  }, [id, isCustomer]);

  if (product.loading) return <Spinner />;
  if (product.error || !product.data) return <ErrorText error={product.error} />;
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
                <button
                  key={src}
                  className={i === active ? 'active' : ''}
                  onClick={() => setActive(i)}
                  aria-label={`Show image ${i + 1}`}
                  aria-pressed={i === active}
                >
                  <img src={imageUrl(src)} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <h1>{p.title}</h1>
          <p className="muted">
            {p.brand && <>by {p.brand} · </>}sold by{' '}
            <Link to={`/stores/${p.vendor.slug}`}>{p.vendor.storeName}</Link>
          </p>
          <Stars value={p.ratingAvg} count={p.ratingCount} />
          <div className="price big">{money(p.price)}</div>
          <p>{p.description}</p>
          <p className={p.stock > 0 ? 'ok' : 'error'}>
            {p.stock > 0 ? `${p.stock} in stock` : 'Out of stock'}
            {p.stock > 0 && p.stock <= 5 && <span className="warn"> · selling fast</span>}
          </p>
          <p className="muted small">{shippingNote(p.vendor)}</p>

          {(!user || isCustomer) && (
            <div className="buy-row">
              {p.stock > 0 && (
                <>
                  <select value={qty} onChange={(e) => setQty(Number(e.target.value))} aria-label="Quantity">
                    {Array.from({ length: Math.min(10, p.stock) }, (_, i) => i + 1).map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                  <button className="primary" onClick={addToCart}>
                    Add to cart
                  </button>
                </>
              )}
              {isCustomer && <SaveButton productId={p._id} />}
              {msg && (
                <Link to="/cart" className="ok" role="status">
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
        {isCustomer && (
          <ReviewForm
            productId={id}
            onSaved={() => {
              reviews.reload();
              product.reload();
            }}
          />
        )}
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

      {isCustomer && <RecentlyViewed exclude={p._id} />}
    </>
  );
}

function ReviewForm({ productId, onSaved }: { productId: string; onSaved: () => void }) {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: FormEvent) => {
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
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What did you think?"
        aria-label="Your review"
        rows={3}
      />
      <button type="submit">Post review</button>
      <ErrorText error={error} />
    </form>
  );
}
