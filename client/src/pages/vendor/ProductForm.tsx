import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, imageUrl } from '../../api/client';
import { ErrorText } from '../../components/ui';
import type { Items, Product } from '../../types';

const EMPTY = {
  title: '',
  description: '',
  category: '',
  brand: '',
  price: '',
  stock: '',
  tags: '',
  images: [] as string[],
};
type Form = typeof EMPTY;
type TextField = Exclude<keyof Form, 'images'>;

export default function ProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<unknown>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!id) return;
    // /products/:id hides inactive items, so look it up in the vendor's own list
    api<Items<Product>>('/products/mine').then(({ items }) => {
      const p = items.find((x) => x._id === id);
      if (p) {
        setForm({
          title: p.title,
          description: p.description || '',
          category: p.category,
          brand: p.brand || '',
          price: String(p.price),
          stock: String(p.stock),
          tags: p.tags.join(', '),
          images: p.images,
        });
      }
    });
  }, [id]);

  const set = (key: TextField) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    if (!files.length) return;
    const body = new FormData();
    files.forEach((f) => body.append('images', f));
    setUploading(true);
    try {
      const { urls } = await api<{ urls: string[] }>('/products/images', { method: 'POST', body });
      setForm((f) => ({ ...f, images: [...f.images, ...urls].slice(0, 6) }));
    } catch (err) {
      setError(err);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const body = {
      title: form.title,
      description: form.description,
      category: form.category.trim().toLowerCase(),
      brand: form.brand || undefined,
      price: Number(form.price),
      stock: Number(form.stock),
      images: form.images,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    try {
      await api(id ? `/products/${id}` : '/products', { method: id ? 'PATCH' : 'POST', body });
      navigate('/vendor/products');
    } catch (err) {
      setError(err);
    }
  };

  return (
    <form className="card stack product-form" onSubmit={submit}>
      <h1>{id ? 'Edit product' : 'New product'}</h1>
      <input placeholder="Title" aria-label="Title" value={form.title} onChange={set('title')} required />
      <textarea
        placeholder="Description"
        aria-label="Description"
        rows={5}
        value={form.description}
        onChange={set('description')}
      />
      <div className="two">
        <input
          placeholder="Category (e.g. laptops)"
          aria-label="Category"
          value={form.category}
          onChange={set('category')}
          required
        />
        <input placeholder="Brand" aria-label="Brand" value={form.brand} onChange={set('brand')} />
      </div>
      <div className="two">
        <input
          type="number"
          step="0.01"
          min="0.5"
          placeholder="Price"
          aria-label="Price"
          value={form.price}
          onChange={set('price')}
          required
        />
        <input
          type="number"
          min="0"
          placeholder="Stock"
          aria-label="Stock"
          value={form.stock}
          onChange={set('stock')}
          required
        />
      </div>
      <input placeholder="Tags, comma separated" aria-label="Tags" value={form.tags} onChange={set('tags')} />

      <div>
        <div className="thumbs">
          {form.images.map((src, i) => (
            <div key={src} className="thumb-edit">
              <img src={imageUrl(src)} alt="" />
              <button
                type="button"
                aria-label={`Remove image ${i + 1}`}
                onClick={() => setForm({ ...form, images: form.images.filter((x) => x !== src) })}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <label className="button">
          {uploading ? 'Uploading…' : 'Upload images'}
          <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={upload} />
        </label>
      </div>

      <ErrorText error={error} />
      {error instanceof ApiError && error.details && (
        <pre className="error small">{JSON.stringify(error.details, null, 1)}</pre>
      )}
      <button className="primary">{id ? 'Save changes' : 'Create product'}</button>
    </form>
  );
}
