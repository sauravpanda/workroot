import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/benchmark-dashboard.css";

interface BenchmarkEntry {
  metric_name: string;
  value: number;
  unit: string;
  timestamp: string;
}

interface BenchmarkDashboardProps {
  cwd: string;
  onClose: () => void;
}

export function BenchmarkDashboard({ cwd, onClose }: BenchmarkDashboardProps) {
  const [metrics, setMetrics] = useState<string[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [history, setHistory] = useState<BenchmarkEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Record form
  const [newMetric, setNewMetric] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newUnit, setNewUnit] = useState("ms");
  const [recording, setRecording] = useState(false);

  const loadMetrics = useCallback(async () => {
    try {
      const result = await invoke<string[]>("list_benchmark_metrics", { cwd });
      setMetrics(result);
    } catch {
      setMetrics([]);
    }
  }, [cwd]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  const loadHistory = useCallback(
    async (metricName: string) => {
      setLoading(true);
      try {
        const result = await invoke<BenchmarkEntry[]>("get_benchmark_history", {
          cwd,
          metric_name: metricName,
        });
        setHistory(result);
      } catch {
        setHistory([]);
      }
      setLoading(false);
    },
    [cwd],
  );

  const handleSelectMetric = useCallback(
    (name: string) => {
      setSelectedMetric(name);
      loadHistory(name);
    },
    [loadHistory],
  );

  const handleRecord = useCallback(async () => {
    const val = parseFloat(newValue);
    if (!newMetric.trim() || isNaN(val)) return;
    setRecording(true);
    try {
      await invoke("record_benchmark", {
        cwd,
        metric_name: newMetric.trim(),
        value: val,
        unit: newUnit,
      });
      setNewMetric("");
      setNewValue("");
      await loadMetrics();
      if (selectedMetric === newMetric.trim()) {
        await loadHistory(newMetric.trim());
      }
    } catch {
      // record failed
    }
    setRecording(false);
  }, [
    cwd,
    newMetric,
    newValue,
    newUnit,
    loadMetrics,
    selectedMetric,
    loadHistory,
  ]);

  const latest = history.length > 0 ? history[history.length - 1] : null;
  const prev = history.length > 1 ? history[history.length - 2] : null;
  const maxVal = Math.max(...history.map((h) => h.value), 1);

  let trend = "";
  if (latest && prev) {
    const diff = latest.value - prev.value;
    if (diff > 0) trend = `+${diff.toFixed(2)}`;
    else if (diff < 0) trend = diff.toFixed(2);
  }

  return (
    <div className="bench-backdrop" onClick={onClose}>
      <div className="bench-panel" onClick={(e) => e.stopPropagation()}>
        <div className="bench-header">
          <h3 className="bench-title">Benchmark Dashboard</h3>
          <button className="bench-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="bench-record">
          <input
            className="bench-input"
            type="text"
            placeholder="Metric name"
            value={newMetric}
            onChange={(e) => setNewMetric(e.target.value)}
            spellCheck={false}
          />
          <input
            className="bench-input bench-input-sm"
            type="number"
            placeholder="Value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
          />
          <select
            className="bench-unit-select"
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
          >
            <option value="ms">ms</option>
            <option value="s">s</option>
            <option value="MB">MB</option>
            <option value="KB">KB</option>
            <option value="ops/s">ops/s</option>
            <option value="%">%</option>
          </select>
          <button
            className="bench-record-btn"
            onClick={handleRecord}
            disabled={recording || !newMetric.trim() || !newValue.trim()}
          >
            {recording ? "..." : "Record"}
          </button>
        </div>

        <div className="bench-body">
          <div className="bench-metric-list">
            {metrics.length === 0 ? (
              <div className="bench-empty-sm">No metrics recorded.</div>
            ) : (
              metrics.map((m) => (
                <button
                  key={m}
                  className={`bench-metric-item ${selectedMetric === m ? "active" : ""}`}
                  onClick={() => handleSelectMetric(m)}
                >
                  {m}
                </button>
              ))
            )}
          </div>

          <div className="bench-detail">
            {selectedMetric && !loading ? (
              <>
                {latest && (
                  <div className="bench-card">
                    <span className="bench-card-label">{selectedMetric}</span>
                    <span className="bench-card-value">
                      {latest.value.toFixed(2)}{" "}
                      <span className="bench-card-unit">{latest.unit}</span>
                    </span>
                    {trend && (
                      <span
                        className={`bench-card-trend ${trend.startsWith("+") ? "bench-trend-up" : "bench-trend-down"}`}
                      >
                        {trend} {latest.unit}
                      </span>
                    )}
                  </div>
                )}

                <div className="bench-chart">
                  {history.map((h, i) => (
                    <div key={i} className="bench-bar-wrap">
                      <div
                        className="bench-bar"
                        style={{
                          height: `${(h.value / maxVal) * 100}%`,
                        }}
                        title={`${h.value.toFixed(2)} ${h.unit} - ${h.timestamp}`}
                      />
                      <span className="bench-bar-label">
                        {h.value.toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : loading ? (
              <div className="bench-empty">Loading history...</div>
            ) : (
              <div className="bench-empty">
                Select a metric or record a new one.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
