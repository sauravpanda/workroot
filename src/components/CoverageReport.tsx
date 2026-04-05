import { useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/coverage-report.css";
import { Dialog, DialogContent } from "./ui/dialog";

interface CoverageEntry {
  file: string;
  line_coverage: number;
  branch_coverage: number | null;
  lines_covered: number;
  lines_total: number;
}

interface CoverageReportProps {
  cwd: string;
  onClose: () => void;
}

function coverageColor(pct: number): string {
  if (pct >= 80) return "var(--success)";
  if (pct >= 50) return "var(--warning)";
  return "var(--danger)";
}

export function CoverageReport({ cwd, onClose }: CoverageReportProps) {
  const [entries, setEntries] = useState<CoverageEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);

  const handleRun = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<CoverageEntry[]>("parse_coverage", { cwd });
      setEntries(result);
      setScanned(true);
    } catch {
      setEntries([]);
      setScanned(true);
    }
    setLoading(false);
  }, [cwd]);

  const sorted = useMemo(
    () => [...entries].sort((a, b) => a.line_coverage - b.line_coverage),
    [entries],
  );

  const totalCoverage = useMemo(() => {
    if (entries.length === 0) return 0;
    const totalCovered = entries.reduce((s, e) => s + e.lines_covered, 0);
    const totalLines = entries.reduce((s, e) => s + e.lines_total, 0);
    return totalLines > 0 ? (totalCovered / totalLines) * 100 : 0;
  }, [entries]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="coverage-panel">
        <div className="coverage-header">
          <h3 className="coverage-title">Coverage Report</h3>
          <div className="coverage-header-actions">
            <button
              className="coverage-run-btn"
              onClick={handleRun}
              disabled={loading}
            >
              {loading ? "Parsing..." : "Parse Coverage"}
            </button>
            <button className="coverage-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        <div className="coverage-body">
          {!scanned && !loading ? (
            <div className="coverage-empty">
              Click &quot;Parse Coverage&quot; to load coverage data.
            </div>
          ) : loading ? (
            <div className="coverage-empty">Parsing coverage data...</div>
          ) : entries.length === 0 ? (
            <div className="coverage-empty">No coverage data found.</div>
          ) : (
            <>
              <div className="coverage-total">
                <span className="coverage-total-label">Total Coverage</span>
                <span
                  className="coverage-total-pct"
                  style={{ color: coverageColor(totalCoverage) }}
                >
                  {totalCoverage.toFixed(1)}%
                </span>
              </div>

              <div className="coverage-table-wrap">
                <table className="coverage-table">
                  <thead>
                    <tr>
                      <th className="coverage-th">File</th>
                      <th className="coverage-th coverage-th-right">Lines</th>
                      <th className="coverage-th coverage-th-right">
                        Coverage
                      </th>
                      <th className="coverage-th" style={{ width: "120px" }}>
                        &nbsp;
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((entry) => (
                      <tr key={entry.file} className="coverage-row">
                        <td className="coverage-td coverage-file">
                          {entry.file}
                        </td>
                        <td className="coverage-td coverage-lines">
                          {entry.lines_covered}/{entry.lines_total}
                        </td>
                        <td
                          className="coverage-td coverage-pct"
                          style={{
                            color: coverageColor(entry.line_coverage),
                          }}
                        >
                          {entry.line_coverage.toFixed(1)}%
                        </td>
                        <td className="coverage-td">
                          <div className="coverage-bar-track">
                            <div
                              className="coverage-bar-fill"
                              style={{
                                width: `${entry.line_coverage}%`,
                                backgroundColor: coverageColor(
                                  entry.line_coverage,
                                ),
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
