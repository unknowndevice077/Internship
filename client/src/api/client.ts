// empty in dev, vite proxies /api
export const API_URL = import.meta.env.VITE_API_URL || '';

const TOKEN_KEY = 'vendora_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) =>
  token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function api(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const token = getToken();
  const isForm = body instanceof FormData;

  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: {
      ...(!isForm && body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...headers,
    },
    body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (raw && res.ok) return res;
  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, data.error || 'Request failed', data.details);
  }
  return data;
}

// image urls from local storage come back as /uploads/..., point them at the API
export const imageUrl = (url) => (url?.startsWith('/uploads/') ? `${API_URL}${url}` : url);

export const money = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

export async function openInvoice(orderId) {
  const res = await api(`/orders/${orderId}/invoice`, { raw: true });
  const blob = await res.blob();
  window.open(URL.createObjectURL(blob), '_blank');
}
