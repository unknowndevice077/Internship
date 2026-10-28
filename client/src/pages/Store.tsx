import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { ErrorText, Spinner, useFetch } from '../components/ui';
import { ProductCard } from './Shop';

export default function Store() {
  const { slug } = useParams();
  const { data, error, loading } = useFetch(async () => {
    const { vendor } = await api(`/vendors/${slug}`);
    const products = await api(`/products?vendor=${vendor._id}&limit=60`);
    return { vendor, products: products.items };
  }, [slug]);

  if (loading) return <Spinner />;
  if (error) return <ErrorText error={error} />;

  return (
    <>
      <div className="store-head card">
        <h1>{data.vendor.storeName}</h1>
        <p className="muted">{data.vendor.description}</p>
      </div>
      <div className="grid">
        {data.products.map((p) => (
          <ProductCard key={p._id} p={p} />
        ))}
      </div>
    </>
  );
}
