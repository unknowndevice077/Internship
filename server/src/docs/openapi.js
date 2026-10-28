// OpenAPI spec served at /api/docs. Request bodies match the zod schemas in src/routes.

const obj = (properties, required = []) => ({ type: 'object', properties, required });
const str = { type: 'string' };
const num = { type: 'number' };
const int = { type: 'integer' };
const bool = { type: 'boolean' };
const id = { type: 'string', pattern: '^[a-f0-9]{24}$' };

const address = obj({ line1: str, city: str, state: str, postalCode: str, country: str }, [
  'line1',
  'city',
  'postalCode',
  'country',
]);

const bodies = {
  register: obj(
    {
      name: str,
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 8 },
      role: { type: 'string', enum: ['customer', 'vendor'] },
    },
    ['name', 'email', 'password'],
  ),
  login: obj({ email: str, password: str }, ['email', 'password']),
  token: obj({ token: str }, ['token']),
  email: obj({ email: str }, ['email']),
  reset: obj({ token: str, password: { type: 'string', minLength: 8 } }, ['token', 'password']),
  profile: obj({ name: str, address }),
  store: obj({
    storeName: str,
    description: str,
    logoUrl: str,
    shippingFee: num,
    freeShippingOver: { type: 'number', nullable: true },
  }),
  product: obj(
    {
      title: str,
      description: str,
      category: str,
      brand: str,
      price: num,
      stock: int,
      images: { type: 'array', items: str, maxItems: 6 },
      tags: { type: 'array', items: str },
      isActive: bool,
    },
    ['title', 'category', 'price'],
  ),
  images: obj({ images: { type: 'array', items: { type: 'string', format: 'binary' } } }),
  review: obj({ rating: { type: 'integer', minimum: 1, maximum: 5 }, title: str, body: str }, ['rating']),
  cartItem: obj({ productId: id, quantity: int }, ['productId']),
  quantity: obj({ quantity: int }, ['quantity']),
  code: obj({ code: str }, ['code']),
  checkout: obj({ couponCode: str, shippingAddress: address }, ['shippingAddress']),
  status: obj({ status: { type: 'string', enum: ['packed', 'shipped', 'delivered', 'cancelled'] } }, [
    'status',
  ]),
  refund: obj(
    {
      items: { type: 'array', items: obj({ product: id, quantity: int }, ['product', 'quantity']) },
      reason: str,
    },
    ['items'],
  ),
  coupon: obj(
    {
      code: str,
      type: { type: 'string', enum: ['percent', 'fixed'] },
      value: num,
      minOrder: num,
      maxUses: int,
      expiresAt: { type: 'string', format: 'date-time' },
      isActive: bool,
    },
    ['code', 'type', 'value'],
  ),
  vendorAdmin: obj({
    status: { type: 'string', enum: ['pending', 'approved', 'suspended'] },
    commissionRate: { type: 'number', minimum: 0, maximum: 0.5, nullable: true },
  }),
  userAdmin: obj({ isActive: bool }, ['isActive']),
};

const q = (name, schema = str, description) => ({ name, in: 'query', schema, description });
const searchParams = [
  q('q', str, 'full-text search, typo tolerant with Elasticsearch'),
  q('category'),
  q('brand'),
  q('vendor', id),
  q('minPrice', num),
  q('maxPrice', num),
  q('minRating', num),
  q('inStock', { type: 'string', enum: ['true'] }),
  q('sort', { type: 'string', enum: ['price_asc', 'price_desc', 'rating', 'newest'] }),
  q('page', int),
  q('limit', int),
];
const orderFilters = [
  q('status', {
    type: 'string',
    enum: ['pending_payment', 'placed', 'packed', 'shipped', 'delivered', 'cancelled'],
  }),
  q('q', str, 'order number contains'),
  q('from', { type: 'string', format: 'date' }),
  q('to', { type: 'string', format: 'date' }),
];

