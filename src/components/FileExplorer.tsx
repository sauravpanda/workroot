import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/file-explorer.css";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ChangedFile {
  path: string;
  status: string;
}

interface FileExplorerProps {
  cwd: string;
  onClose: () => void;
  onFileSelect: (path: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const FILE_ICONS: Record<string, { icon: string; color: string }> = {
  ts: { icon: "TS", color: "var(--accent)" },
  tsx: { icon: "TX", color: "var(--accent)" },
  js: { icon: "JS", color: "var(--warning)" },
  jsx: { icon: "JX", color: "var(--warning)" },
  rs: { icon: "RS", color: "#dea584" },
  py: { icon: "PY", color: "#4b8bbe" },
  go: { icon: "GO", color: "#00add8" },
  json: { icon: "{}", color: "var(--text-tertiary)" },
  toml: { icon: "TM", color: "var(--text-tertiary)" },
  yaml: { icon: "YM", color: "var(--text-tertiary)" },
  yml: { icon: "YM", color: "var(--text-tertiary)" },
  md: { icon: "MD", color: "var(--text-secondary)" },
  css: { icon: "CS", color: "#264de4" },
  html: { icon: "HT", color: "#e34c26" },
  sql: { icon: "SQ", color: "#e38d13" },
  sh: { icon: "SH", color: "var(--success)" },
  lock: { icon: "LK", color: "var(--text-tertiary)" },
};

function getFileIcon(filePath: string): { icon: string; color: string } {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return FILE_ICONS[ext] ?? { icon: "--", color: "var(--text-tertiary)" };
}

function getStatusLabel(status: string): {
  label: string;
  className: string;
} {
  switch (status.toLowerCase()) {
    case "modified":
    case "m":
      return { label: "M", className: "fe-status--modified" };
    case "added":
    case "a":
      return { label: "A", className: "fe-status--added" };
    case "deleted":
    case "d":
      return { label: "D", className: "fe-status--deleted" };
    case "renamed":
    case "r":
      return { label: "R", className: "fe-status--renamed" };
    case "untracked":
    case "?":
      return { label: "U", className: "fe-status--untracked" };
    default:
      return { label: status.slice(0, 1).toUpperCase(), className: "" };
  }
}

function fileName(filePath: string): string {
  const parts = filePath.split("/");
  return parts[parts.length - 1] || filePath;
}

function fileDir(filePath: string): string {
  const parts = filePath.split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/") + "/";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function FileExplorer({
  cwd,
  onClose,
  onFileSelect,
}: FileExplorerProps) {
  const [changedFiles, setChangedFiles] = useState<ChangedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualPath, setManualPath] = useState("");
  const [filter, setFilter] = useState("");

  const loadChangedFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const files = await invoke<ChangedFile[]>("get_changed_files", {
        worktreePath: cwd,
      });
      setChangedFiles(files);
    } catch (e) {
      setError(String(e));
      setChangedFiles([]);
    }
    setLoading(false);
  }, [cwd]);

  useEffect(() => {
    loadChangedFiles();
  }, [loadChangedFiles]);

  const handleManualOpen = useCallback(() => {
    const trimmed = manualPath.trim();
    if (!trimmed) return;
    const fullPath = trimmed.startsWith("/") ? trimmed : `${cwd}/${trimmed}`;
    onFileSelect(fullPath);
    setManualPath("");
  }, [manualPath, cwd, onFileSelect]);

  const filteredFiles = filter.trim()
    ? changedFiles.filter((f) =>
        f.path.toLowerCase().includes(filter.toLowerCase()),
      )
    : changedFiles;

  // Group files by directory
  const grouped = new Map<string, ChangedFile[]>();
  for (const file of filteredFiles) {
    const dir = fileDir(file.path) || ".";
    const existing = grouped.get(dir);
    if (existing) {
      existing.push(file);
    } else {
      grouped.set(dir, [file]);
    }
  }

  return (
    <div className="fe-backdrop" onClick={onClose}>
      <div className="fe-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="fe-header">
          <h3 className="fe-title">File Explorer</h3>
          <button className="fe-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* CWD indicator */}
        <div className="fe-cwd">
          <span className="fe-cwd-label">Root</span>
          <span className="fe-cwd-path">{cwd}</span>
        </div>

        {/* Manual path input */}
        <div className="fe-manual">
          <input
            className="fe-manual-input"
            type="text"
            placeholder="Enter relative file path..."
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleManualOpen();
            }}
          />
          <button
            className="fe-manual-btn"
            onClick={handleManualOpen}
            disabled={!manualPath.trim()}
          >
            Open
          </button>
        </div>

        {/* Filter */}
        <div className="fe-filter-row">
          <input
            className="fe-filter-input"
            type="text"
            placeholder="Filter changed files..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            spellCheck={false}
          />
          <button
            className="fe-refresh-btn"
            onClick={loadChangedFiles}
            title="Refresh"
          >
            {"\u21BB"}
          </button>
        </div>

        {/* File list */}
        <div className="fe-body">
          {error && <div className="fe-error">{error}</div>}

          {loading ? (
            <div className="fe-empty">Loading changed files...</div>
          ) : filteredFiles.length === 0 ? (
            <div className="fe-empty">
              {changedFiles.length === 0
                ? "No changed files detected."
                : "No files match filter."}
            </div>
          ) : (
            <div className="fe-tree">
              {Array.from(grouped.entries()).map(([dir, files]) => (
                <div key={dir} className="fe-group">
                  <div className="fe-group-header">
                    <span className="fe-folder-icon">{"\u25BE"}</span>
                    <span className="fe-group-name">{dir}</span>
                  </div>
                  {files.map((file) => {
                    const { icon, color } = getFileIcon(file.path);
                    const { label, className } = getStatusLabel(file.status);
                    return (
                      <button
                        key={file.path}
                        className="fe-file-row"
                        onClick={() => onFileSelect(`${cwd}/${file.path}`)}
                        title={file.path}
                      >
                        <span className="fe-file-icon" style={{ color }}>
                          {icon}
                        </span>
                        <span className="fe-file-name">
                          {fileName(file.path)}
                        </span>
                        <span className={`fe-file-status ${className}`}>
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
