import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface BlameLine {
  line_number: number;
  content: string;
  commit_hash: string;
  author: string;
  date: string;
  summary: string;
}

interface BlameViewProps {
  worktreeId: number;
  filePath: string;
  onClose: () => void;
}

function relativeDate(isoDate: string): string {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 1) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function commitAgeOpacity(isoDate: string): number {
  if (!isoDate) return 0.4;
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  // Recent commits (< 7 days) are brightest, old commits (> 365 days) are dimmest
  if (diffDays < 7) return 1.0;
  if (diffDays < 30) return 0.85;
  if (diffDays < 90) return 0.7;
  if (diffDays < 365) return 0.55;
  return 0.4;
}

function truncateAuthor(author: string, maxLen: number): string {
  if (author.length <= maxLen) return author;
  return author.slice(0, maxLen - 1) + "\u2026";
}

export function BlameView({ worktreeId, filePath, onClose }: BlameViewProps) {
  const [lines, setLines] = useState<BlameLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await invoke<BlameLine[]>("blame_file", {
          worktreeId,
          filePath,
        });
        if (!cancelled) {
          setLines(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [worktreeId, filePath]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Group consecutive lines with the same commit for alternating backgrounds
  const getRowGroup = (index: number): boolean => {
    if (index === 0) return false;
    let groupToggle = false;
    let prevHash = lines[0]?.commit_hash ?? "";
    for (let i = 1; i <= index; i++) {
      if (lines[i].commit_hash !== prevHash) {
        groupToggle = !groupToggle;
        prevHash = lines[i].commit_hash;
      }
    }
    return groupToggle;
  };

  // Check if this line is the first in its hunk (show blame info only once per hunk)
  const isHunkStart = (index: number): boolean => {
    if (index === 0) return true;
    return lines[index].commit_hash !== lines[index - 1].commit_hash;
  };

  const hoveredBlameLine = hoveredLine !== null ? lines[hoveredLine] : null;

  return (
    <div className="blame-overlay" onClick={handleBackdropClick}>
      <div className="blame-modal" ref={containerRef}>
        <div className="blame-header">
          <span className="blame-file-path" title={filePath}>
            {filePath}
          </span>
          <span className="blame-line-count">
            {lines.length} line{lines.length !== 1 ? "s" : ""}
          </span>
          <button className="blame-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="blame-body">
          {loading && (
            <div className="blame-loading">Loading blame data...</div>
          )}
          {error && <div className="blame-error">{error}</div>}
          {!loading && !error && lines.length === 0 && (
            <div className="blame-empty">No blame data available</div>
          )}
          {!loading && !error && lines.length > 0 && (
            <div className="blame-table">
              {lines.map((line, index) => {
                const showBlame = isHunkStart(index);
                const group = getRowGroup(index);
                const opacity = commitAgeOpacity(line.date);

                return (
                  <div
                    key={line.line_number}
                    className={`blame-row ${group ? "blame-row-alt" : ""}`}
                    onMouseEnter={() => setHoveredLine(index)}
                    onMouseLeave={() => setHoveredLine(null)}
                  >
                    <div className="blame-gutter" style={{ opacity }}>
                      {showBlame ? (
                        <>
                          <span className="blame-author">
                            {truncateAuthor(line.author, 16)}
                          </span>
                          <span className="blame-date">
                            {relativeDate(line.date)}
                          </span>
                        </>
                      ) : (
                        <span className="blame-gutter-empty" />
                      )}
                    </div>
                    <div className="blame-line-number">{line.line_number}</div>
                    <div className="blame-content">
                      <pre>{line.content || " "}</pre>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {hoveredBlameLine && hoveredBlameLine.commit_hash && (
          <div className="blame-tooltip" ref={tooltipRef}>
            <div className="blame-tooltip-hash">
              {hoveredBlameLine.commit_hash.slice(0, 8)}
            </div>
            <div className="blame-tooltip-summary">
              {hoveredBlameLine.summary || "(no message)"}
            </div>
            <div className="blame-tooltip-meta">
              <span>{hoveredBlameLine.author}</span>
              <span>
                {hoveredBlameLine.date
                  ? new Date(hoveredBlameLine.date).toLocaleString()
                  : ""}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
