import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/file-explorer.css";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

interface FlatNode {
  name: string;
  absPath: string;
  relPath: string;
  isDir: boolean;
  depth: number;
  isExpanded: boolean;
}

interface FileExplorerProps {
  cwd: string;
  onClose: () => void;
  onFileSelect: (path: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const FILE_ICONS: Record<string, { icon: string; color: string }> = {
  ts:   { icon: "TS", color: "var(--accent)" },
  tsx:  { icon: "TX", color: "var(--accent)" },
  js:   { icon: "JS", color: "var(--warning)" },
  jsx:  { icon: "JX", color: "var(--warning)" },
  rs:   { icon: "RS", color: "#dea584" },
  py:   { icon: "PY", color: "#4b8bbe" },
  go:   { icon: "GO", color: "#00add8" },
  json: { icon: "{}", color: "var(--text-tertiary)" },
  toml: { icon: "TM", color: "var(--text-tertiary)" },
  yaml: { icon: "YM", color: "var(--text-tertiary)" },
  yml:  { icon: "YM", color: "var(--text-tertiary)" },
  md:   { icon: "MD", color: "var(--text-secondary)" },
  css:  { icon: "CS", color: "#264de4" },
  html: { icon: "HT", color: "#e34c26" },
  sql:  { icon: "SQ", color: "#e38d13" },
  sh:   { icon: "SH", color: "var(--success)" },
  lock: { icon: "LK", color: "var(--text-tertiary)" },
};

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  M: { label: "M", cls: "fe-status--modified" },
  A: { label: "A", cls: "fe-status--added" },
  D: { label: "D", cls: "fe-status--deleted" },
  R: { label: "R", cls: "fe-status--renamed" },
  U: { label: "U", cls: "fe-status--untracked" },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fileIconFor(name: string): { icon: string; color: string } {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return FILE_ICONS[ext] ?? { icon: "—", color: "var(--text-muted)" };
}

function toRelPath(absPath: string, cwd: string): string {
  return absPath.startsWith(cwd + "/") ? absPath.slice(cwd.length + 1) : absPath;
}

function buildNodes(entries: DirEntry[], cwd: string, depth: number): FlatNode[] {
  return entries.map((e) => ({
    name: e.name,
    absPath: e.path,
    relPath: toRelPath(e.path, cwd),
    isDir: e.is_dir,
    depth,
    isExpanded: false,
  }));
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function FileExplorer({ cwd, onClose, onFileSelect }: FileExplorerProps) {
  const [flatNodes, setFlatNodes] = useState<FlatNode[]>([]);
  const [gitStatuses, setGitStatuses] = useState<Map<string, string>>(new Map());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [initialLoading, setInitialLoading] = useState(true);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  const [filter, setFilter] = useState("");

  // Cache directory listings without causing re-renders
  const childrenCache = useRef<Map<string, DirEntry[]>>(new Map());
  // Prevent concurrent loads for the same path
  const inFlight = useRef<Set<string>>(new Set());

  /* ---- Initialise: load root dir + git statuses ---- */
  useEffect(() => {
    const init = async () => {
      const [rootEntries, statusRecord] = await Promise.all([
        invoke<DirEntry[]>("list_dir", { dirPath: cwd }).catch(() => [] as DirEntry[]),
        invoke<Record<string, string>>("get_worktree_file_statuses", {
          worktreePath: cwd,
        }).catch(() => ({} as Record<string, string>)),
      ]);
      childrenCache.current.set(cwd, rootEntries);
      setFlatNodes(buildNodes(rootEntries, cwd, 0));
      setGitStatuses(new Map(Object.entries(statusRecord)));
      setInitialLoading(false);
    };
    init();
  }, [cwd]);

  /* ---- Expand a directory node ---- */
  const expandDir = useCallback(
    async (node: FlatNode) => {
      if (inFlight.current.has(node.absPath)) return;
      inFlight.current.add(node.absPath);
      setLoadingPaths((prev) => new Set([...prev, node.absPath]));

      let entries = childrenCache.current.get(node.absPath);
      if (!entries) {
        entries = await invoke<DirEntry[]>("list_dir", {
          dirPath: node.absPath,
        }).catch(() => []);
        childrenCache.current.set(node.absPath, entries);
      }

      const children = buildNodes(entries, cwd, node.depth + 1);

      setFlatNodes((prev) => {
        const idx = prev.findIndex((n) => n.absPath === node.absPath);
        if (idx === -1) return prev;
        if (prev[idx].isExpanded) return prev; // collapsed while loading
        const next = [...prev];
        next[idx] = { ...next[idx], isExpanded: true };
        next.splice(idx + 1, 0, ...children);
        return next;
      });

      inFlight.current.delete(node.absPath);
      setLoadingPaths((prev) => {
        const s = new Set(prev);
        s.delete(node.absPath);
        return s;
      });
    },
    [cwd],
  );

  /* ---- Collapse a directory node ---- */
  const collapseDir = useCallback((node: FlatNode) => {
    setFlatNodes((prev) => {
      const idx = prev.findIndex((n) => n.absPath === node.absPath);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], isExpanded: false };
      let end = idx + 1;
      while (end < next.length && next[end].depth > node.depth) end++;
      next.splice(idx + 1, end - idx - 1);
      return next;
    });
  }, []);

  const toggleDir = useCallback(
    (node: FlatNode) => {
      if (node.isExpanded) collapseDir(node);
      else expandDir(node);
    },
    [collapseDir, expandDir],
  );

  /* ---- Select a file for preview ---- */
  const selectFile = useCallback(async (node: FlatNode) => {
    setSelectedPath(node.absPath);
    setFileContent(null);
    setFileError(null);
    setContentLoading(true);
    try {
      const content = await invoke<string>("read_file_content", {
        filePath: node.absPath,
      });
      setFileContent(content);
    } catch (e) {
      setFileError(String(e));
    }
    setContentLoading(false);
  }, []);

  /* ---- Open file externally ---- */
  const openInEditor = useCallback(async () => {
    if (!selectedPath) return;
    try {
      await invoke("open_file_in_editor", { filePath: selectedPath });
    } catch (e) {
      console.error("open_file_in_editor:", e);
    }
  }, [selectedPath]);

  /* ---- Filter visible nodes ---- */
  const visibleNodes = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return flatNodes;
    // In search mode show only files whose relative path contains the query
    return flatNodes.filter((n) => !n.isDir && n.relPath.toLowerCase().includes(q));
  }, [flatNodes, filter]);

  const isSearchMode = filter.trim().length > 0;
  const selectedRelPath = selectedPath ? toRelPath(selectedPath, cwd) : null;
  const lineCount = fileContent ? fileContent.split("\n").length : 0;
  const worktreeName = cwd.split("/").pop() ?? cwd;

  /* ---- Keyboard: Escape closes ---- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="fe-backdrop" onClick={onClose}>
      <div className="fe-panel fe-panel--wide" onClick={(e) => e.stopPropagation()}>
        {/* ── Header ── */}
        <div className="fe-header">
          <div className="fe-header-left">
            <h3 className="fe-title">File Explorer</h3>
            <span className="fe-cwd-badge" title={cwd}>
              {worktreeName}
            </span>
          </div>
          <div className="fe-header-right">
            {selectedPath && (
              <>
                <button
                  className="fe-action-btn fe-action-btn--secondary"
                  onClick={() => onFileSelect(selectedPath)}
                  title="Open in Blame View"
                >
                  Blame ↗
                </button>
                <button
                  className="fe-action-btn"
                  onClick={openInEditor}
                  title="Open in default editor"
                >
                  Open ↗
                </button>
              </>
            )}
            <button className="fe-close" onClick={onClose}>
              ×
            </button>
          </div>
        </div>

        {/* ── Two-pane body ── */}
        <div className="fe-body-container">
          {/* LEFT: file tree */}
          <div className="fe-tree-pane">
            <div className="fe-search-row">
              <input
                className="fe-search-input"
                type="text"
                placeholder="Filter files…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                spellCheck={false}
                autoFocus
              />
              {filter && (
                <button className="fe-clear-btn" onClick={() => setFilter("")}>
                  ×
                </button>
              )}
            </div>

            <div className="fe-tree-scroll">
              {initialLoading ? (
                <div className="fe-empty">Loading…</div>
              ) : visibleNodes.length === 0 ? (
                <div className="fe-empty">
                  {isSearchMode ? "No files match filter." : "Empty directory."}
                </div>
              ) : (
                visibleNodes.map((node) => {
                  const statusLetter = gitStatuses.get(node.relPath);
                  const statusStyle = statusLetter ? STATUS_STYLES[statusLetter] : null;
                  const isSelected = node.absPath === selectedPath;
                  const isLoading = loadingPaths.has(node.absPath);
                  const { icon, color } = fileIconFor(node.name);

                  return (
                    <div
                      key={node.absPath}
                      className={[
                        "fe-tree-node",
                        node.isDir ? "fe-tree-node--dir" : "fe-tree-node--file",
                        isSelected ? "fe-tree-node--selected" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={{ paddingLeft: `${8 + node.depth * 16}px` }}
                      onClick={() =>
                        node.isDir ? toggleDir(node) : selectFile(node)
                      }
                      title={node.relPath}
                    >
                      {node.isDir ? (
                        <span className="fe-tree-arrow">
                          {isLoading ? "·" : node.isExpanded ? "▾" : "▸"}
                        </span>
                      ) : (
                        <span
                          className="fe-file-icon"
                          style={{ color: isSelected ? "inherit" : color }}
                        >
                          {icon}
                        </span>
                      )}
                      <span className="fe-tree-name">{node.name}</span>
                      {statusStyle && (
                        <span className={`fe-file-status ${statusStyle.cls}`}>
                          {statusStyle.label}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT: file preview */}
          <div className="fe-preview-pane">
            {!selectedPath ? (
              <div className="fe-preview-placeholder">
                <span className="fe-preview-placeholder-icon">≡</span>
                <span className="fe-preview-placeholder-text">
                  Select a file to preview
                </span>
              </div>
            ) : contentLoading ? (
              <div className="fe-preview-placeholder">
                <span className="fe-preview-placeholder-text">Loading…</span>
              </div>
            ) : fileError ? (
              <div className="fe-preview-placeholder fe-preview-placeholder--error">
                <span className="fe-preview-error">{fileError}</span>
                <button
                  className="fe-action-btn"
                  style={{ marginTop: 14 }}
                  onClick={openInEditor}
                >
                  Open in Editor ↗
                </button>
              </div>
            ) : fileContent !== null ? (
              <div className="fe-preview-content">
                <div className="fe-preview-bar">
                  <span className="fe-preview-filename">{selectedRelPath}</span>
                  <span className="fe-preview-meta">{lineCount} lines</span>
                </div>
                <div className="fe-code-scroll">
                  <pre className="fe-code">
                    {fileContent.split("\n").map((line, i) => (
                      <div key={i} className="fe-code-line">
                        <span className="fe-line-num">{i + 1}</span>
                        <span className="fe-line-content">{line || "\u200b"}</span>
                      </div>
                    ))}
                  </pre>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
