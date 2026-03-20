import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface UnifiedSearchProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (type: string, data: string) => void;
}

interface SearchResult {
  result_type: string;
  title: string;
  subtitle: string;
  data: string;
}

interface GroupedResults {
  type: string;
  label: string;
  items: SearchResult[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const RECENT_SEARCHES_KEY = "workroot_recent_searches";
const MAX_RECENT = 8;
const DEBOUNCE_MS = 200;

const TYPE_LABELS: Record<string, string> = {
  bookmarks: "Bookmarks",
  history: "History",
  notes: "Notes",
  settings: "Settings",
  commands: "Commands",
  files: "Files",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((s): s is string => typeof s === "string");
    }
    return [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string): void {
  const trimmed = query.trim();
  if (!trimmed) return;
  const existing = getRecentSearches().filter((s) => s !== trimmed);
  existing.unshift(trimmed);
  const capped = existing.slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(capped));
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escapedQuery})`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="unified-search__highlight">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function UnifiedSearch({
  open,
  onClose,
  onNavigate,
}: UnifiedSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searching, setSearching] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recentSearches = useMemo(
    () => (query ? [] : getRecentSearches()),
    [query],
  );

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setSearching(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSelectedIndex(0);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const searchResults = await invoke<SearchResult[]>("unified_search", {
          query: trimmed,
        });
        setResults(searchResults);
        setSelectedIndex(0);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, open]);

  // Group results by type
  const grouped = useMemo<GroupedResults[]>(() => {
    const groups = new Map<string, SearchResult[]>();
    for (const r of results) {
      const existing = groups.get(r.result_type);
      if (existing) {
        existing.push(r);
      } else {
        groups.set(r.result_type, [r]);
      }
    }
    return Array.from(groups.entries()).map(([type, items]) => ({
      type,
      label: TYPE_LABELS[type] || type,
      items,
    }));
  }, [results]);

  // Flat list for keyboard navigation
  const flatItems = useMemo<SearchResult[]>(
    () => grouped.flatMap((g) => g.items),
    [grouped],
  );

  // Keep selection in bounds
  useEffect(() => {
    if (selectedIndex >= flatItems.length) {
      setSelectedIndex(Math.max(0, flatItems.length - 1));
    }
  }, [flatItems.length, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.querySelector(
      `[data-search-index="${selectedIndex}"]`,
    );
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      saveRecentSearch(query);
      onNavigate(result.result_type, result.data);
      onClose();
    },
    [query, onNavigate, onClose],
  );

  const handleRecentClick = useCallback((recent: string) => {
    setQuery(recent);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (flatItems[selectedIndex]) {
            handleSelect(flatItems[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [flatItems, selectedIndex, handleSelect, onClose],
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  if (!open) return null;

  let flatIndex = 0;

  return (
    <div className="unified-search__backdrop" onClick={handleBackdropClick}>
      <div className="unified-search__panel" role="dialog" aria-label="Search">
        {/* Search input */}
        <div className="unified-search__input-wrap">
          <SearchIcon />
          <input
            ref={inputRef}
            className="unified-search__input"
            type="text"
            placeholder="Search bookmarks, history, notes, settings..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoComplete="off"
          />
          {searching && <span className="unified-search__spinner" />}
          <kbd className="unified-search__esc">esc</kbd>
        </div>

        {/* Results */}
        <div className="unified-search__results" ref={listRef}>
          {/* Recent searches (when no query) */}
          {!query && recentSearches.length > 0 && (
            <div className="unified-search__group">
              <div className="unified-search__group-label">Recent searches</div>
              {recentSearches.map((recent) => (
                <button
                  key={recent}
                  className="unified-search__item"
                  onClick={() => handleRecentClick(recent)}
                >
                  <span className="unified-search__item-icon">
                    <ClockIcon />
                  </span>
                  <span className="unified-search__item-title">{recent}</span>
                </button>
              ))}
            </div>
          )}

          {/* No query, no recent */}
          {!query && recentSearches.length === 0 && (
            <div className="unified-search__empty">
              Start typing to search across your workspace
            </div>
          )}

          {/* Query with no results */}
          {query && !searching && flatItems.length === 0 && (
            <div className="unified-search__empty">
              No results for &quot;{query}&quot;
            </div>
          )}

          {/* Grouped results */}
          {grouped.map((group) => (
            <div key={group.type} className="unified-search__group">
              <div className="unified-search__group-label">
                <span className="unified-search__type-badge">
                  {group.label}
                </span>
              </div>
              {group.items.map((item) => {
                const idx = flatIndex++;
                return (
                  <button
                    key={`${item.result_type}-${item.data}-${idx}`}
                    data-search-index={idx}
                    className={`unified-search__item ${idx === selectedIndex ? "unified-search__item--active" : ""}`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <span className="unified-search__item-icon">
                      <TypeIcon type={item.result_type} />
                    </span>
                    <div className="unified-search__item-text">
                      <span className="unified-search__item-title">
                        {highlightMatch(item.title, query)}
                      </span>
                      {item.subtitle && (
                        <span className="unified-search__item-subtitle">
                          {highlightMatch(item.subtitle, query)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer hints */}
        {flatItems.length > 0 && (
          <div className="unified-search__footer">
            <span className="unified-search__hint">
              <kbd>Up</kbd>/<kbd>Down</kbd> navigate
            </span>
            <span className="unified-search__hint">
              <kbd>Enter</kbd> open
            </span>
            <span className="unified-search__hint">
              <kbd>Esc</kbd> close
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

function SearchIcon() {
  return (
    <svg
      className="unified-search__search-icon"
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
    >
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M11 11L14 14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 4.5V8L10.5 9.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TypeIcon({ type }: { type: string }) {
  switch (type) {
    case "bookmarks":
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M4 2H12V14L8 11L4 14V2Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "history":
      return <ClockIcon />;
    case "notes":
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect
            x="3"
            y="2"
            width="10"
            height="12"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <path
            d="M6 5H10M6 8H10M6 11H8"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      );
    case "settings":
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M8 2V4M8 12V14M2 8H4M12 8H14M3.76 3.76L5.17 5.17M10.83 10.83L12.24 12.24M3.76 12.24L5.17 10.83M10.83 5.17L12.24 3.76"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      );
    default:
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      );
  }
}
