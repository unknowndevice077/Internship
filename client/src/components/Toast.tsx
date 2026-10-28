import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Tone = 'ok' | 'error' | 'info';

interface Toast {
  id: number;
  text: string;
  tone: Tone;
  link?: { to: string; label: string };
  leaving?: boolean;
}

interface ToastValue {
  show: (text: string, opts?: { tone?: Tone; link?: Toast['link'] }) => void;
}

const ToastContext = createContext<ToastValue | null>(null);
const SHOW_MS = 3500;
const LEAVE_MS = 200;

// little notifications in the corner, e.g. "Added to cart"
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    // play the exit animation, then drop it
    setToasts((all) => all.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), LEAVE_MS);
  }, []);

  const show = useCallback<ToastValue['show']>(
    (text, { tone = 'ok', link } = {}) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-2), { id, text, tone, link }]);
      setTimeout(() => dismiss(id), SHOW_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone} ${t.leaving ? 'leaving' : ''}`}>
            <span className="toast-icon" aria-hidden="true">
              {t.tone === 'error' ? '!' : t.tone === 'ok' ? '✓' : 'i'}
            </span>
            <span className="grow">{t.text}</span>
            {t.link && (
              <Link to={t.link.to} className="toast-link" onClick={() => dismiss(t.id)}>
                {t.link.label}
              </Link>
            )}
            <button className="toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
