import { NavLink, Outlet } from 'react-router-dom';

export default function AdminLayout() {
  return (
    <div className="dash">
      <nav className="side card" aria-label="Admin">
        <strong>Admin</strong>
        <NavLink end to="/admin">
          Analytics
        </NavLink>
        <NavLink to="/admin/vendors">Vendors</NavLink>
        <NavLink to="/admin/payouts">Payouts</NavLink>
        <NavLink to="/admin/coupons">Coupons</NavLink>
        <NavLink to="/admin/users">Users</NavLink>
      </nav>
      <div>
        <Outlet />
      </div>
    </div>
  );
}
