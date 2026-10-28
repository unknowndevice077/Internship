import { useEffect, useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, imageUrl, money } from '../api/client';
import type { Items, ProductSummary } from '../types';

// header search with a suggestion list you can drive with the arrow keys (ARIA combobox pattern)
export default function SearchBox() {
  const navigate = useNavigate();
  const listId = useId();
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState<ProductSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  // wait for a pause in typing before asking the API
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      api<Items<ProductSummary>>(`/products/suggest?q=${encodeURIComponent(term)}`)
        .then((res) => {
          setSuggestions(res.items);
          setActive(-1);
        })
        .catch(() => setSuggestions([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [q]);

  const showList = open && suggestions.length > 0;

  const pick = (id: string) => {
    setOpen(false);
    setQ('');
    navigate(`/products/${id}`);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (showList && active >= 0) return pick(suggestions[active]._id);
    setOpen(false);
    navigate(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : '/');
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    } else if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    }
  };

  return (
    <form className="search" role="search" onSubmit={onSubmit}>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        placeholder="Search products, brands…"
        aria-label="Search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
      />
      <button type="submit">Search</button>
      {showList && (
        <ul className="suggestions" role="listbox" id={listId} aria-label="Suggestions">
          {suggestions.map((item, i) => (
            <li
              key={item._id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(item._id);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {item.image && <img src={imageUrl(item.image)} alt="" />}
              <span className="suggestion-title">{item.title}</span>
              <span className="muted small">{money(item.price)}</span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
