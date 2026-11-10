import { useEffect, useLayoutEffect, useRef, useState } from "react";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(() => (reducedMotion() ? value : 0));
  const from = useRef(0);

  useEffect(() => {
    if (reducedMotion()) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / 700, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(origin + (value - origin) * eased);
      from.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{shown}</>;
}

export function Ring({ value, total, label }: { value: number; total: number; label: string }) {
  const r = 26;
  const length = 2 * Math.PI * r;
  const share = total ? Math.min(value / total, 1) : 0;
  // start empty and fill after the first paint, so the arc animates in
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(share));
    return () => cancelAnimationFrame(frame);
  }, [share]);

  return (
    <svg className="ring" viewBox="0 0 64 64" role="img" aria-label={label}>
      <circle className="ring-track" cx="32" cy="32" r={r} />
      <circle
        className="ring-fill"
        cx="32"
        cy="32"
        r={r}
        strokeDasharray={length}
        strokeDashoffset={length * (1 - drawn)}
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="36" textAnchor="middle">
        {Math.round(share * 100)}%
      </text>
    </svg>
  );
}

export interface Series {
  label: string;
  values: (number | null)[];
  /** a reference line (like the ideal burndown) is drawn grey and dashed */
  reference?: boolean;
}

// a round, even number at or above the data, so the middle gridline is a whole number too
function niceMax(max: number) {
  if (max <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const fits = [1, 1.2, 1.6, 2, 3, 4, 5, 6, 8, 10].map((m) => m * step);
  return fits.find((v) => v >= max && Number.isInteger(v / 2)) ?? 10 * step;
}

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const M = { top: 12, right: 14, bottom: 24, left: 34 };

export function LineChart({
  dates,
  series,
  unit,
  height = 210,
}: {
  dates: string[];
  series: Series[];
  unit: string;
  height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(el.clientWidth, 240));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const top = niceMax(Math.max(1, ...series.flatMap((s) => s.values.map((v) => v ?? 0))));
  const innerW = width - M.left - M.right;
  const innerH = height - M.top - M.bottom;
  const x = (i: number) => M.left + (dates.length > 1 ? (i / (dates.length - 1)) * innerW : innerW / 2);
  const y = (v: number) => M.top + innerH - (v / top) * innerH;
  const ticks = [0, top / 2, top];
  const dateTicks = [...new Set([0, Math.floor((dates.length - 1) / 2), dates.length - 1])];
  let colour = 0;
  const drawn = series.map((s) => ({ ...s, slot: s.reference ? 0 : ++colour }));

  function path(values: (number | null)[]) {
    let d = "";
    let pen = false;
    values.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  }

  function onMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(dates.length - 1, Math.round(ratio * (dates.length - 1)))));
  }

  return (
    <div className="chart" ref={box}>
      <div className="chart-legend">
        {drawn.map((s) => (
          <span key={s.label}>
            <i className={s.reference ? "swatch swatch-ref" : `swatch swatch-${s.slot}`} />
            {s.label}
          </span>
        ))}
      </div>
      <svg width={width} height={height} role="img" aria-label={`${drawn.map((s) => s.label).join(" and ")} per day`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="chart-grid" x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} />
            <text className="chart-tick" x={M.left - 8} y={y(t) + 4} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {dateTicks.map((i) => (
          <text
            key={i}
            className="chart-tick"
            x={x(i)}
            y={height - 6}
            textAnchor={i === 0 ? "start" : i === dates.length - 1 ? "end" : "middle"}
          >
            {shortDate(dates[i])}
          </text>
        ))}
        {drawn.map((s) => (
          <path
            key={s.label}
            className={s.reference ? "chart-line chart-ref" : `chart-line chart-line-${s.slot}`}
            d={path(s.values)}
            pathLength={s.reference ? undefined : 1}
          />
        ))}
        {hover !== null && (
          <g>
            <line className="chart-cross" x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + innerH} />
            {drawn.map(
              (s) =>
                !s.reference &&
                s.values[hover] != null && (
                  <circle
                    key={s.label}
                    className={`chart-dot chart-dot-${s.slot}`}
                    cx={x(hover)}
                    cy={y(s.values[hover] as number)}
                    r="4.5"
                  />
                ),
            )}
          </g>
        )}
        <rect
          x={M.left}
          y={M.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        />
      </svg>
      {hover !== null && (
        <div
          className="chart-tip"
          style={{ left: Math.min(Math.max(x(hover), 70), width - 70), top: M.top }}
          role="status"
        >
          <strong>{shortDate(dates[hover])}</strong>
          {drawn.map((s) => (
            <span key={s.label}>
              <i className={s.reference ? "swatch swatch-ref" : `swatch swatch-${s.slot}`} />
              {s.label}
              <b>{s.values[hover] ?? "–"}</b>
            </span>
          ))}
        </div>
      )}
      <table className="sr-only">
        <caption>{unit} per day</caption>
        <thead>
          <tr>
            <th>Date</th>
            {drawn.map((s) => (
              <th key={s.label}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map((d, i) => (
            <tr key={d}>
              <td>{d}</td>
              {drawn.map((s) => (
                <td key={s.label}>{s.values[i] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface Segment {
  label: string;
  value: number;
  tone: "todo" | "doing" | "done";
}

export function SplitBar({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  return (
    <div className="split">
      <div className="split-bar" role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(", ")}>
        {segments.map(
          (s) =>
            s.value > 0 && (
              <span
                key={s.label}
                className={`split-${s.tone}`}
                style={{ flexGrow: s.value }}
                title={`${s.label}: ${s.value}`}
              />
            ),
        )}
      </div>
      <div className="chart-legend">
        {segments.map((s) => (
          <span key={s.label}>
            <i className={`swatch split-${s.tone}`} />
            {s.label}
            <b>{s.value}</b>
            <em>{total ? Math.round((s.value / total) * 100) : 0}%</em>
          </span>
        ))}
      </div>
    </div>
  );
}
