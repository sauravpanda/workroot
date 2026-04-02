import { useState, useMemo } from "react";
import "../styles/inline-diff.css";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface InlineDiffProps {
  oldText: string;
  newText: string;
  language?: string;
  onClose?: () => void;
}

type LineType = "added" | "removed" | "unchanged" | "modified";

interface DiffLine {
  type: LineType;
  oldLineNo: number | null;
  newLineNo: number | null;
  content: string;
}

/* ------------------------------------------------------------------ */
/*  Diff computation                                                   */
/* ------------------------------------------------------------------ */

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result: DiffLine[] = [];

  // Simple LCS-based diff using a two-pointer approach with matching
  const lcs = buildLCS(oldLines, newLines);

  let oi = 0;
  let ni = 0;
  let li = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    if (li < lcs.length && oi < oldLines.length && ni < newLines.length) {
      // Emit removed lines before the next LCS match
      while (oi < lcs[li].oldIdx) {
        result.push({
          type: "removed",
          oldLineNo: oi + 1,
          newLineNo: null,
          content: oldLines[oi],
        });
        oi++;
      }
      // Emit added lines before the next LCS match
      while (ni < lcs[li].newIdx) {
        result.push({
          type: "added",
          oldLineNo: null,
          newLineNo: ni + 1,
          content: newLines[ni],
        });
        ni++;
      }
      // Emit the matching line
      result.push({
        type: "unchanged",
        oldLineNo: oi + 1,
        newLineNo: ni + 1,
        content: oldLines[oi],
      });
      oi++;
      ni++;
      li++;
    } else {
      // Remaining old lines are removals
      while (oi < oldLines.length) {
        result.push({
          type: "removed",
          oldLineNo: oi + 1,
          newLineNo: null,
          content: oldLines[oi],
        });
        oi++;
      }
      // Remaining new lines are additions
      while (ni < newLines.length) {
        result.push({
          type: "added",
          oldLineNo: null,
          newLineNo: ni + 1,
          content: newLines[ni],
        });
        ni++;
      }
    }
  }

  return result;
}

interface LCSEntry {
  oldIdx: number;
  newIdx: number;
}

