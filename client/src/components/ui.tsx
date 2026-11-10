import { useEffect, useState, type DependencyList, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { OrderStatus, Role } from '../types';

export function Stars({ value = 0, count }: { value?: number; count?: number }) {
  const full = Math.round(value);
  return (
    <span className="stars" title={`${value} out of 5`} aria-label={`Rated ${value} out of 5`}>
      <span aria-hidden="true">
        {'★'.repeat(full)}
        <span className="stars-empty">{'★'.repeat(5 - full)}</span>
      </span>
      {count !== undefined && <span className="muted"> ({count})</span>}
    </span>
  );
}

export function StatusBadge({ status }: { status: OrderStatus | string }) {
  return <span className={`badge badge-${status}`}>{status.replace('_', ' ')}</span>;
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />;
}

export function ErrorText({ error }: { error?: unknown }) {
  if (!error) return null;
  return (
    <p className="error" role="alert">
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

interface FetchState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

export function useFetch<T>(loader: () => Promise<T>, deps: DependencyList = []) {
  const [state, setState] = useState<FetchState<T>>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    loader()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error: Error) => alive && setState({ data: null, error, loading: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { ...state, reload: () => setTick((t) => t + 1) };
}

// for when a whole page or list failed to load, with a way to try again
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="empty error-state" role="alert">
      <div className="empty-icon" aria-hidden="true">
        !
      </div>
      <p>{error instanceof Error ? error.message : 'Something went wrong'}</p>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function useTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · Vendora` : 'Vendora';
    return () => {
      document.title = 'Vendora';
    };
  }, [title]);
}
