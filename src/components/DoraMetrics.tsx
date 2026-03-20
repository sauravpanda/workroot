import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DoraMetricsData {
  deployment_frequency: number; // deploys per week
  lead_time_hours: number;
  change_failure_rate: number; // 0-100 percentage
  mttr_hours: number;
  weekly_deployments: number[]; // last N weeks of deploy counts
}

interface Deployment {
  id: number;
  version: string;
  environment: string;
  status: string; // "success" | "failure" | "rollback"
  deployed_at: string;
  lead_time_hours: number;
}

type Period = 7 | 30 | 90;

type Rating = "elite" | "high" | "medium" | "low";

interface DoraMetricsProps {
  projectId: number;
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getRating(metrics: DoraMetricsData): Rating {
  // Simplified DORA rating based on thresholds
  let score = 0;

  // Deployment frequency: Elite = daily+, High = weekly, Med = monthly, Low = less
  if (metrics.deployment_frequency >= 7) score += 3;
  else if (metrics.deployment_frequency >= 1) score += 2;
  else if (metrics.deployment_frequency >= 0.25) score += 1;

  // Lead time: Elite < 1h, High < 24h, Med < 168h (1 week)
  if (metrics.lead_time_hours < 1) score += 3;
  else if (metrics.lead_time_hours < 24) score += 2;
  else if (metrics.lead_time_hours < 168) score += 1;

  // Change failure rate: Elite < 5%, High < 10%, Med < 15%
  if (metrics.change_failure_rate < 5) score += 3;
  else if (metrics.change_failure_rate < 10) score += 2;
  else if (metrics.change_failure_rate < 15) score += 1;

  // MTTR: Elite < 1h, High < 24h, Med < 168h
  if (metrics.mttr_hours < 1) score += 3;
  else if (metrics.mttr_hours < 24) score += 2;
  else if (metrics.mttr_hours < 168) score += 1;

  if (score >= 10) return "elite";
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  return "low";
}

function ratingLabel(rating: Rating): string {
  switch (rating) {
    case "elite":
      return "Elite";
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
  }
}

function metricColor(
  value: number,
  goodBelow: number,
  warnBelow: number,
): string {
  if (value < goodBelow) return "dora-metric--good";
  if (value < warnBelow) return "dora-metric--warn";
  return "dora-metric--bad";
}

function failureRateColor(rate: number): string {
  if (rate < 5) return "dora-metric--good";
  if (rate < 15) return "dora-metric--warn";
  return "dora-metric--bad";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusClass(status: string): string {
  switch (status) {
    case "success":
      return "dora-status--success";
    case "failure":
      return "dora-status--failure";
    case "rollback":
      return "dora-status--rollback";
    default:
      return "";
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DoraMetrics({ projectId, onClose }: DoraMetricsProps) {
  const [period, setPeriod] = useState<Period>(30);
  const [metrics, setMetrics] = useState<DoraMetricsData | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Deploy form
  const [showDeployForm, setShowDeployForm] = useState(false);
  const [formVersion, setFormVersion] = useState("");
  const [formEnv, setFormEnv] = useState("production");
  const [formStatus, setFormStatus] = useState("success");
  const [deploying, setDeploying] = useState(false);

  /* ---- Fetch metrics ---- */
  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [metricsData, deploymentsData] = await Promise.all([
        invoke<DoraMetricsData>("get_dora_metrics", {
          projectId,
          days: period,
        }),
        invoke<Deployment[]>("list_deployments", {
          projectId,
          days: period,
        }),
      ]);
      setMetrics(metricsData);
      setDeployments(deploymentsData);
    } catch (err) {
      setError(String(err));
    }
    setLoading(false);
  }, [projectId, period]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  /* ---- Record deployment ---- */
  const handleRecordDeployment = useCallback(async () => {
    if (!formVersion.trim()) return;
    setDeploying(true);
    try {
      await invoke("record_deployment", {
        projectId,
        version: formVersion.trim(),
        environment: formEnv,
        status: formStatus,
      });
      setFormVersion("");
      setShowDeployForm(false);
      await loadMetrics();
    } catch (err) {
      setError(String(err));
    }
    setDeploying(false);
  }, [projectId, formVersion, formEnv, formStatus, loadMetrics]);

  const rating = metrics ? getRating(metrics) : null;
  const maxWeekly = metrics ? Math.max(...metrics.weekly_deployments, 1) : 1;

  return (
    <div className="dora-backdrop" onClick={onClose}>
      <div className="dora-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="dora-header">
          <h3 className="dora-title">DORA Metrics</h3>
          <div className="dora-header__actions">
            <div className="dora-period-selector">
              {([7, 30, 90] as Period[]).map((p) => (
                <button
                  key={p}
                  className={`dora-period-btn ${period === p ? "dora-period-btn--active" : ""}`}
                  onClick={() => setPeriod(p)}
                >
                  {p}d
                </button>
              ))}
            </div>
            <button className="dora-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        {error && <div className="dora-error">{error}</div>}

        <div className="dora-body">
          {loading ? (
            <div className="dora-empty">Loading metrics...</div>
          ) : metrics ? (
            <>
              {/* Rating badge */}
              {rating && (
                <div className="dora-rating-container">
                  <span className={`dora-rating-badge dora-rating--${rating}`}>
                    {ratingLabel(rating)} Performer
                  </span>
                </div>
              )}

              {/* Metric cards */}
              <div className="dora-cards">
                {/* Deployment Frequency */}
                <div className="dora-card">
                  <span className="dora-card__label">Deployment Frequency</span>
                  <span className="dora-card__value">
                    {metrics.deployment_frequency.toFixed(1)}
                    <span className="dora-card__unit">/week</span>
                  </span>
                  <div className="dora-card__sparkline">
                    {metrics.weekly_deployments.map((count, i) => (
                      <div
                        key={i}
                        className="dora-sparkline-bar"
                        style={{
                          height: `${(count / maxWeekly) * 100}%`,
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Lead Time */}
                <div
                  className={`dora-card ${metricColor(metrics.lead_time_hours, 24, 168)}`}
                >
                  <span className="dora-card__label">
                    Lead Time for Changes
                  </span>
                  <span className="dora-card__value">
                    {metrics.lead_time_hours < 1
                      ? `${Math.round(metrics.lead_time_hours * 60)}m`
                      : `${metrics.lead_time_hours.toFixed(1)}h`}
                  </span>
                  <span className="dora-card__subtitle">commit to deploy</span>
                </div>

                {/* Change Failure Rate */}
                <div
                  className={`dora-card ${failureRateColor(metrics.change_failure_rate)}`}
                >
                  <span className="dora-card__label">Change Failure Rate</span>
                  <span className="dora-card__value">
                    {metrics.change_failure_rate.toFixed(1)}
                    <span className="dora-card__unit">%</span>
                  </span>
                  <span className="dora-card__subtitle">
                    of deploys causing failure
                  </span>
                </div>

                {/* MTTR */}
                <div
                  className={`dora-card ${metricColor(metrics.mttr_hours, 1, 24)}`}
                >
                  <span className="dora-card__label">MTTR</span>
                  <span className="dora-card__value">
                    {metrics.mttr_hours < 1
                      ? `${Math.round(metrics.mttr_hours * 60)}m`
                      : `${metrics.mttr_hours.toFixed(1)}h`}
                  </span>
                  <span className="dora-card__subtitle">
                    mean time to recover
                  </span>
                </div>
              </div>

              {/* Record deployment */}
              <div className="dora-deploy-section">
                {showDeployForm ? (
                  <div className="dora-deploy-form">
                    <input
                      className="dora-deploy-input"
                      type="text"
                      placeholder="Version (e.g. v1.2.3)"
                      value={formVersion}
                      onChange={(e) => setFormVersion(e.target.value)}
                      spellCheck={false}
                    />
                    <select
                      className="dora-deploy-select"
                      value={formEnv}
                      onChange={(e) => setFormEnv(e.target.value)}
                    >
                      <option value="production">Production</option>
                      <option value="staging">Staging</option>
                      <option value="development">Development</option>
                    </select>
                    <select
                      className="dora-deploy-select"
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value)}
                    >
                      <option value="success">Success</option>
                      <option value="failure">Failure</option>
                      <option value="rollback">Rollback</option>
                    </select>
                    <button
                      className="dora-deploy-submit"
                      onClick={handleRecordDeployment}
                      disabled={deploying || !formVersion.trim()}
                    >
                      {deploying ? "..." : "Record"}
                    </button>
                    <button
                      className="dora-deploy-cancel"
                      onClick={() => setShowDeployForm(false)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    className="dora-deploy-btn"
                    onClick={() => setShowDeployForm(true)}
                  >
                    + Record Deployment
                  </button>
                )}
              </div>

              {/* Deployment history */}
              {deployments.length > 0 && (
                <div className="dora-table-wrapper">
                  <table className="dora-table">
                    <thead>
                      <tr>
                        <th>Version</th>
                        <th>Environment</th>
                        <th>Status</th>
                        <th>Date</th>
                        <th>Lead Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deployments.map((dep) => (
                        <tr key={dep.id}>
                          <td className="dora-table__version">{dep.version}</td>
                          <td className="dora-table__env">{dep.environment}</td>
                          <td>
                            <span
                              className={`dora-status-badge ${statusClass(dep.status)}`}
                            >
                              {dep.status}
                            </span>
                          </td>
                          <td className="dora-table__date">
                            {formatDate(dep.deployed_at)}
                          </td>
                          <td className="dora-table__lead">
                            {dep.lead_time_hours < 1
                              ? `${Math.round(dep.lead_time_hours * 60)}m`
                              : `${dep.lead_time_hours.toFixed(1)}h`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="dora-empty">No metrics data available.</div>
          )}
        </div>
      </div>
    </div>
  );
}
