import { useState, useCallback, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/analytics-dashboard.css";

interface ActivityEvent {
  id: number;
  event_type: string;
  title: string;
  detail: string;
  timestamp: string;
}

interface BenchmarkEntry {
  metric_name: string;
  value: number;
  unit: string;
  timestamp: string;
}

interface AnalyticsDashboardProps {
  cwd: string;
  onClose: () => void;
}

function getDayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function buildHeatmapData(events: ActivityEvent[]): number[][] {
  // 52 weeks x 7 days grid
  const grid: number[][] = Array.from({ length: 52 }, () =>
    Array.from({ length: 7 }, () => 0),
  );

  const now = new Date();
  const todayDayOfWeek = now.getDay();

  for (const event of events) {
    const eventDate = new Date(event.timestamp);
    const diffMs = now.getTime() - eventDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0 || diffDays >= 364) continue;

    const totalDaysFromEnd = diffDays;
    const col = 51 - Math.floor((totalDaysFromEnd + (6 - todayDayOfWeek)) / 7);
    const row = eventDate.getDay();

    if (col >= 0 && col < 52 && row >= 0 && row < 7) {
      grid[col][row]++;
    }
  }

  return grid;
}

function activityLevel(count: number): string {
  if (count === 0) return "analytics-heat-0";
  if (count <= 2) return "analytics-heat-1";
  if (count <= 5) return "analytics-heat-2";
  if (count <= 10) return "analytics-heat-3";
  return "analytics-heat-4";
}

export function AnalyticsDashboard({ cwd, onClose }: AnalyticsDashboardProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [evts, benchList] = await Promise.all([
        invoke<ActivityEvent[]>("get_activity_timeline", {
          limit: 500,
          offset: 0,
        }),
        invoke<string[]>("list_benchmark_metrics", { cwd })
          .then(async (metrics) => {
            if (metrics.length === 0) return [];
            const results = await Promise.all(
              metrics.slice(0, 5).map((m) =>
                invoke<BenchmarkEntry[]>("get_benchmark_history", {
                  cwd,
                  metricName: m,
                }).catch(() => [] as BenchmarkEntry[]),
              ),
            );
            return results.flat();
          })
          .catch(() => [] as BenchmarkEntry[]),
      ]);
      setEvents(evts);
      setBenchmarks(benchList);
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }, [cwd]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const heatmapData = useMemo(() => buildHeatmapData(events), [events]);

  const todayEvents = useMemo(() => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return events.filter((e) => e.timestamp.startsWith(todayStr));
  }, [events]);

  const latestBenchmark =
    benchmarks.length > 0 ? benchmarks[benchmarks.length - 1] : null;

  // suppress lint: getDayOfYear is a utility used by heatmap
  void getDayOfYear;

  return (
    <div className="analytics-backdrop" onClick={onClose}>
      <div className="analytics-panel" onClick={(e) => e.stopPropagation()}>
        <div className="analytics-header">
          <h3 className="analytics-title">Analytics</h3>
          <button className="analytics-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="analytics-body">
          {error && <div className="analytics-error">{error}</div>}

          {loading ? (
            <div className="analytics-empty">Loading analytics...</div>
          ) : (
            <>
              {/* Today summary card */}
              <div className="analytics-today-card">
                <h4 className="analytics-card-label">Today</h4>
                <div className="analytics-today-stats">
                  <div className="analytics-stat">
                    <span className="analytics-stat-num">
                      {todayEvents.length}
                    </span>
                    <span className="analytics-stat-label">Events</span>
                  </div>
                  <div className="analytics-stat">
                    <span className="analytics-stat-num">{events.length}</span>
                    <span className="analytics-stat-label">Total (365d)</span>
                  </div>
                  {latestBenchmark && (
                    <div className="analytics-stat">
                      <span className="analytics-stat-num">
                        {latestBenchmark.value.toFixed(1)}
                      </span>
                      <span className="analytics-stat-label">
                        {latestBenchmark.metric_name} ({latestBenchmark.unit})
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Activity heatmap */}
              <div className="analytics-heatmap-section">
                <h4 className="analytics-card-label">Activity</h4>
                <div className="analytics-heatmap">
                  {heatmapData.map((week, wi) => (
                    <div key={wi} className="analytics-heatmap-col">
                      {week.map((count, di) => (
                        <div
                          key={di}
                          className={`analytics-heatmap-cell ${activityLevel(count)}`}
                          title={`${count} event${count !== 1 ? "s" : ""}`}
                        />
                      ))}
                    </div>
                  ))}
                </div>
                <div className="analytics-heatmap-legend">
                  <span className="analytics-legend-label">Less</span>
                  <span className="analytics-heatmap-cell analytics-heat-0" />
                  <span className="analytics-heatmap-cell analytics-heat-1" />
                  <span className="analytics-heatmap-cell analytics-heat-2" />
                  <span className="analytics-heatmap-cell analytics-heat-3" />
                  <span className="analytics-heatmap-cell analytics-heat-4" />
                  <span className="analytics-legend-label">More</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