// [method, path, tag, summary, who can call it, body?, query params?]
const routes = [
  ['get', '/health', 'System', 'Service status', 'public'],

  ['post', '/auth/register', 'Auth', 'Sign up as a customer or vendor', 'public', 'register'],
  ['post', '/auth/login', 'Auth', 'Log in, returns a JWT', 'public', 'login'],
  ['post', '/auth/logout', 'Auth', 'Revoke the current session', 'any'],
  ['get', '/auth/me', 'Auth', 'Current user (and store for vendors)', 'any'],
  ['patch', '/auth/me', 'Auth', 'Update name or address', 'any', 'profile'],
  ['post', '/auth/verify-email', 'Auth', 'Confirm an email with the token from the link', 'public', 'token'],
  ['post', '/auth/resend-verification', 'Auth', 'Send the verification email again', 'any'],
  ['post', '/auth/forgot-password', 'Auth', 'Email a reset link (always 204)', 'public', 'email'],
  ['post', '/auth/reset-password', 'Auth', 'Set a new password, logs out other sessions', 'public', 'reset'],

  ['get', '/me/wishlist', 'Me', 'Saved products', 'any'],
  ['put', '/me/wishlist/{productId}', 'Me', 'Save a product', 'any'],
  ['delete', '/me/wishlist/{productId}', 'Me', 'Remove a saved product', 'any'],
  ['get', '/me/recent', 'Me', 'Recently viewed products', 'any'],
  ['post', '/me/recent/{productId}', 'Me', 'Record a product view', 'any'],

  ['get', '/products', 'Products', 'Search and filter products, with facets', 'public', null, searchParams],
  ['get', '/products/suggest', 'Products', 'Title suggestions for the search box', 'public', null, [q('q')]],
  ['get', '/products/mine', 'Products', "The vendor's own products, including hidden", 'vendor'],
  ['get', '/products/{id}', 'Products', 'Product details (cached in Redis)', 'public'],
  ['post', '/products', 'Products', 'Create a product', 'vendor (approved)', 'product'],
  ['patch', '/products/{id}', 'Products', 'Update any product field', 'vendor (owner)', 'product'],
  ['delete', '/products/{id}', 'Products', 'Soft delete', 'vendor (owner)'],
  ['post', '/products/images', 'Products', 'Upload up to 6 images (S3 or local)', 'vendor', 'images'],

  ['get', '/products/{productId}/reviews', 'Reviews', 'Latest reviews', 'public'],
  ['post', '/products/{productId}/reviews', 'Reviews', 'Add or update your review', 'customer', 'review'],
  ['delete', '/products/{productId}/reviews/{reviewId}', 'Reviews', 'Delete a review', 'author or admin'],

  ['post', '/vendors/onboard', 'Vendors', 'Open a store (starts pending)', 'vendor', 'store'],
  ['get', '/vendors/me', 'Vendors', 'Your store', 'vendor'],
  ['patch', '/vendors/me', 'Vendors', 'Edit store details and shipping', 'vendor', 'store'],
  ['post', '/vendors/me/payouts', 'Vendors', 'Start Stripe Connect onboarding', 'vendor'],
  ['get', '/vendors/me/payouts', 'Vendors', 'Payout account status', 'vendor'],
  ['get', '/vendors/me/stats', 'Vendors', 'Sales totals and low stock', 'vendor'],
  ['get', '/vendors/{slug}', 'Vendors', 'Public store page', 'public'],

  ['get', '/cart', 'Cart', 'Cart with live prices', 'customer'],
  ['get', '/cart/quote', 'Cart', 'Totals per store with shipping', 'customer', null, [q('coupon')]],
  ['post', '/cart/items', 'Cart', 'Add to cart', 'customer', 'cartItem'],
  ['put', '/cart/items/{productId}', 'Cart', 'Set quantity (0 removes)', 'customer', 'quantity'],
  ['delete', '/cart/items/{productId}', 'Cart', 'Remove an item', 'customer'],
  ['delete', '/cart', 'Cart', 'Empty the cart', 'customer'],

  ['post', '/orders/checkout', 'Orders', 'Hold stock and create the payment', 'customer', 'checkout'],
  [
    'post',
    '/orders/confirm/{paymentGroup}',
    'Orders',
    'Finish checkout after the card is confirmed',
    'customer',
  ],
  ['get', '/orders', 'Orders', 'Your orders (customer, vendor or admin)', 'any', null, orderFilters],
  ['get', '/orders/export.csv', 'Orders', 'Orders as CSV', 'vendor, admin', null, orderFilters],
  ['get', '/orders/{id}', 'Orders', 'Order details', 'customer, vendor, admin'],
  [
    'patch',
    '/orders/{id}/status',
    'Orders',
    'Move along placed → packed → shipped → delivered',
    'vendor',
    'status',
  ],
  ['post', '/orders/{id}/refund', 'Orders', 'Refund some items', 'vendor', 'refund'],
  ['post', '/orders/{id}/cancel', 'Orders', 'Cancel before it is packed', 'customer'],
  ['get', '/orders/{id}/invoice', 'Orders', 'PDF invoice', 'customer, vendor, admin'],

  ['post', '/coupons/validate', 'Coupons', 'Check a code against the cart', 'customer', 'code'],
  ['get', '/coupons', 'Coupons', 'Platform coupons (admin) or store coupons (vendor)', 'vendor, admin'],
  ['post', '/coupons', 'Coupons', 'Create a coupon', 'vendor, admin', 'coupon'],
  ['patch', '/coupons/{id}', 'Coupons', 'Update a coupon', 'vendor, admin', 'coupon'],
  ['delete', '/coupons/{id}', 'Coupons', 'Delete a coupon', 'vendor, admin'],

  [
    'get',
    '/admin/analytics',
    'Admin',
    'GMV, commission, daily sales, top sellers',
    'admin',
    null,
    [q('days', int)],
  ],
  ['get', '/admin/vendors', 'Admin', 'All stores', 'admin', null, [q('status')]],
  ['patch', '/admin/vendors/{id}', 'Admin', 'Approve, suspend or set commission', 'admin', 'vendorAdmin'],
  ['get', '/admin/users', 'Admin', 'All users', 'admin', null, [q('role')]],
  ['patch', '/admin/users/{id}', 'Admin', 'Enable or disable a user', 'admin', 'userAdmin'],
  ['get', '/admin/payouts', 'Admin', 'Vendor payouts by status', 'admin', null, [q('status')]],
  ['post', '/admin/orders/{id}/retry-payout', 'Admin', 'Retry a failed vendor payout', 'admin'],
  ['post', '/admin/search/reindex', 'Admin', 'Rebuild the Elasticsearch index', 'admin'],

  ['post', '/webhooks/stripe', 'System', 'Stripe webhook (signature checked)', 'Stripe'],
];

