import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useProjects } from "../api/queries";
import { useCan } from "../auth/useAuth";

interface Item {
  label: string;
  hint: string;
  to: string;
}

export default function CommandPalette({ onClose }: { onClose(): void }) {
  const navigate = useNavigate();
  const { data: projects = [] } = useProjects();
  const isAdmin = useCan("admin");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const items = useMemo<Item[]>(() => {
    const base: Item[] = [
      { label: "Projects", hint: "Page", to: "/" },
      { label: "Workspace settings", hint: "Page", to: "/settings" },
      { label: "Account and security", hint: "Page", to: "/account" },
      ...(isAdmin ? [{ label: "Billing", hint: "Page", to: "/billing" }] : []),
    ];
    for (const p of projects) {
      const name = `${p.key} ${p.name}`;
      base.push(
        { label: `${name} board`, hint: "Project", to: `/projects/${p.id}/board` },
        { label: `${name} backlog`, hint: "Project", to: `/projects/${p.id}/backlog` },
        { label: `${name} reports`, hint: "Project", to: `/projects/${p.id}/reports` },
      );
      if (isAdmin) base.push({ label: `${name} workflow`, hint: "Project", to: `/projects/${p.id}/settings` });
    }
    return base;
  }, [projects, isAdmin]);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((i) => words.every((w) => i.label.toLowerCase().includes(w))).slice(0, 12);
  }, [items, query]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function go(item?: Item) {
    if (!item) return;
    navigate(item.to);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(shown[active]);
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  return (
    <div className="modal-backdrop palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label="Command palette">
        <input
          autoFocus
          aria-label="Search commands"
          placeholder="Jump to a page or project"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {shown.length === 0 ? (
          <div className="palette-empty">Nothing matches &ldquo;{query}&rdquo;</div>
        ) : (
          <ul ref={listRef} role="listbox">
            {shown.map((item, i) => (
              <li
                key={item.to}
                role="option"
                aria-selected={i === active}
                onMouseMove={() => setActive(i)}
                onClick={() => go(item)}
              >
                <span>{item.label}</span>
                <span className="muted small">{item.hint}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
