import { useParams } from 'react-router-dom';
import { api, money } from '../api/client';
import { ErrorText, Spinner, useFetch } from '../components/ui';
import type { SearchResult, Vendor } from '../types';
import { ProductCard } from './Shop';

export default function Store() {
  const { slug } = useParams();
  const { data, error, loading } = useFetch(async () => {
    const { vendor } = await api<{ vendor: Vendor }>(`/vendors/${slug}`);
    const products = await api<SearchResult>(`/products?vendor=${vendor._id}&limit=60`);
    return { vendor, products: products.items };
  }, [slug]);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorText error={error} />;
  const { vendor } = data;

  return (
    <>
      <div className="store-head card">
        <h1>{vendor.storeName}</h1>
        <p className="muted">{vendor.description}</p>
        <p className="small">
          {vendor.shippingFee
            ? `Shipping ${money(vendor.shippingFee)}${
                vendor.freeShippingOver != null
                  ? `, free on orders over ${money(vendor.freeShippingOver)}`
                  : ''
              }`
            : 'Free shipping'}
        </p>
      </div>
      <div className="grid">
        {data.products.map((p) => (
          <ProductCard key={p._id} p={p} />
        ))}
      </div>
    </>
  );
}
