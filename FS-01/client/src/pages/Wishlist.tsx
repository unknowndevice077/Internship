import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Empty, ErrorText, Spinner, useFetch } from '../components/ui';
import type { Items, ProductSummary } from '../types';
import { ProductCard } from './Shop';

export default function Wishlist() {
  const { data, error, loading, reload } = useFetch(() => api<Items<ProductSummary>>('/me/wishlist'));

  if (loading && !data) return <Spinner />;
  const items = data?.items ?? [];

  return (
    <>
      <h1>Saved items</h1>
      <ErrorText error={error} />
      {!items.length ? (
        <Empty>
          Nothing saved yet. Tap ♡ Save on a product to keep it here. <Link to="/">Browse products</Link>
        </Empty>
      ) : (
        <div className="grid">
          {items.map((p) => (
            <div key={p._id} className="saved-card">
              <ProductCard p={p} />
              <button
                className="link small"
                onClick={() => api(`/me/wishlist/${p._id}`, { method: 'DELETE' }).then(reload)}
                aria-label={`Remove ${p.title} from saved items`}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
