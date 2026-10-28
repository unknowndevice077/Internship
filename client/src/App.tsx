import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { RequireRole, Spinner } from './components/ui';
import Shop from './pages/Shop';
import ProductPage from './pages/ProductPage';
import Store from './pages/Store';
import Login from './pages/Login';
import Register from './pages/Register';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import VendorLayout from './pages/vendor/VendorLayout';
import VendorDashboard from './pages/vendor/VendorDashboard';
import VendorProducts from './pages/vendor/VendorProducts';
import ProductForm from './pages/vendor/ProductForm';
import VendorOrders from './pages/vendor/VendorOrders';
import VendorPayouts from './pages/vendor/VendorPayouts';
import Coupons from './pages/Coupons';
import AdminLayout from './pages/admin/AdminLayout';
// recharts is heavy and only admins need it
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics'));
import AdminVendors from './pages/admin/AdminVendors';
import AdminUsers from './pages/admin/AdminUsers';

const customer = (el) => <RequireRole roles={['customer']}>{el}</RequireRole>;

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Shop />} />
        <Route path="products/:id" element={<ProductPage />} />
        <Route path="stores/:slug" element={<Store />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="cart" element={<Cart />} />
        <Route path="checkout" element={customer(<Checkout />)} />
        <Route path="orders" element={customer(<Orders />)} />
        <Route
          path="orders/:id"
          element={
            <RequireRole roles={['customer', 'vendor', 'admin']}>
              <OrderDetail />
            </RequireRole>
          }
        />

        <Route
          path="vendor"
          element={
            <RequireRole roles={['vendor']}>
              <VendorLayout />
            </RequireRole>
          }
        >
          <Route index element={<VendorDashboard />} />
          <Route path="products" element={<VendorProducts />} />
          <Route path="products/new" element={<ProductForm />} />
          <Route path="products/:id/edit" element={<ProductForm />} />
          <Route path="orders" element={<VendorOrders />} />
          <Route path="coupons" element={<Coupons />} />
          <Route path="payouts" element={<VendorPayouts />} />
        </Route>

        <Route
          path="admin"
          element={
            <RequireRole roles={['admin']}>
              <AdminLayout />
            </RequireRole>
          }
        >
          <Route
            index
            element={
              <Suspense fallback={<Spinner />}>
                <AdminAnalytics />
              </Suspense>
            }
          />
          <Route path="vendors" element={<AdminVendors />} />
          <Route path="coupons" element={<Coupons />} />
          <Route path="users" element={<AdminUsers />} />
        </Route>

        <Route path="*" element={<p>Page not found.</p>} />
      </Route>
    </Routes>
  );
}
