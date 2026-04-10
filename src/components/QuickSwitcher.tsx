import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/quick-switcher.css";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface QuickSwitcherProps {
  open: boolean;
  onClose: () => void;
  selectedProjectId: number | null;
  onSwitchProject: (id: number) => void;
  onSwitchBranch: (name: string) => void;
  onOpenFile?: (path: string) => void;
}

interface ProjectItem {
  id: number;
  name: string;
  path: string;
}

interface BranchItem {
  name: string;
  is_current: boolean;
}

interface RecentFileItem {
  name: string;
  path: string;
}

type SwitcherItem =
  | { section: "projects"; data: ProjectItem }
  | { section: "branches"; data: BranchItem }
  | { section: "files"; data: RecentFileItem };

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SECTION_LABELS: Record<string, string> = {
  projects: "Projects",
  branches: "Branches",
  files: "Recent Files",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escapedQuery})`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="quick-switcher__highlight">
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

export function QuickSwitcher({
  open,
  onClose,
  selectedProjectId,
  onSwitchProject,
  onSwitchBranch,
  onOpenFile,
}: QuickSwitcherProps) {
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [recentFiles] = useState<RecentFileItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Fetch projects and branches when opened
  useEffect(() => {
    if (!open) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const projectList = await invoke<ProjectItem[]>("list_projects");
        setProjects(projectList);
      } catch {
        setProjects([]);
      }

      if (selectedProjectId !== null) {
        try {
          const branchList = await invoke<BranchItem[]>("list_branches", {
            projectId: selectedProjectId,
          });
          setBranches(branchList);
        } catch {
          setBranches([]);
        }
      } else {
        setBranches([]);
      }

      setLoading(false);
    };

    fetchData();
  }, [open, selectedProjectId]);

  // Filter results based on query
  const filteredItems = useMemo<SwitcherItem[]>(() => {
    const lowerQuery = query.toLowerCase().trim();
    const items: SwitcherItem[] = [];

    const filteredProjects = lowerQuery
      ? projects.filter(
          (p) =>
            p.name.toLowerCase().includes(lowerQuery) ||
            p.path.toLowerCase().includes(lowerQuery),
        )
      : projects;

    for (const p of filteredProjects) {
      items.push({ section: "projects", data: p });
    }

    const filteredBranches = lowerQuery
      ? branches.filter((b) => b.name.toLowerCase().includes(lowerQuery))
      : branches;

    for (const b of filteredBranches) {
      items.push({ section: "branches", data: b });
    }

    const filteredFiles = lowerQuery
      ? recentFiles.filter(
          (f) =>
            f.name.toLowerCase().includes(lowerQuery) ||
            f.path.toLowerCase().includes(lowerQuery),
        )
      : recentFiles;

    for (const f of filteredFiles) {
      items.push({ section: "files", data: f });
    }

    return items;
  }, [query, projects, branches, recentFiles]);

  // Group items by section for rendering
  const grouped = useMemo(() => {
    const groups = new Map<string, SwitcherItem[]>();
    for (const item of filteredItems) {
      const existing = groups.get(item.section);
      if (existing) {
        existing.push(item);
      } else {
        groups.set(item.section, [item]);
      }
    }
    return Array.from(groups.entries()).map(([section, items]) => ({
      section,
      label: SECTION_LABELS[section] || section,
      items,
    }));
  }, [filteredItems]);

  // Keep selection in bounds
  useEffect(() => {
    if (selectedIndex >= filteredItems.length) {
      setSelectedIndex(Math.max(0, filteredItems.length - 1));
    }
  }, [filteredItems.length, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.querySelector(
      `[data-switcher-index="${selectedIndex}"]`,
    );
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleSelect = useCallback(
    (item: SwitcherItem) => {
      switch (item.section) {
        case "projects":
          onSwitchProject((item.data as ProjectItem).id);
          break;
        case "branches":
          onSwitchBranch((item.data as BranchItem).name);
          break;
        case "files":
          onOpenFile?.((item.data as RecentFileItem).path);
          break;
      }
      onClose();
    },
    [onSwitchProject, onSwitchBranch, onOpenFile, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filteredItems.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredItems[selectedIndex]) {
            handleSelect(filteredItems[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filteredItems, selectedIndex, handleSelect, onClose],
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
    <div className="quick-switcher__backdrop" onClick={handleBackdropClick}>
      <div
        className="quick-switcher__panel"
        role="dialog"
        aria-label="Quick Switcher"
      >
        {/* Search input */}
        <div className="quick-switcher__input-wrap">
          <SearchIcon />
          <input
            ref={inputRef}
            className="quick-switcher__input"
            type="text"
            placeholder="Switch to project, branch, or file..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoComplete="off"
          />
          {loading && <span className="quick-switcher__spinner" />}
          <kbd className="quick-switcher__esc">esc</kbd>
        </div>

        {/* Results */}
        <div className="quick-switcher__results" ref={listRef}>
          {/* Empty state */}
          {!loading && filteredItems.length === 0 && !query && (
            <div className="quick-switcher__empty">
              No projects or branches available
            </div>
          )}

          {/* No matches */}
          {!loading && filteredItems.length === 0 && query && (
            <div className="quick-switcher__empty">
              No results for &quot;{query}&quot;
            </div>
          )}

          {/* Grouped results */}
          {grouped.map((group) => (
            <div key={group.section} className="quick-switcher__group">
              <div className="quick-switcher__group-label">
                <span className="quick-switcher__section-badge">
                  <SectionIcon section={group.section} />
                  {group.label}
                </span>
              </div>
              {group.items.map((item) => {
                const idx = flatIndex++;
                return (
                  <button
                    key={`${item.section}-${getItemKey(item)}`}
                    data-switcher-index={idx}
                    className={`quick-switcher__item ${idx === selectedIndex ? "quick-switcher__item--active" : ""}`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <span className="quick-switcher__item-icon">
                      <ItemIcon item={item} />
                    </span>
                    <div className="quick-switcher__item-text">
                      <span className="quick-switcher__item-title">
                        {highlightMatch(getItemTitle(item), query)}
                      </span>
                      {getItemSubtitle(item) && (
                        <span className="quick-switcher__item-subtitle">
                          {highlightMatch(getItemSubtitle(item), query)}
                        </span>
                      )}
                    </div>
                    {item.section === "branches" &&
                      (item.data as BranchItem).is_current && (
                        <span className="quick-switcher__current-badge">
                          current
                        </span>
                      )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer hints */}
        {filteredItems.length > 0 && (
          <div className="quick-switcher__footer">
            <span className="quick-switcher__hint">
              <kbd>Up</kbd>/<kbd>Down</kbd> navigate
            </span>
            <span className="quick-switcher__hint">
              <kbd>Enter</kbd> switch
            </span>
            <span className="quick-switcher__hint">
              <kbd>Esc</kbd> close
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Item helpers                                                       */
/* ------------------------------------------------------------------ */

function getItemKey(item: SwitcherItem): string {
  switch (item.section) {
    case "projects":
      return String((item.data as ProjectItem).id);
    case "branches":
      return (item.data as BranchItem).name;
    case "files":
      return (item.data as RecentFileItem).path;
  }
}

function getItemTitle(item: SwitcherItem): string {
  switch (item.section) {
    case "projects":
      return (item.data as ProjectItem).name;
    case "branches":
      return (item.data as BranchItem).name;
    case "files":
      return (item.data as RecentFileItem).name;
  }
}

function getItemSubtitle(item: SwitcherItem): string {
  switch (item.section) {
    case "projects":
      return (item.data as ProjectItem).path;
    case "branches":
      return "";
    case "files":
      return (item.data as RecentFileItem).path;
  }
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

function SearchIcon() {
  return (
    <svg
      className="quick-switcher__search-icon"
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

function SectionIcon({ section }: { section: string }) {
  switch (section) {
    case "projects":
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          style={{ marginRight: 4 }}
        >
          <rect
            x="2"
            y="3"
            width="12"
            height="10"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <path d="M2 6H14" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      );
    case "branches":
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          style={{ marginRight: 4 }}
        >
          <path
            d="M5 3V10C5 11.66 6.34 13 8 13H11"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          <circle
            cx="5"
            cy="3"
            r="1.5"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <circle
            cx="11"
            cy="13"
            r="1.5"
            stroke="currentColor"
            strokeWidth="1.3"
          />
        </svg>
      );
    case "files":
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          style={{ marginRight: 4 }}
        >
          <path
            d="M4 2H9L12 5V14H4V2Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path d="M9 2V5H12" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      );
    default:
      return null;
  }
}

function ItemIcon({ item }: { item: SwitcherItem }) {
  switch (item.section) {
    case "projects":
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect
            x="2"
            y="3"
            width="12"
            height="10"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <path d="M2 6H14" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      );
    case "branches":
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M5 3V10C5 11.66 6.34 13 8 13H11"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          <circle
            cx="5"
            cy="3"
            r="1.5"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <circle
            cx="11"
            cy="13"
            r="1.5"
            stroke="currentColor"
            strokeWidth="1.3"
          />
        </svg>
      );
    case "files":
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M4 2H9L12 5V14H4V2Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path d="M9 2V5H12" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      );
    default:
      return null;
  }
}
