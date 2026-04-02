import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/app-performance.css";

interface AppMetrics {
  db_size_bytes: number;
  total_projects: number;
  total_worktrees: number;
  active_processes: number;
  active_watchers: number;
}

interface AppPerformanceProps {
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AppPerformance({ onClose }: AppPerformanceProps) {
  const [metrics, setMetrics] = useState<AppMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadMetrics = useCallback(async () => {
    try {
      const result = await invoke<AppMetrics>("get_app_metrics");
      setMetrics(result);
    } catch {
      setMetrics(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadMetrics();
    intervalRef.current = setInterval(loadMetrics, 30000);
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [loadMetrics]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    loadMetrics();
  }, [loadMetrics]);

  const cards: { label: string; value: string; indicator: string }[] = metrics
    ? [
        {
          label: "DB Size",
          value: formatBytes(metrics.db_size_bytes),
          indicator: "DB",
        },
        {
          label: "Total Projects",
          value: String(metrics.total_projects),
          indicator: "P",
        },
        {
          label: "Total Worktrees",
          value: String(metrics.total_worktrees),
          indicator: "W",
        },
        {
          label: "Active Processes",
          value: String(metrics.active_processes),
          indicator: ">>",
        },
        {
          label: "Active Watchers",
          value: String(metrics.active_watchers),
          indicator: "**",
        },
      ]
    : [];

  return (
    <div className="appperf-backdrop" onClick={onClose}>
      <div className="appperf-panel" onClick={(e) => e.stopPropagation()}>
        <div className="appperf-header">
          <h3 className="appperf-title">App Performance</h3>
          <div className="appperf-header-actions">
            <button
              className="appperf-refresh-btn"
              onClick={handleRefresh}
              disabled={loading}
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
            <button className="appperf-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        <div className="appperf-body">
          {metrics === null && !loading ? (
            <div className="appperf-empty">Unable to load metrics.</div>
          ) : (
            <div className="appperf-grid">
              {cards.map((card) => (
                <div key={card.label} className="appperf-card">
                  <span className="appperf-card-indicator">
                    {card.indicator}
                  </span>
                  <span className="appperf-card-value">{card.value}</span>
                  <span className="appperf-card-label">{card.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
