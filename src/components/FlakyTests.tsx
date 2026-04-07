import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/flaky-tests.css";
import { Dialog, DialogContent } from "./ui/dialog";

interface FlakyTest {
  test_name: string;
  total_runs: number;
  failures: number;
  flakiness_pct: number;
  last_status: "pass" | "fail" | "skip";
}

interface FlakyTestsProps {
  cwd: string;
  onClose: () => void;
}

export function FlakyTests({ cwd, onClose }: FlakyTestsProps) {
  const [tests, setTests] = useState<FlakyTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<FlakyTest[]>("get_flaky_tests", { cwd });
      result.sort((a, b) => b.flakiness_pct - a.flakiness_pct);
      setTests(result);
    } catch (e) {
      setError(String(e));
      setTests([]);
    }
    setLoading(false);
  }, [cwd]);

  useEffect(() => {
    loadTests();
  }, [loadTests]);

  const flakinessClass = (pct: number) => {
    if (pct >= 50) return "flaky-high";
    if (pct >= 20) return "flaky-medium";
    return "flaky-low";
  };

  const statusClass = (status: string) => {
    if (status === "pass") return "flaky-status-pass";
    if (status === "fail") return "flaky-status-fail";
    return "flaky-status-skip";
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flaky-panel" aria-label="Flaky Tests">
        <div className="flaky-header">
          <h3 className="flaky-title">Flaky Tests</h3>
          <div className="flaky-header-actions">
            <button
              className="flaky-refresh-btn"
              onClick={loadTests}
              disabled={loading}
            >
              Refresh
            </button>
            <button className="flaky-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        <div className="flaky-body">
          {error && <div className="flaky-error">{error}</div>}

          {loading ? (
            <div className="flaky-empty">Analyzing test results...</div>
          ) : tests.length === 0 ? (
            <div className="flaky-empty">No flaky tests detected.</div>
          ) : (
            <table className="flaky-table">
              <thead>
                <tr>
                  <th>Test Name</th>
                  <th>Total Runs</th>
                  <th>Failures</th>
                  <th>Flakiness</th>
                  <th>Last Status</th>
                </tr>
              </thead>
              <tbody>
                {tests.map((t) => (
                  <tr key={t.test_name} className="flaky-row">
                    <td className="flaky-cell-name">{t.test_name}</td>
                    <td className="flaky-cell-num">{t.total_runs}</td>
                    <td className="flaky-cell-num">{t.failures}</td>
                    <td className="flaky-cell-pct">
                      <span
                        className={`flaky-pct-badge ${flakinessClass(t.flakiness_pct)}`}
                      >
                        {t.flakiness_pct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="flaky-cell-status">
                      <span
                        className={`flaky-status-badge ${statusClass(t.last_status)}`}
                      >
                        {t.last_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
