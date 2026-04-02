import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface LighthouseResult {
  performance_score: number;
  fcp_ms: number;
  lcp_ms: number;
  cls: number;
  tbt_ms: number;
  ttfb_ms: number;
}

interface VitalsHistoryEntry {
  url: string;
  timestamp: string;
  performance_score: number;
  fcp_ms: number;
  lcp_ms: number;
  cls: number;
  tbt_ms: number;
  ttfb_ms: number;
}

interface WebVitalsProps {
  onClose: () => void;
}

type MetricColor = "green" | "yellow" | "red";

function getScoreColor(score: number): MetricColor {
  if (score >= 90) return "green";
  if (score >= 50) return "yellow";
  return "red";
}

function getFcpColor(ms: number): MetricColor {
  if (ms < 1800) return "green";
  if (ms < 3000) return "yellow";
  return "red";
}

function getLcpColor(ms: number): MetricColor {
  if (ms < 2500) return "green";
  if (ms < 4000) return "yellow";
  return "red";
}

function getClsColor(val: number): MetricColor {
  if (val < 0.1) return "green";
  if (val < 0.25) return "yellow";
  return "red";
}

function getTbtColor(ms: number): MetricColor {
  if (ms < 200) return "green";
  if (ms < 600) return "yellow";
  return "red";
}

function getTtfbColor(ms: number): MetricColor {
  if (ms < 200) return "green";
  if (ms < 500) return "yellow";
  return "red";
}

function SparkLine({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 80;
  const h = 24;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      className="wv-sparkline"
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function WebVitals({ onClose }: WebVitalsProps) {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<LighthouseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<VitalsHistoryEntry[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const handleAudit = useCallback(async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const r = await invoke<LighthouseResult>("run_lighthouse_audit", {
        url: url.trim(),
      });
      setResult(r);
    } catch (e) {
      setError(String(e));
      setResult(null);
    }
    setLoading(false);
  }, [url]);

  const loadHistory = useCallback(async () => {
    try {
      const h = await invoke<VitalsHistoryEntry[]>("get_vitals_history");
      setHistory(h);
      setHistoryLoaded(true);
    } catch {
      setHistory([]);
      setHistoryLoaded(true);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!result || !url.trim()) return;
    try {
      await invoke("record_vitals", {
        url: url.trim(),
        performanceScore: result.performance_score,
        fcpMs: result.fcp_ms,
        lcpMs: result.lcp_ms,
        cls: result.cls,
        tbtMs: result.tbt_ms,
        ttfbMs: result.ttfb_ms,
      });
      loadHistory();
    } catch (e) {
      setError(String(e));
    }
  }, [result, url, loadHistory]);

  const handleLoadHistory = useCallback(() => {
    if (!historyLoaded) {
      loadHistory();
    }
  }, [historyLoaded, loadHistory]);

  const scoreColor = result ? getScoreColor(result.performance_score) : "green";
  const scoreDeg = result ? (result.performance_score / 100) * 360 : 0;

  const historyScores = history.map((h) => h.performance_score);

  return (
    <div className="wv-backdrop" onClick={onClose}>
      <div className="wv-panel" onClick={(e) => e.stopPropagation()}>
        <div className="wv-header">
          <h3 className="wv-title">Web Vitals</h3>
          <button className="wv-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="wv-body">
          <div className="wv-input-row">
            <input
              className="wv-url-input"
              type="text"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAudit();
              }}
            />
            <button
              className="wv-audit-btn"
              onClick={handleAudit}
              disabled={loading || !url.trim()}
            >
              {loading ? "Auditing..." : "Run Audit"}
            </button>
          </div>

          {loading && (
            <div className="wv-progress-bar">
              <div className="wv-progress-fill" />
            </div>
          )}

          {error && <div className="wv-error">{error}</div>}

          {result && (
            <>
              <div className="wv-metrics-grid">
                <div className="wv-metric-card wv-score-card">
                  <div
                    className={`wv-score-gauge wv-color-${scoreColor}`}
                    style={
                      {
                        "--score-deg": `${scoreDeg}deg`,
                      } as React.CSSProperties
                    }
                  >
                    <span className="wv-score-value">
                      {result.performance_score}
                    </span>
                  </div>
                  <span className="wv-metric-label">Performance</span>
                </div>

                <div
                  className={`wv-metric-card wv-color-${getFcpColor(result.fcp_ms)}`}
                >
                  <span className="wv-metric-value">
                    {result.fcp_ms.toFixed(0)}
                  </span>
                  <span className="wv-metric-unit">ms</span>
                  <span className="wv-metric-label">FCP</span>
                </div>

                <div
                  className={`wv-metric-card wv-color-${getLcpColor(result.lcp_ms)}`}
                >
                  <span className="wv-metric-value">
                    {result.lcp_ms.toFixed(0)}
                  </span>
                  <span className="wv-metric-unit">ms</span>
                  <span className="wv-metric-label">LCP</span>
                </div>

                <div
                  className={`wv-metric-card wv-color-${getClsColor(result.cls)}`}
                >
                  <span className="wv-metric-value">
                    {result.cls.toFixed(3)}
                  </span>
                  <span className="wv-metric-unit">&nbsp;</span>
                  <span className="wv-metric-label">CLS</span>
                </div>

                <div
                  className={`wv-metric-card wv-color-${getTbtColor(result.tbt_ms)}`}
                >
                  <span className="wv-metric-value">
                    {result.tbt_ms.toFixed(0)}
                  </span>
                  <span className="wv-metric-unit">ms</span>
                  <span className="wv-metric-label">TBT</span>
                </div>

                <div
                  className={`wv-metric-card wv-color-${getTtfbColor(result.ttfb_ms)}`}
                >
                  <span className="wv-metric-value">
                    {result.ttfb_ms.toFixed(0)}
                  </span>
                  <span className="wv-metric-unit">ms</span>
                  <span className="wv-metric-label">TTFB</span>
                </div>
              </div>

              <div className="wv-actions-row">
                <button className="wv-save-btn" onClick={handleSave}>
                  Save Results
                </button>
              </div>
            </>
          )}

          <div className="wv-history-section">
            <button className="wv-history-toggle" onClick={handleLoadHistory}>
              {historyLoaded ? "History" : "Load History"}
            </button>
            {historyLoaded && history.length > 0 && (
              <>
                <SparkLine values={historyScores} />
                <div className="wv-history-list">
                  {history.map((h, i) => (
                    <div key={i} className="wv-history-item">
                      <span className="wv-history-url">{h.url}</span>
                      <span
                        className={`wv-history-score wv-color-${getScoreColor(h.performance_score)}`}
                      >
                        {h.performance_score}
                      </span>
                      <span className="wv-history-ts">{h.timestamp}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {historyLoaded && history.length === 0 && (
              <div className="wv-empty">No history yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
