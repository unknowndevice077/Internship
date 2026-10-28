// Shapes of what the API sends back. Only the fields the client uses.

export type Role = 'customer' | 'vendor' | 'admin';
export type OrderStatus = 'pending_payment' | 'placed' | 'packed' | 'shipped' | 'delivered' | 'cancelled';
export type TransferStatus = 'pending' | 'paid' | 'failed' | 'skipped';

export interface Address {
  line1: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
}

export interface User {
  _id: string;
  name: string;
  email: string;
  role: Role;
  address?: Address;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: string;
}

export interface Vendor {
  _id: string;
  storeName: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  status: 'pending' | 'approved' | 'suspended';
  commissionRate?: number | null;
  stripeAccountId?: string;
  payoutsEnabled: boolean;
  shippingFee?: number;
  freeShippingOver?: number | null;
  owner?: { _id: string; name: string; email: string };
  createdAt: string;
}

// a product as it appears in listings and search
export interface ProductSummary {
  _id: string;
  title: string;
  price: number;
  image?: string;
  ratingAvg?: number;
  ratingCount?: number;
  stock?: number;
  category?: string;
  brand?: string;
  vendorName?: string;
}

export interface Product {
  _id: string;
  title: string;
  description?: string;
  category: string;
  brand?: string;
  price: number;
  stock: number;
  images: string[];
  tags: string[];
  isActive: boolean;
  ratingAvg: number;
  ratingCount: number;
  // populated on the public product endpoint
  vendor: Pick<Vendor, '_id' | 'storeName' | 'slug' | 'status' | 'shippingFee' | 'freeShippingOver'>;
}

export interface Facet {
  value: string;
  count: number;
}

export interface SearchResult {
  engine: 'elasticsearch' | 'mongo';
  page: number;
  limit: number;
  total: number;
  items: ProductSummary[];
  facets: { categories: Facet[]; brands: Facet[] };
}

export interface Review {
  _id: string;
  rating: number;
  title?: string;
  body?: string;
  verifiedPurchase: boolean;
  user?: { _id: string; name: string };
  createdAt: string;
}

export interface CartItem {
  productId: string;
  quantity: number;
  title: string;
  image?: string;
  price: number;
  stock: number;
  vendorId?: string;
  vendorName?: string;
  available: boolean;
}

export interface Cart {
  items: CartItem[];
  subtotal: number;
  count: number;
}

export interface StoreQuote {
  vendorId: string;
  vendorName: string;
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  freeShippingOver?: number | null;
}

export interface Quote {
  code: string | null;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  stores: StoreQuote[];
}

export interface OrderItem {
  product: string;
  title: string;
  image?: string;
  price: number;
  quantity: number;
  refundedQuantity?: number;
}

export interface Refund {
  items: { product: string; quantity: number }[];
  amount: number;
  vendorReversal: number;
  reason?: string;
  at: string;
}

export interface Order {
  _id: string;
  orderNumber: string;
  paymentGroup: string;
  customer: { _id: string; name: string; email: string } | string;
  vendor: { _id: string; storeName: string; slug: string } | string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  commissionRate: number;
  commission: number;
  vendorPayout: number;
  couponCode?: string;
  shippingAddress?: Address;
  status: OrderStatus;
  statusHistory: { status: OrderStatus; at: string }[];
  payment?: {
    provider: string;
    paidAt?: string;
    transferStatus?: TransferStatus;
    transferAttempts?: number;
    transferError?: string;
    nextTransferAt?: string;
  };
  refunds: Refund[];
  refundedTotal: number;
  createdAt: string;
}

export interface Coupon {
  _id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  minOrder?: number;
  maxUses?: number;
  usedCount: number;
  expiresAt?: string;
  isActive: boolean;
  vendor?: string;
}

export interface Items<T> {
  items: T[];
}
