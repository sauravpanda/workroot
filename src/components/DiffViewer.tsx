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
  if (diff.is_binary) {
    return <div className="diff-viewer-binary">Binary file changed</div>;
  }

  if (diff.hunks.length === 0) {
    return (
      <div className="diff-viewer-binary">No changes (file may be newly staged)</div>
    );
  }

  return (
    <div className="diff-viewer">
      <div className="diff-viewer-file-header">{diff.path}</div>
      {diff.hunks.map((hunk, hi) => (
        <div key={hi} className="diff-hunk">
          <div className="diff-hunk-header">{hunk.header.trim()}</div>
          {hunk.lines.map((line, li) => {
            const lineClass =
              line.origin === "+"
                ? "addition"
                : line.origin === "-"
                  ? "deletion"
                  : "context";
            return (
              <div key={li} className={`diff-line ${lineClass}`}>
                <div className="diff-line-number old">
                  {line.old_lineno ?? ""}
                </div>
                <div className="diff-line-number">
                  {line.new_lineno ?? ""}
                </div>
                <div className="diff-line-origin">{line.origin}</div>
                <div className="diff-line-content">{line.content}</div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
