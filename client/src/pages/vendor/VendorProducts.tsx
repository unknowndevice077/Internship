import { Link } from 'react-router-dom';
import { api, imageUrl, money } from '../../api/client';
import { Empty, ErrorText, Spinner, useFetch } from '../../components/ui';

export default function VendorProducts() {
  const { data, error, loading, reload } = useFetch(() => api('/products/mine').then((d) => d.items));

  const toggle = async (p) => {
    await api(`/products/${p._id}`, { method: 'PATCH', body: { isActive: !p.isActive } });
    reload();
  };

  return (
    <>
      <div className="shop-head">
        <h1>Products</h1>
        <Link to="/vendor/products/new" className="button primary">
          Add product
        </Link>
      </div>
      <ErrorText error={error} />
      {loading ? (
        <Spinner />
      ) : !data.length ? (
        <Empty>No products yet.</Empty>
      ) : (
        <table className="table card">
          <thead>
            <tr>
              <th />
              <th>Title</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Rating</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p._id} className={p.isActive ? '' : 'faded'}>
                <td>{p.images[0] && <img className="mini" src={imageUrl(p.images[0])} alt="" />}</td>
                <td>{p.title}</td>
                <td>{money(p.price)}</td>
                <td className={p.stock <= 5 ? 'error' : ''}>{p.stock}</td>
                <td>{p.ratingCount ? `${p.ratingAvg} (${p.ratingCount})` : '–'}</td>
                <td>
                  <button className="link" onClick={() => toggle(p)}>
                    {p.isActive ? 'Live' : 'Hidden'}
                  </button>
                </td>
                <td>
                  <Link to={`/vendor/products/${p._id}/edit`}>Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
