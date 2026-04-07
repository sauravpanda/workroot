import { useState, useMemo } from "react";

const HUNKS_PER_PAGE = 20;

interface DiffLine {
  origin: string;
  content: string;
  old_lineno: number | null;
  new_lineno: number | null;
}

interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  hunks: DiffHunk[];
  is_binary: boolean;
}

interface DiffViewerProps {
  diff: FileDiff;
}

export function DiffViewer({ diff }: DiffViewerProps) {
  const [visiblePages, setVisiblePages] = useState(1);

  const visibleHunks = useMemo(
    () => diff.hunks.slice(0, visiblePages * HUNKS_PER_PAGE),
    [diff.hunks, visiblePages],
  );

  const hasMoreHunks = visibleHunks.length < diff.hunks.length;

  if (diff.is_binary) {
    return (
      <div className="p-6 text-center text-[13px] text-[var(--text-muted)]">
        Binary file changed
      </div>
    );
  }

  if (diff.hunks.length === 0) {
    return (
      <div className="p-6 text-center text-[13px] text-[var(--text-muted)]">
        No changes (file may be newly staged)
      </div>
    );
  }

  return (
    <div className="font-mono text-xs leading-[1.5]">
      <div className="border-b border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-muted)]">
        {diff.path}
        {diff.hunks.length > HUNKS_PER_PAGE && (
          <span className="ml-2 text-[10px] opacity-60">
            ({diff.hunks.length} hunks)
          </span>
        )}
      </div>
      {visibleHunks.map((hunk, hi) => (
        <div key={hi} className="border-b border-[var(--border)]">
          <div className="border-b border-[var(--border)] bg-[rgba(96,165,250,0.08)] px-3 py-1 text-[11px] text-[#60a5fa]">
            {hunk.header.trim()}
          </div>
          {hunk.lines.map((line, li) => {
            const isAddition = line.origin === "+";
            const isDeletion = line.origin === "-";
            return (
              <div
                key={li}
                className={`flex min-h-[20px] ${isAddition ? "bg-[rgba(74,222,128,0.08)]" : isDeletion ? "bg-[rgba(248,113,113,0.08)]" : ""}`}
              >
                <div className="w-11 min-w-[44px] select-none border-r border-[var(--border)] px-1.5 text-right text-[11px] leading-[20px] text-[var(--text-muted)]">
                  {line.old_lineno ?? ""}
                </div>
                <div className="w-11 min-w-[44px] select-none border-r border-[var(--border)] px-1.5 text-right text-[11px] leading-[20px] text-[var(--text-muted)]">
                  {line.new_lineno ?? ""}
                </div>
                <div
                  className={`w-4 min-w-[16px] select-none text-center leading-[20px] ${isAddition ? "text-[#4ade80]" : isDeletion ? "text-[#f87171]" : ""}`}
                >
                  {line.origin}
                </div>
                <div className="flex-1 break-all px-2 leading-[20px] text-[var(--text-primary)] [white-space:pre-wrap]">
                  {line.content}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {hasMoreHunks && (
        <div className="flex justify-center border-b border-[var(--border)] py-2">
          <button
            className="rounded px-3 py-1 text-[11px] text-[#60a5fa] hover:bg-[rgba(96,165,250,0.12)]"
            onClick={() => setVisiblePages((p) => p + 1)}
          >
            Show more hunks ({diff.hunks.length - visibleHunks.length}{" "}
            remaining)
          </button>
        </div>
      )}
    </div>
  );
}
