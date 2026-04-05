import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { Command } from "../hooks/useCommandRegistry";
import { Dialog, DialogContent } from "./ui/dialog";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onExecute: (commandId: string) => void;
  search: (query: string) => Command[];
}

export function CommandPalette({
  open,
  onClose,
  onExecute,
  search,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => search(query), [search, query]);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      // Focus after the DOM updates
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Keep selection in bounds
  useEffect(() => {
    if (selectedIndex >= results.length) {
      setSelectedIndex(Math.max(0, results.length - 1));
    }
  }, [results.length, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.querySelector(
      `[data-index="${selectedIndex}"]`,
    );
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleSelect = useCallback(
    (commandId: string) => {
      onExecute(commandId);
      onClose();
    },
    [onExecute, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (results[selectedIndex]) {
            handleSelect(results[selectedIndex].id);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [results, selectedIndex, handleSelect, onClose],
  );

  if (!open) return null;

  // Group results by category
  const grouped: Array<{ category: string; commands: Command[] }> = [];
  const seen = new Set<string>();
  for (const cmd of results) {
    if (!seen.has(cmd.category)) {
      seen.add(cmd.category);
      grouped.push({
        category: cmd.category,
        commands: results.filter((c) => c.category === cmd.category),
      });
    }
  }

  let flatIndex = 0;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="cmd-palette" aria-label="Command palette">
        <div className="cmd-palette-input-wrap">
          <SearchIcon />
          <input
            ref={inputRef}
            className="cmd-palette-input"
            type="text"
            placeholder="Type a command..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="cmd-palette-esc">esc</kbd>
        </div>

        <div className="cmd-palette-results" ref={listRef}>
          {results.length === 0 ? (
            <div className="cmd-palette-empty">No matching commands</div>
          ) : (
            grouped.map((group) => (
              <div key={group.category} className="cmd-palette-group">
                <div className="cmd-palette-group-label">{group.category}</div>
                {group.commands.map((cmd) => {
                  const idx = flatIndex++;
                  return (
                    <button
                      key={cmd.id}
                      data-index={idx}
                      className={`cmd-palette-item ${idx === selectedIndex ? "cmd-palette-item-active" : ""}`}
                      onClick={() => handleSelect(cmd.id)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      {cmd.icon && (
                        <span className="cmd-palette-item-icon">
                          {cmd.icon}
                        </span>
                      )}
                      <span className="cmd-palette-item-label">
                        {cmd.label}
                      </span>
                      {cmd.shortcut && (
                        <span className="cmd-palette-item-shortcut">
                          {cmd.shortcut}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SearchIcon() {
  return (
    <svg
      className="cmd-palette-search-icon"
      width="16"
      height="16"
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