const paths = {};
for (const [method, path, tag, summary, who, body, query = []] of routes) {
  const pathParams = [...path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({
    name,
    in: 'path',
    required: true,
    schema: str,
  }));
  const op = {
    tags: [tag],
    summary,
    description: `Who: ${who}`,
    parameters: [...pathParams, ...query],
    responses: { 200: { description: 'OK' }, 400: { $ref: '#/components/responses/Error' } },
  };
  if (who !== 'public' && who !== 'Stripe') {
    op.security = [{ bearer: [] }];
    op.responses[401] = { $ref: '#/components/responses/Error' };
  }
  if (body) {
    const type = body === 'images' ? 'multipart/form-data' : 'application/json';
    op.requestBody = { required: true, content: { [type]: { schema: bodies[body] } } };
  }
  paths[path] ??= {};
  paths[path][method] = op;
}

export default {
  openapi: '3.0.3',
  info: {
    title: 'Vendora API',
    version: '1.0.0',
    description:
      'Multi-vendor marketplace API. Log in with `/auth/login`, then use Authorize with the token.',
  },
  servers: [{ url: '/api' }],
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    responses: {
      Error: {
        description: 'Error',
        content: { 'application/json': { schema: obj({ error: str, details: { type: 'object' } }) } },
      },
    },
  },
  paths,
};
