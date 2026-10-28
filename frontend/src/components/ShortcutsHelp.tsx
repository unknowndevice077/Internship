import { useEffect } from "react";

import { MOD_KEY } from "../platform";

const ROWS: [string[], string][] = [
  [[MOD_KEY, "K"], "Search and jump anywhere"],
  [["C"], "Create an issue"],
  [["/"], "Filter the board or search the backlog"],
  [["?"], "Show this list"],
  [["Esc"], "Close a dialog or the issue drawer"],
];

export default function ShortcutsHelp({ onClose }: { onClose(): void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="Keyboard shortcuts">
        <h2>Keyboard shortcuts</h2>
        <dl className="shortcuts">
          {ROWS.map(([keys, text]) => (
            <div key={text} style={{ display: "contents" }}>
              <dt>
                {keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
        <div className="form-actions">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
