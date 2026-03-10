import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/blame-view.css";

interface BlameLine {
  commit_hash: string;
  author: string;
  date: string;
  line_number: number;
  content: string;
  summary: string;
}

interface BlameHunk {
  commit_hash: string;
  author: string;
  date: string;
  summary: string;
  lines: BlameLine[];
}

interface BlameViewProps {
  worktreeId: number;
  filePath: string;
  onClose: () => void;
}

function ageColor(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const daysAgo = (now - then) / (1000 * 60 * 60 * 24);
  if (daysAgo < 7) return "var(--accent)";
  if (daysAgo < 30) return "var(--success)";
  if (daysAgo < 90) return "var(--warning)";
  return "var(--text-muted)";
}

export function BlameView({ worktreeId, filePath, onClose }: BlameViewProps) {
  const [hunks, setHunks] = useState<BlameHunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredCommit, setHoveredCommit] = useState<string | null>(null);

  const loadBlame = useCallback(async () => {
    setLoading(true);
    try {
      const lines = await invoke<BlameLine[]>("blame_file", {
        worktreeId,
        filePath,
      });
      // Group consecutive lines by commit
      const grouped: BlameHunk[] = [];
      let current: BlameHunk | null = null;
      for (const line of lines) {
        if (current && current.commit_hash === line.commit_hash) {
          current.lines.push(line);
        } else {
          current = {
            commit_hash: line.commit_hash,
            author: line.author,
            date: line.date,
            summary: line.summary,
            lines: [line],
          };
          grouped.push(current);
        }
      }
      setHunks(grouped);
    } catch {
      setHunks([]);
    }
    setLoading(false);
  }, [worktreeId, filePath]);

  useEffect(() => {
    loadBlame();
  }, [loadBlame]);

  return (
    <div className="blame-backdrop" onClick={onClose}>
      <div className="blame-panel" onClick={(e) => e.stopPropagation()}>
        <div className="blame-header">
          <h3 className="blame-title">
            Blame &mdash; <code className="blame-filepath">{filePath}</code>
          </h3>
          <button className="blame-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="blame-body">
          {loading ? (
            <div className="blame-empty">Loading blame data...</div>
          ) : hunks.length === 0 ? (
            <div className="blame-empty">No blame data available.</div>
          ) : (
            <table className="blame-table">
              <tbody>
                {hunks.map((hunk) =>
                  hunk.lines.map((line, idx) => (
                    <tr
                      key={line.line_number}
                      className={`blame-row ${hoveredCommit === hunk.commit_hash ? "blame-row-hover" : ""}`}
                      onMouseEnter={() => setHoveredCommit(hunk.commit_hash)}
                      onMouseLeave={() => setHoveredCommit(null)}
                    >
                      <td
                        className="blame-gutter"
                        style={{
                          borderLeftColor: ageColor(hunk.date),
                        }}
                      >
                        {idx === 0 ? (
                          <div
                            className="blame-gutter-info"
                            title={`${hunk.commit_hash}\n${hunk.summary}\n${hunk.author} - ${hunk.date}`}
                          >
                            <span className="blame-author">{hunk.author}</span>
                            <span className="blame-date">{hunk.date}</span>
                          </div>
                        ) : null}
                      </td>
                      <td className="blame-linenum">{line.line_number}</td>
                      <td className="blame-content">
                        <pre className="blame-code">{line.content}</pre>
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
