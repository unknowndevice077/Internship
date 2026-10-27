import { Link, useSearchParams } from 'react-router-dom';
import { api, imageUrl, money } from '../api/client';
import { Empty, ErrorText, Spinner, Stars, useFetch } from '../components/ui';

const SORTS = [
  ['', 'Best match'],
  ['newest', 'Newest'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['rating', 'Top rated'],
];

export function ProductCard({ p }) {
  return (
    <Link to={`/products/${p._id}`} className="card product-card">
      <div className="thumb">{p.image && <img src={imageUrl(p.image)} alt={p.title} loading="lazy" />}</div>
      <div className="product-card-body">
        <div className="product-title">{p.title}</div>
        <Stars value={p.ratingAvg} count={p.ratingCount} />
        <div className="price">{money(p.price)}</div>
        <div className="muted small">{p.vendorName}</div>
      </div>
    </Link>
  );
}

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const { data, error, loading } = useFetch(() => api(`/products?limit=24&${query}`), [query]);

  const set = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParams(next);
  };
  const page = Number(params.get('page')) || 1;
  const pages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <div className="shop">
      <aside className="filters card">
        <h3>Category</h3>
        <button className={`facet ${!params.get('category') ? 'active' : ''}`} onClick={() => set('category', '')}>
          All
        </button>
        {data?.facets.categories.map((c) => (
          <button
            key={c.value}
            className={`facet ${params.get('category') === c.value ? 'active' : ''}`}
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
              if (f.get(k)) next.set(k, f.get(k));
              else next.delete(k);
            }
            setParams(next);
          }}
        >
          <input name="minPrice" type="number" min="0" placeholder="Min" defaultValue={params.get('minPrice') || ''} />
          <input name="maxPrice" type="number" min="0" placeholder="Max" defaultValue={params.get('maxPrice') || ''} />
          <button type="submit">Go</button>
        </form>

        <h3>Rating</h3>
        {[4, 3].map((r) => (
          <button
            key={r}
            className={`facet ${params.get('minRating') === String(r) ? 'active' : ''}`}
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
            {data && <span className="muted">{data.total} items</span>}
          </div>
          <select value={params.get('sort') || ''} onChange={(e) => set('sort', e.target.value)}>
            {SORTS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <ErrorText error={error} />
        {loading && !data ? (
          <Spinner />
        ) : data?.items.length ? (
          <div className="grid">
            {data.items.map((p) => (
              <ProductCard key={p._id} p={p} />
            ))}
          </div>
        ) : (
          <Empty>No products match those filters.</Empty>
        )}

        {pages > 1 && (
          <div className="pager">
            <button disabled={page <= 1} onClick={() => set('page', String(page - 1))}>
              Previous
            </button>
            <span>
              Page {page} of {pages}
            </span>
            <button
              disabled={page >= pages}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('page', String(page + 1));
                setParams(next);
              }}
            >
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
