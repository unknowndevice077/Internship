import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "./auth/useAuth";
import Layout from "./components/Layout";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";

// signed-in pages load on demand, so the login screen stays small
const AccountPage = lazy(() => import("./pages/AccountPage"));
const BacklogPage = lazy(() => import("./pages/BacklogPage"));
const BillingPage = lazy(() => import("./pages/BillingPage"));
const BoardPage = lazy(() => import("./pages/BoardPage"));
const ProjectSettingsPage = lazy(() => import("./pages/ProjectSettingsPage"));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const WorkspaceSettingsPage = lazy(() => import("./pages/WorkspaceSettingsPage"));

export default function App() {
  const { me, loading } = useAuth();

  if (loading) return <div className="splash">Loading…</div>;

  if (!me) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Suspense fallback={<div className="splash">Loading…</div>}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route element={<Layout />}>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/projects/:projectId/board" element={<BoardPage />} />
          <Route path="/projects/:projectId/backlog" element={<BacklogPage />} />
          <Route path="/projects/:projectId/settings" element={<ProjectSettingsPage />} />
          <Route path="/projects/:projectId/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<WorkspaceSettingsPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
