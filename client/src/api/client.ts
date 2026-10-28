// empty in dev, vite proxies /api
export const API_URL: string = import.meta.env.VITE_API_URL || '';

const TOKEN_KEY = 'vendora_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string | null) =>
  token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  status: number;
  details?: Record<string, string[]>;

  constructor(status: number, message: string, details?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

async function request(path: string, { method = 'GET', body, headers = {} }: Options) {
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
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, data.error || 'Request failed', data.details);
  }
  return res;
}

// JSON calls. 204 responses resolve to undefined
export async function api<T = void>(path: string, options: Options = {}): Promise<T> {
  const res = await request(path, options);
  if (res.status === 204) return undefined as T;
  return res.json();
}

// file downloads (invoices, CSV)
export async function apiBlob(path: string): Promise<Blob> {
  return (await request(path, {})).blob();
}

// image urls from local storage come back as /uploads/..., point them at the API
export const imageUrl = (url?: string) => (url?.startsWith('/uploads/') ? `${API_URL}${url}` : url);

export const money = (n?: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

export async function openInvoice(orderId: string) {
  const blob = await apiBlob(`/orders/${orderId}/invoice`);
  window.open(URL.createObjectURL(blob), '_blank');
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
