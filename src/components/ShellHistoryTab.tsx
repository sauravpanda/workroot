import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/shell-history.css";

interface ShellHistoryEntry {
  id: number;
  project_id: number;
  branch: string | null;
  command: string;
  exit_code: number | null;
  cwd: string | null;
  timestamp: string;
}

interface ShellHistoryTabProps {
  projectId: number;
  branch?: string;
}

function relativeTime(timestamp: string): string {
  const date = new Date(timestamp + "Z");
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "just now";
  if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    return `${mins}m ago`;
  }
  if (diffSec < 86400) {
    const hrs = Math.floor(diffSec / 3600);
    return `${hrs}h ago`;
  }
  const days = Math.floor(diffSec / 86400);
  return `${days}d ago`;
}

export function ShellHistoryTab({ projectId, branch }: ShellHistoryTabProps) {
  const [entries, setEntries] = useState<ShellHistoryEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "success" | "failed">("all");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      if (searchQuery.trim()) {
        const results = await invoke<ShellHistoryEntry[]>(
          "search_shell_history",
          {
            projectId,
            query: searchQuery.trim(),
            limit: 500,
          }
        );
        setEntries(results);
      } else {
        const results = await invoke<ShellHistoryEntry[]>(
          "get_shell_history",
          {
            projectId,
            branch: branch || null,
            limit: 500,
          }
        );
        setEntries(results);
      }
    } catch (err) {
      console.error("Failed to load shell history:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId, branch, searchQuery]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      loadHistory();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, loadHistory]);

  const filteredEntries = entries.filter((entry) => {
    if (filter === "success") return entry.exit_code === 0;
    if (filter === "failed") return entry.exit_code !== null && entry.exit_code !== 0;
    return true;
  });

  const copyCommand = async (entry: ShellHistoryEntry) => {
    try {
      await navigator.clipboard.writeText(entry.command);
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard API may not be available
    }
  };

  if (!loading && entries.length === 0 && !searchQuery) {
    return (
      <div className="shell-history-empty">
        <div className="shell-history-empty-icon">$</div>
        <p>No commands captured yet</p>
        <p className="shell-history-empty-hint">
          Install the shell hook to start capturing commands
        </p>
      </div>
    );
  }

  return (
    <div className="shell-history">
      <div className="shell-history-toolbar">
        <input
          type="text"
          className="shell-history-search"
          placeholder="Search commands..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="shell-history-filters">
          <button
            className={`shell-history-filter ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            className={`shell-history-filter ${filter === "success" ? "active" : ""}`}
            onClick={() => setFilter("success")}
          >
            Success
          </button>
          <button
            className={`shell-history-filter ${filter === "failed" ? "active" : ""}`}
            onClick={() => setFilter("failed")}
          >
            Failed
          </button>
        </div>
        <span className="shell-history-count">
          {filteredEntries.length} command{filteredEntries.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="shell-history-list">
        {filteredEntries.map((entry) => (
          <div
            key={entry.id}
            className={`shell-history-entry ${
              entry.exit_code !== null && entry.exit_code !== 0
                ? "failed"
                : "success"
            }`}
            onClick={() => copyCommand(entry)}
            title="Click to copy"
          >
            <div className="shell-history-entry-status">
              {entry.exit_code === 0 ? (
                <span className="status-ok">&#10003;</span>
              ) : entry.exit_code !== null ? (
                <span className="status-err">&#10007;</span>
              ) : (
                <span className="status-unknown">?</span>
              )}
            </div>
            <div className="shell-history-entry-content">
              <code className="shell-history-command">{entry.command}</code>
              <div className="shell-history-meta">
                <span
                  className="shell-history-time"
                  title={entry.timestamp}
                >
                  {relativeTime(entry.timestamp)}
                </span>
                {entry.branch && (
                  <span className="shell-history-branch">{entry.branch}</span>
                )}
                {entry.exit_code !== null && entry.exit_code !== 0 && (
                  <span className="shell-history-exit">
                    exit {entry.exit_code}
                  </span>
                )}
              </div>
            </div>
            <div className="shell-history-copy">
              {copiedId === entry.id ? "Copied!" : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
