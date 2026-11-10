import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, imageUrl, money } from '../api/client';
import { flyToCart, Reveal } from '../components/motion';
import { ErrorState, ErrorText, Stars, useFetch, useTitle } from '../components/ui';
import { useToast } from '../components/Toast';
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

function ProductSkeleton() {
  return (
    <div className="product-page" role="status" aria-label="Loading product">
      <div className="card main-image skeleton-block" />
      <div className="stack">
        <div className="skeleton-line tall" />
        <div className="skeleton-line short" />
        <div className="skeleton-line" />
        <div className="skeleton-line" />
        <div className="skeleton-line short" />
      </div>
    </div>
  );
}

function SaveButton({ productId }: { productId: string }) {
  const saved = useFetch(
    () => api<Items<ProductSummary>>('/me/wishlist').then((d) => d.items.some((p) => p._id === productId)),
    [productId],
  );
  const [on, setOn] = useState<boolean | null>(null);
  const isOn = on ?? saved.data ?? false;
  const toast = useToast();

  const toggle = async () => {
    await api(`/me/wishlist/${productId}`, { method: isOn ? 'DELETE' : 'PUT' });
    setOn(!isOn);
    toast.show(isOn ? 'Removed from saved items' : 'Saved for later', {
      tone: 'info',
      link: isOn ? undefined : { to: '/wishlist', label: 'View saved' },
    });
  };

  return (
    <button type="button" className="save-button" aria-pressed={isOn} onClick={toggle}>
      <span className="heart" aria-hidden="true">
        {isOn ? '♥' : '♡'}
      </span>{' '}
      {isOn ? 'Saved' : 'Save'}
    </button>
  );
}

// how many reviews gave each star count, as little bars
function RatingBars({ reviews }: { reviews: Review[] }) {
  return (
    <div className="rating-bars" aria-label="Rating breakdown">
      {[5, 4, 3, 2, 1].map((n) => {
        const count = reviews.filter((r) => r.rating === n).length;
        return (
          <div key={n} className="rating-bar">
            <span>{n} star</span>
            <div className="bar">
              <div style={{ width: `${(count / reviews.length) * 100}%` }} />
            </div>
            <span className="muted">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function RecentlyViewed({ exclude }: { exclude: string }) {
  const { data } = useFetch(() => api<Items<ProductSummary>>('/me/recent'), [exclude]);
  const items = data?.items.filter((p) => p._id !== exclude).slice(0, 6) ?? [];
  if (!items.length) return null;
  return (
    <Reveal>
      <section className="recent">
        <h2>Recently viewed</h2>
        <div className="grid">
          {items.map((p) => (
            <ProductCard key={p._id} p={p} />
          ))}
        </div>
      </section>
    </Reveal>
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
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const [error, setError] = useState<unknown>(null);
  const isCustomer = user?.role === 'customer';
  const imageRef = useRef<HTMLImageElement>(null);
  useTitle(product.data?.title);

  useEffect(() => {
    if (isCustomer) api(`/me/recent/${id}`, { method: 'POST' }).catch(() => {});
  }, [id, isCustomer]);

  if (product.loading) return <ProductSkeleton />;
  if (product.error || !product.data) return <ErrorState error={product.error} onRetry={product.reload} />;
  const p = product.data;

  const addToCart = async () => {
    if (!user) return navigate('/login', { state: { from: `/products/${id}` } });
    setError(null);
    setAdding(true);
    try {
      await add(p._id, qty);
      flyToCart(imageRef.current);
      toast.show('Added to cart', { link: { to: '/cart', label: 'View cart' } });
    } catch (err) {
      setError(err);
    } finally {
      setAdding(false);
    }
  };

  // zoom follows the pointer, like a loupe
  const zoom = (e: MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 100;
    const y = ((e.clientY - box.top) / box.height) * 100;
    if (imageRef.current) imageRef.current.style.transformOrigin = `${x}% ${y}%`;
  };

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Shop</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/?category=${p.category}`}>{p.category.replace(/-/g, ' ')}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{p.title}</span>
      </nav>
      <div className="product-page">
        <div>
          <div className="main-image card" onMouseMove={zoom}>
            {p.images[active] && (
              <img
                key={p.images[active]}
                ref={imageRef}
                className="fade-in"
                src={imageUrl(p.images[active])}
                alt={p.title}
              />
            )}
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

        <div className="product-info">
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
                  <button className="primary add-button" onClick={addToCart} disabled={adding}>
                    {adding ? 'Adding…' : 'Add to cart'}
                  </button>
                </>
              )}
              {isCustomer && <SaveButton productId={p._id} />}
            </div>
          )}
          <ErrorText error={error} />
        </div>
      </div>

      <Reveal>
        <section className="reviews">
          <h2>Customer reviews</h2>
          {!!reviews.data?.length && <RatingBars reviews={reviews.data} />}
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
      </Reveal>

      {isCustomer && <RecentlyViewed exclude={p._id} />}
    </>
  );
}

function ReviewForm({ productId, onSaved }: { productId: string; onSaved: () => void }) {
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
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
      <div className="star-picker" role="radiogroup" aria-label="Your rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className={n <= (hover || rating) ? 'on' : ''}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(n)}
          >
            ★
          </button>
        ))}
      </div>
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
