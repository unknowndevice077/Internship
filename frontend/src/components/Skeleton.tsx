// placeholders shaped like the content, so the page doesn't jump when data arrives

export function BoardSkeleton() {
  return (
    <div className="sk-board" aria-hidden="true">
      {[3, 2, 2, 3].map((cards, i) => (
        <div className="sk-column" key={i}>
          <div className="skeleton" style={{ height: 14, width: "40%" }} />
          {Array.from({ length: cards }, (_, j) => (
            <div className="skeleton sk-card" key={j} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function GridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="sk-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="skeleton sk-project" key={i} />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div aria-hidden="true" style={{ display: "grid", gap: 14 }}>
      <div className="skeleton" style={{ height: 28, width: 220 }} />
      <div className="skeleton" style={{ height: 120 }} />
      <GridSkeleton />
    </div>
  );
}
