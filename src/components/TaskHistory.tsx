import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/task-history.css";

interface TaskRun {
  id: number;
  task_name: string;
  cwd: string;
  exit_code: number;
  duration_ms: number;
  output_preview: string;
  created_at: string;
}

interface TaskComparison {
  run_a: TaskRun;
  run_b: TaskRun;
  duration_delta_ms: number;
  exit_code_changed: boolean;
  regression: boolean;
}

interface TaskHistoryProps {
  cwd: string;
  taskName: string;
  onClose: () => void;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDelta(ms: number): string {
  const sign = ms >= 0 ? "+" : "";
  return `${sign}${formatDuration(ms)}`;
}

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts + "Z");
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

export function TaskHistory({ cwd, taskName, onClose }: TaskHistoryProps) {
  const [runs, setRuns] = useState<TaskRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedA, setSelectedA] = useState<number | null>(null);
  const [selectedB, setSelectedB] = useState<number | null>(null);
  const [comparison, setComparison] = useState<TaskComparison | null>(null);
  const [comparing, setComparing] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<TaskRun[]>("get_task_history", {
        cwd,
        taskName,
        limit: 20,
      });
      setRuns(result);
    } catch {
      setRuns([]);
    }
    setLoading(false);
  }, [cwd, taskName]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleCompare = useCallback(async () => {
    if (selectedA === null || selectedB === null) return;
    setComparing(true);
    setComparison(null);
    try {
      const result = await invoke<TaskComparison>("compare_task_runs", {
        runIdA: selectedA,
        runIdB: selectedB,
      });
      setComparison(result);
    } catch {
      setComparison(null);
    }
    setComparing(false);
  }, [selectedA, selectedB]);

  const handleRowClick = useCallback(
    (id: number) => {
      if (selectedA === null) {
        setSelectedA(id);
        setComparison(null);
      } else if (selectedB === null && id !== selectedA) {
        setSelectedB(id);
        setComparison(null);
      } else {
        setSelectedA(id);
        setSelectedB(null);
        setComparison(null);
      }
    },
    [selectedA, selectedB],
  );

  const canCompare = selectedA !== null && selectedB !== null;

  return (
    <div className="taskhistory-backdrop" onClick={onClose}>
      <div className="taskhistory-panel" onClick={(e) => e.stopPropagation()}>
        <div className="taskhistory-header">
          <h3 className="taskhistory-title">
            History: <code className="taskhistory-task-name">{taskName}</code>
          </h3>
          <div className="taskhistory-header-actions">
            <button
              className="taskhistory-action-btn"
              onClick={handleCompare}
              disabled={!canCompare || comparing}
              title="Compare selected runs"
            >
              {comparing ? "Comparing..." : "Compare"}
            </button>
            <button className="taskhistory-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        <div className="taskhistory-body">
          {loading ? (
            <div className="taskhistory-empty">Loading history...</div>
          ) : runs.length === 0 ? (
            <div className="taskhistory-empty">
              No runs recorded for this task.
            </div>
          ) : (
            <table className="taskhistory-table">
              <thead>
                <tr>
                  <th className="taskhistory-th taskhistory-th-select"></th>
                  <th className="taskhistory-th">Exit</th>
                  <th className="taskhistory-th">Duration</th>
                  <th className="taskhistory-th">When</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const isSelected =
                    run.id === selectedA || run.id === selectedB;
                  const label =
                    run.id === selectedA
                      ? "A"
                      : run.id === selectedB
                        ? "B"
                        : "";
                  return (
                    <tr
                      key={run.id}
                      className={`taskhistory-row ${isSelected ? "taskhistory-row--selected" : ""}`}
                      onClick={() => handleRowClick(run.id)}
                    >
                      <td className="taskhistory-td taskhistory-td-select">
                        {label && (
                          <span className="taskhistory-select-badge">
                            {label}
                          </span>
                        )}
                      </td>
                      <td className="taskhistory-td">
                        <span
                          className={`taskhistory-exit-badge ${run.exit_code === 0 ? "taskhistory-exit-badge--ok" : "taskhistory-exit-badge--fail"}`}
                        >
                          {run.exit_code}
                        </span>
                      </td>
                      <td className="taskhistory-td taskhistory-td-duration">
                        {formatDuration(run.duration_ms)}
                      </td>
                      <td className="taskhistory-td taskhistory-td-when">
                        {formatTimestamp(run.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {comparison && (
            <div className="taskhistory-comparison">
              <h4 className="taskhistory-comparison-title">Comparison</h4>
              <div className="taskhistory-comparison-grid">
                <div className="taskhistory-comparison-item">
                  <span className="taskhistory-comparison-label">
                    Duration delta
                  </span>
                  <span
                    className={`taskhistory-comparison-value ${comparison.duration_delta_ms > 0 ? "taskhistory-comparison-value--worse" : "taskhistory-comparison-value--better"}`}
                  >
                    {formatDelta(comparison.duration_delta_ms)}
                  </span>
                </div>
                <div className="taskhistory-comparison-item">
                  <span className="taskhistory-comparison-label">
                    Exit code changed
                  </span>
                  <span className="taskhistory-comparison-value">
                    {comparison.exit_code_changed ? "Yes" : "No"}
                  </span>
                </div>
                {comparison.regression && (
                  <div className="taskhistory-comparison-item taskhistory-comparison-item--regression">
                    <span className="taskhistory-regression-badge">
                      Regression
                    </span>
                    <span className="taskhistory-comparison-detail">
                      Duration increased &gt;10%
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
