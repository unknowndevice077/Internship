import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, imageUrl, money } from '../api/client';
import { Empty, ErrorState, Stars, useFetch, useTitle } from '../components/ui';
import type { Facet, ProductSummary, SearchResult } from '../types';

const SORTS = [
  ['', 'Best match'],
  ['newest', 'Newest'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['rating', 'Top rated'],
];

export function ProductCard({ p, index = 0 }: { p: ProductSummary; index?: number }) {
  return (
    <Link
      to={`/products/${p._id}`}
      className="card product-card"
      // stagger the fade-in a little, capped so long pages don't wait
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
    >
      <div className="thumb">
        {p.image && <img src={imageUrl(p.image)} alt="" loading="lazy" />}
        {p.stock === 0 && <span className="sold-out">Sold out</span>}
      </div>
      <div className="product-card-body">
        <div className="product-title">{p.title}</div>
        <Stars value={p.ratingAvg} count={p.ratingCount} />
        <div className="price">{money(p.price)}</div>
        <div className="muted small">{p.vendorName}</div>
      </div>
    </Link>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid" role="status" aria-label="Loading products">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="card skeleton">
          <div className="thumb" />
          <div className="product-card-body">
            <div className="skeleton-line" />
            <div className="skeleton-line short" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Hero({
  categories,
  picks,
  onPick,
}: {
  categories: Facet[];
  picks: ProductSummary[];
  onPick: (c: string) => void;
}) {
  const top = [...categories].sort((a, b) => b.count - a.count).slice(0, 6);
  return (
    <section className="hero">
      <div className="hero-text">
        <span className="hero-kicker">Many stores, one cart</span>
        <h1>Find something good from sellers you'll love</h1>
        <p>Shop from independent stores, check out once, and track each package on its own.</p>
        <div className="hero-actions">
          <Link to="/?sort=rating" className="button primary">
            Shop top rated
          </Link>
          <Link to="/?sort=newest" className="button ghost">
            New arrivals
          </Link>
        </div>
      </div>
      <div className="hero-side">
        {picks.length > 0 && (
          <div className="hero-stack" aria-hidden="true">
            {picks.map((p) => (
              <Link key={p._id} to={`/products/${p._id}`} tabIndex={-1} className="hero-shot">
                <img src={imageUrl(p.image)} alt="" />
                <span>{money(p.price)}</span>
              </Link>
            ))}
          </div>
        )}
        {top.length > 0 && (
          <div className="hero-chips" aria-label="Popular categories">
            {top.map((c) => (
              <button key={c.value} className="chip" onClick={() => onPick(c.value)}>
                {c.value.replace(/-/g, ' ')}
                <span>{c.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const { data, error, loading, reload } = useFetch(
    () => api<SearchResult>(`/products?limit=24&${query}`),
    [query],
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const search = params.get('q');
  useTitle(search ? `Results for "${search}"` : undefined);

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParams(next);
  };
  const goToPage = (n: number) => {
    const next = new URLSearchParams(params);
    if (n > 1) next.set('page', String(n));
    else next.delete('page');
    setParams(next);
    window.scrollTo(0, 0);
  };
  const page = Number(params.get('page')) || 1;
  const pages = data ? Math.ceil(data.total / data.limit) : 1;
  const activeFilters = ['category', 'minPrice', 'maxPrice', 'minRating', 'inStock'].filter((k) =>
    params.get(k),
  ).length;

  return (
    <>
      {!query && (
        <Hero
          categories={data?.facets.categories ?? []}
          picks={(data?.items ?? []).filter((p) => p.image).slice(0, 3)}
          onPick={(c) => set('category', c)}
        />
      )}
      <div className="shop">
        <button
          type="button"
          className="filters-toggle"
          aria-expanded={filtersOpen}
          aria-controls="filters"
          onClick={() => setFiltersOpen((o) => !o)}
        >
          Filters{activeFilters ? ` (${activeFilters})` : ''}
        </button>
        <aside id="filters" className={`filters card ${filtersOpen ? 'open' : ''}`} aria-label="Filters">
          <h3>Category</h3>
          <button
            className={`facet ${!params.get('category') ? 'active' : ''}`}
            aria-pressed={!params.get('category')}
            onClick={() => set('category', '')}
          >
            All
          </button>
          {data?.facets.categories.map((c) => (
            <button
              key={c.value}
              className={`facet ${params.get('category') === c.value ? 'active' : ''}`}
              aria-pressed={params.get('category') === c.value}
              onClick={() => set('category', c.value)}
            >
              {c.value.replace(/-/g, ' ')} <span className="muted">{c.count}</span>
            </button>
          ))}

          <h3>Price</h3>
          <form
            className="price-range"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const next = new URLSearchParams(params);
              for (const k of ['minPrice', 'maxPrice']) {
                const v = f.get(k);
                if (typeof v === 'string' && v) next.set(k, v);
                else next.delete(k);
              }
              next.delete('page');
              setParams(next);
            }}
          >
            <input
              name="minPrice"
              type="number"
              min="0"
              placeholder="Min"
              aria-label="Minimum price"
              defaultValue={params.get('minPrice') || ''}
            />
            <input
              name="maxPrice"
              type="number"
              min="0"
              placeholder="Max"
              aria-label="Maximum price"
              defaultValue={params.get('maxPrice') || ''}
            />
            <button type="submit">Go</button>
          </form>

          <h3>Rating</h3>
          {[4, 3].map((r) => (
            <button
              key={r}
              className={`facet ${params.get('minRating') === String(r) ? 'active' : ''}`}
              aria-pressed={params.get('minRating') === String(r)}
              onClick={() => set('minRating', params.get('minRating') === String(r) ? '' : String(r))}
            >
              <Stars value={r} /> & up
            </button>
          ))}

          <label className="check">
            <input
              type="checkbox"
              checked={params.get('inStock') === 'true'}
              onChange={(e) => set('inStock', e.target.checked ? 'true' : '')}
            />
            In stock only
          </label>
        </aside>

        <section>
          <div className="shop-head">
            <div>
              {params.get('q') ? <h2>Results for “{params.get('q')}”</h2> : <h2>All products</h2>}
              {data && (
                <span className="muted" role="status">
                  {data.total} {data.total === 1 ? 'item' : 'items'}
                </span>
              )}
            </div>
            <select
              value={params.get('sort') || ''}
              onChange={(e) => set('sort', e.target.value)}
              aria-label="Sort by"
            >
              {SORTS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {error ? (
            <ErrorState error={error} onRetry={reload} />
          ) : loading && !data ? (
            <SkeletonGrid />
          ) : data?.items.length ? (
            <div className="grid">
              {data.items.map((p, i) => (
                <ProductCard key={p._id} p={p} index={i} />
              ))}
            </div>
          ) : (
            <Empty>
              No products match those filters.{' '}
              {query && (
                <button className="link" onClick={() => setParams({})}>
                  Clear filters
                </button>
              )}
            </Empty>
          )}

          {pages > 1 && (
            <nav className="pager" aria-label="Pages">
              <button disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                Previous
              </button>
              <span>
                Page {page} of {pages}
              </span>
              <button disabled={page >= pages} onClick={() => goToPage(page + 1)}>
                Next
              </button>
            </nav>
          )}
        </section>
      </div>
    </>
  );
}
