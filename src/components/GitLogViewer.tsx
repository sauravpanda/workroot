import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface CommitEntry {
  id: string;
  short_id: string;
  author: string;
  email: string;
  date: string;
  message: string;
  parent_ids: string[];
}

interface GitLogViewerProps {
  worktreeId: number;
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

function truncateMessage(msg: string, maxLen: number): string {
  const firstLine = msg.split("\n")[0];
  if (firstLine.length <= maxLen) return firstLine;
  return firstLine.slice(0, maxLen - 3) + "...";
}

export function GitLogViewer({ worktreeId, onClose }: GitLogViewerProps) {
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const loadLog = useCallback(
    async (pageNum: number, append: boolean) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      try {
        const result = await invoke<CommitEntry[]>("get_git_log", {
          worktreeId,
          page: pageNum,
          perPage: 50,
        });
        if (append) {
          setCommits((prev) => [...prev, ...result]);
        } else {
          setCommits(result);
        }
        setHasMore(result.length === 50);
      } catch {
        if (!append) setCommits([]);
        setHasMore(false);
      }
      if (append) {
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    },
    [worktreeId],
  );

  useEffect(() => {
    setPage(0);
    setExpandedId(null);
    loadLog(0, false);
  }, [loadLog]);

  const handleLoadMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadLog(nextPage, true);
  }, [page, loadLog]);

  const handleSearch = useCallback(async () => {
    if (!search.trim()) {
      setPage(0);
      loadLog(0, false);
      return;
    }
    setLoading(true);
    try {
      const result = await invoke<CommitEntry[]>("search_git_log", {
        worktreeId,
        query: search.trim(),
      });
      setCommits(result);
      setHasMore(false);
    } catch {
      setCommits([]);
      setHasMore(false);
    }
    setLoading(false);
  }, [worktreeId, search, loadLog]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="gitlog-backdrop" onClick={onClose}>
      <div className="gitlog-panel" onClick={(e) => e.stopPropagation()}>
        <div className="gitlog-header">
          <h3 className="gitlog-title">Git Log</h3>
          <button className="gitlog-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="gitlog-search-row">
          <input
            className="gitlog-search"
            type="text"
            placeholder="Search commits..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
          />
          <button className="gitlog-search-btn" onClick={handleSearch}>
            Search
          </button>
        </div>

        <div className="gitlog-list">
          {loading ? (
            <div className="gitlog-empty">Loading commits...</div>
          ) : commits.length === 0 ? (
            <div className="gitlog-empty">No commits found.</div>
          ) : (
            <>
              {commits.map((commit) => {
                const isMerge = commit.parent_ids.length > 1;
                const isExpanded = expandedId === commit.id;
                return (
                  <div key={commit.id} className="gitlog-row">
                    <div className="gitlog-graph">
                      <div className="gitlog-lane" />
                      <div
                        className={`gitlog-dot ${isMerge ? "gitlog-dot-merge" : ""}`}
                      />
                      {isMerge && <div className="gitlog-merge-indicator" />}
                    </div>
                    <button
                      className={`gitlog-entry ${isExpanded ? "gitlog-entry-expanded" : ""}`}
                      onClick={() => toggleExpand(commit.id)}
                    >
                      <div className="gitlog-entry-top">
                        <span className="gitlog-short-id">
                          {commit.short_id}
                        </span>
                        <span className="gitlog-msg">
                          {truncateMessage(commit.message, 72)}
                        </span>
                        <span className="gitlog-author">{commit.author}</span>
                        <span className="gitlog-date">
                          {formatRelativeDate(commit.date)}
                        </span>
                      </div>
                      {isExpanded && (
                        <div className="gitlog-detail">
                          <div className="gitlog-detail-row">
                            <span className="gitlog-detail-label">Commit:</span>
                            <span className="gitlog-detail-value gitlog-mono">
                              {commit.id}
                            </span>
                          </div>
                          <div className="gitlog-detail-row">
                            <span className="gitlog-detail-label">Author:</span>
                            <span className="gitlog-detail-value">
                              {commit.author} &lt;{commit.email}&gt;
                            </span>
                          </div>
                          {commit.parent_ids.length > 0 && (
                            <div className="gitlog-detail-row">
                              <span className="gitlog-detail-label">
                                Parent{commit.parent_ids.length > 1 ? "s" : ""}:
                              </span>
                              <span className="gitlog-detail-value gitlog-mono">
                                {commit.parent_ids
                                  .map((p) => p.slice(0, 8))
                                  .join(" ")}
                              </span>
                            </div>
                          )}
                          <div className="gitlog-detail-msg">
                            {commit.message}
                          </div>
                        </div>
                      )}
                    </button>
                  </div>
                );
              })}
              {hasMore && (
                <div className="gitlog-load-more">
                  <button
                    className="gitlog-load-more-btn"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? "Loading..." : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
