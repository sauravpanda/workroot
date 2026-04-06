import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Dialog, DialogContent } from "./ui/dialog";

interface ClipboardEntry {
  id: number;
  content: string;
  source: string | null;
  created_at: string;
}

interface ClipboardHistoryProps {
  onClose: () => void;
}

function formatRelativeDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return `${diffDay}d ago`;
    const diffMon = Math.floor(diffDay / 30);
    if (diffMon < 12) return `${diffMon}mo ago`;
    return `${Math.floor(diffMon / 12)}y ago`;
  } catch {
    return dateStr;
  }
}

function getPreviewLines(content: string, maxLines: number): string {
  const lines = content.split("\n");
  if (lines.length <= maxLines) return content;
  return lines.slice(0, maxLines).join("\n");
}

export function ClipboardHistory({ onClose }: ClipboardHistoryProps) {
  const [entries, setEntries] = useState<ClipboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      let result: ClipboardEntry[];
      if (search.trim()) {
        result = await invoke<ClipboardEntry[]>("search_clipboard", {
          query: search.trim(),
        });
      } else {
        result = await invoke<ClipboardEntry[]>("list_clipboard_entries");
      }
      setEntries(result);
    } catch {
      setEntries([]);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleCopy = useCallback(async (entry: ClipboardEntry) => {
    try {
      await navigator.clipboard.writeText(entry.content);
      setCopiedId(entry.id);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // copy failed
    }
  }, []);

  const handleClearAll = useCallback(async () => {
    try {
      await invoke("clear_clipboard_history");
      setConfirmClear(false);
      await loadEntries();
    } catch {
      // clear failed
    }
  }, [loadEntries]);

  const toggleExpand = useCallback((id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="cliph-panel">
        <div className="cliph-header">
          <h3 className="cliph-title">Clipboard History</h3>
          <div className="cliph-header-actions">
            {confirmClear ? (
              <>
                <button
                  className="cliph-clear-btn cliph-clear-confirm"
                  onClick={handleClearAll}
                >
                  Confirm Clear
                </button>
                <button
                  className="cliph-clear-btn"
                  onClick={() => setConfirmClear(false)}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                className="cliph-clear-btn"
                onClick={() => setConfirmClear(true)}
              >
                Clear All
              </button>
            )}
            <button className="cliph-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        <div className="cliph-search-row">
          <input
            className="cliph-search"
            type="text"
            placeholder="Search clipboard..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="cliph-list">
          {loading ? (
            <div className="cliph-empty">Loading clipboard...</div>
          ) : entries.length === 0 ? (
            <div className="cliph-empty">No clipboard entries.</div>
          ) : (
            entries.map((entry) => {
              const isExpanded = expandedId === entry.id;
              const isCopied = copiedId === entry.id;
              const hasMore = entry.content.split("\n").length > 2;
              return (
                <div
                  key={entry.id}
                  className={`cliph-item ${isCopied ? "cliph-item-copied" : ""}`}
                  onClick={() => handleCopy(entry)}
                >
                  <div className="cliph-item-top">
                    <pre className="cliph-preview">
                      {isExpanded
                        ? entry.content
                        : getPreviewLines(entry.content, 2)}
                    </pre>
                    {hasMore && (
                      <button
                        className="cliph-expand-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(entry.id);
                        }}
                      >
                        {isExpanded ? "Less" : "More"}
                      </button>
                    )}
                  </div>
                  <div className="cliph-item-bottom">
                    {entry.source && (
                      <span className="cliph-source">{entry.source}</span>
                    )}
                    <span className="cliph-time">
                      {formatRelativeDate(entry.created_at)}
                    </span>
                    {isCopied && (
                      <span className="cliph-copied-badge">Copied</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