function buildLCS(oldLines: string[], newLines: string[]): LCSEntry[] {
  const m = oldLines.length;
  const n = newLines.length;

  // For very large files, fall back to simple line-by-line
  if (m * n > 1_000_000) {
    return buildSimpleLCS(oldLines, newLines);
  }

  // Standard DP LCS
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack
  const result: LCSEntry[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      result.push({ oldIdx: i - 1, newIdx: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  result.reverse();
  return result;
}

function buildSimpleLCS(oldLines: string[], newLines: string[]): LCSEntry[] {
  // Greedy forward matching for large files
  const result: LCSEntry[] = [];
  const newMap = new Map<string, number[]>();
  for (let j = 0; j < newLines.length; j++) {
    const line = newLines[j];
    const existing = newMap.get(line);
    if (existing) {
      existing.push(j);
    } else {
      newMap.set(line, [j]);
    }
  }

  let lastJ = -1;
  for (let i = 0; i < oldLines.length; i++) {
    const candidates = newMap.get(oldLines[i]);
    if (!candidates) continue;
    // Find first candidate after lastJ
    for (const j of candidates) {
      if (j > lastJ) {
        result.push({ oldIdx: i, newIdx: j });
        lastJ = j;
        break;
      }
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Collapsible sections                                               */
/* ------------------------------------------------------------------ */

interface Section {
  type: "lines" | "collapsed";
  lines: DiffLine[];
  hiddenCount: number;
}

const CONTEXT_LINES = 3;

function buildSections(diffLines: DiffLine[]): Section[] {
  if (diffLines.length === 0) return [];

  // Find ranges of unchanged lines that can be collapsed
  const sections: Section[] = [];
  let i = 0;

  while (i < diffLines.length) {
    if (diffLines[i].type !== "unchanged") {
      sections.push({ type: "lines", lines: [diffLines[i]], hiddenCount: 0 });
      i++;
    } else {
      // Collect consecutive unchanged lines
      const start = i;
      while (i < diffLines.length && diffLines[i].type === "unchanged") {
        i++;
      }
      const unchangedBlock = diffLines.slice(start, i);

      if (unchangedBlock.length <= CONTEXT_LINES * 2 + 1) {
        // Too short to collapse
        sections.push({
          type: "lines",
          lines: unchangedBlock,
          hiddenCount: 0,
        });
      } else {
        // Show first N, collapse middle, show last N
        const isFirst = start === 0;
        const isLast = i === diffLines.length;

        if (isFirst) {
          // Only show trailing context
          const hidden = unchangedBlock.slice(
            0,
            unchangedBlock.length - CONTEXT_LINES,
          );
          const visible = unchangedBlock.slice(
            unchangedBlock.length - CONTEXT_LINES,
          );
          sections.push({
            type: "collapsed",
            lines: hidden,
            hiddenCount: hidden.length,
          });
          sections.push({ type: "lines", lines: visible, hiddenCount: 0 });
        } else if (isLast) {
          // Only show leading context
          const visible = unchangedBlock.slice(0, CONTEXT_LINES);
          const hidden = unchangedBlock.slice(CONTEXT_LINES);
          sections.push({ type: "lines", lines: visible, hiddenCount: 0 });
          sections.push({
            type: "collapsed",
            lines: hidden,
            hiddenCount: hidden.length,
          });
        } else {
          const leading = unchangedBlock.slice(0, CONTEXT_LINES);
          const trailing = unchangedBlock.slice(
            unchangedBlock.length - CONTEXT_LINES,
          );
          const hidden = unchangedBlock.slice(
            CONTEXT_LINES,
            unchangedBlock.length - CONTEXT_LINES,
          );
          sections.push({ type: "lines", lines: leading, hiddenCount: 0 });
          sections.push({
            type: "collapsed",
            lines: hidden,
            hiddenCount: hidden.length,
          });
          sections.push({ type: "lines", lines: trailing, hiddenCount: 0 });
        }
      }
    }
  }

  return sections;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function InlineDiff({
  oldText,
  newText,
  language,
  onClose,
}: InlineDiffProps) {
  const diffLines = useMemo(
    () => computeDiff(oldText, newText),
    [oldText, newText],
  );
  const sections = useMemo(() => buildSections(diffLines), [diffLines]);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    new Set(),
  );

  const toggleSection = (index: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const line of diffLines) {
      if (line.type === "added") added++;
      if (line.type === "removed") removed++;
    }
    return { added, removed };
  }, [diffLines]);

  return (
    <div className="idiff-container">
      {/* Header */}
      <div className="idiff-header">
        <div className="idiff-header-left">
          <span className="idiff-title">Inline Diff</span>
          {language && <span className="idiff-language">{language}</span>}
          <span className="idiff-stat idiff-stat--added">+{stats.added}</span>
          <span className="idiff-stat idiff-stat--removed">
            -{stats.removed}
          </span>
        </div>
        {onClose && (
          <button className="idiff-close" onClick={onClose}>
            &times;
          </button>
        )}
      </div>

      {/* Diff body */}
      <div className="idiff-body">
        {diffLines.length === 0 ? (
          <div className="idiff-empty">No differences found.</div>
        ) : (
          <table className="idiff-table">
            <tbody>
              {sections.map((section, si) => {
                if (section.type === "collapsed" && !expandedSections.has(si)) {
                  return (
                    <tr key={si} className="idiff-collapse-row">
                      <td className="idiff-collapse-cell" colSpan={4}>
                        <button
                          className="idiff-expand-btn"
                          onClick={() => toggleSection(si)}
                        >
                          {"\u2022\u2022\u2022"} {section.hiddenCount} lines
                          hidden {"\u2022\u2022\u2022"}
                        </button>
                      </td>
                    </tr>
                  );
                }

                const lines =
                  section.type === "collapsed" ? section.lines : section.lines;

                return lines.map((line, li) => {
                  const prefix =
                    line.type === "added"
                      ? "+"
                      : line.type === "removed"
                        ? "-"
                        : " ";
                  return (
                    <tr
                      key={`${si}-${li}`}
                      className={`idiff-line idiff-line--${line.type}`}
                    >
                      <td className="idiff-ln idiff-ln--old">
                        {line.oldLineNo ?? ""}
                      </td>
                      <td className="idiff-ln idiff-ln--new">
                        {line.newLineNo ?? ""}
                      </td>
                      <td className="idiff-prefix">{prefix}</td>
                      <td className="idiff-content">{line.content}</td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
