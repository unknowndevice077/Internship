import { useEffect, useRef, useState, type ReactNode } from 'react';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// fades a section in the first time it scrolls into view
export function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return setShown(true);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -60px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal ${shown ? 'shown' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function CountUp({ value, format = String }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(reducedMotion() ? value : 0);

  useEffect(() => {
    if (reducedMotion()) return setShown(value);
    const start = performance.now();
    const whole = Number.isInteger(value);
    let frame = 0;
    const step = (now: number) => {
      // the first frame can be stamped a hair before start, which made numbers flash negative
      const t = Math.min(1, Math.max(0, (now - start) / 700));
      const eased = 1 - (1 - t) ** 3;
      setShown(whole ? Math.round(value * eased) : value * eased);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{format(shown)}</>;
}

// sends a little copy of the product photo over to the cart icon
export function flyToCart(from: Element | null) {
  const target = document.querySelector('.cart-count');
  if (!from || !target || reducedMotion()) return;
  const a = from.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const ghost = from.cloneNode(true) as HTMLElement;
  ghost.removeAttribute('class');
  ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${a.left}px`,
    top: `${a.top}px`,
    width: `${a.width}px`,
    height: `${a.height}px`,
    objectFit: 'contain',
    borderRadius: '12px',
    pointerEvents: 'none',
    zIndex: '200',
  });
  document.body.appendChild(ghost);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  ghost
    .animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 0.95 },
        { transform: `translate(${dx * 0.6}px, ${dy * 0.9}px) scale(0.3)`, opacity: 0.9, offset: 0.7 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.05)`, opacity: 0 },
      ],
      { duration: 650, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)' },
    )
    .finished.finally(() => ghost.remove());
}

const CONFETTI = ['#ea580c', '#f59e0b', '#16a34a', '#2563eb', '#db2777'];

// one burst when an order goes through, then it removes itself
export function Confetti() {
  const [done, setDone] = useState(reducedMotion);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), 2600);
    return () => clearTimeout(t);
  }, []);
  if (done) return null;
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 36 }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: CONFETTI[i % CONFETTI.length],
            animationDelay: `${(i % 9) * 60}ms`,
            animationDuration: `${1500 + ((i * 53) % 900)}ms`,
          }}
        />
      ))}
    </div>
  );
}

export function ScrollTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <button
      type="button"
      className={`scroll-top ${show ? 'show' : ''}`}
      aria-label="Back to top"
      tabIndex={show ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' })}
    >
      ↑
    </button>
  );
}
