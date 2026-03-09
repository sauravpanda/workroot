import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/pr-status.css";

interface CheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string | null;
  started_at: string | null;
  completed_at: string | null;
}

interface Review {
  user: string;
  state: string;
  submitted_at: string | null;
}

interface PrStatus {
  number: number;
  title: string;
  html_url: string;
  state: string;
  draft: boolean;
  mergeable: boolean | null;
  mergeable_state: string | null;
  checks: CheckRun[];
  reviews: Review[];
  additions: number | null;
  deletions: number | null;
  changed_files: number | null;
}

interface PRStatusPanelProps {
  worktreeId: number;
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return "";
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  const diffSec = Math.floor((end - start) / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${mins}m ${secs}s`;
}

function checkIcon(check: CheckRun): { icon: string; cls: string } {
  if (check.status !== "completed") {
    return { icon: "\u25CB", cls: "pending" }; // ○
  }
  if (check.conclusion === "success") {
    return { icon: "\u2713", cls: "pass" }; // ✓
  }
  if (check.conclusion === "failure" || check.conclusion === "timed_out") {
    return { icon: "\u2717", cls: "fail" }; // ✗
  }
  return { icon: "\u25CB", cls: "pending" };
}

function mergeableBadge(state: string | null): { label: string; cls: string } {
  switch (state) {
    case "clean":
      return { label: "Mergeable", cls: "mergeable" };
    case "blocked":
      return { label: "Blocked", cls: "blocked" };
    case "unstable":
      return { label: "Unstable", cls: "unstable" };
    case "dirty":
      return { label: "Conflicts", cls: "blocked" };
    default:
      return { label: "Unknown", cls: "unknown" };
  }
}

export function PRStatusPanel({ worktreeId }: PRStatusPanelProps) {
  const [status, setStatus] = useState<PrStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const loadStatus = useCallback(async () => {
    try {
      const result = await invoke<PrStatus | null>("get_pr_status", {
        worktreeId,
      });
      setStatus(result);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [worktreeId]);

  useEffect(() => {
    loadStatus();
    // Auto-refresh every 30 seconds
    intervalRef.current = setInterval(loadStatus, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadStatus]);

  if (loading) {
    return <div className="pr-status-loading">Loading PR status...</div>;
  }

  if (error) {
    return (
      <div className="pr-status-empty">
        <p>Error: {error}</p>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="pr-status-empty">
        <p>No open PR for this branch</p>
        <p className="pr-status-empty-hint">
          Create a pull request to see status here
        </p>
      </div>
    );
  }

  const merge = mergeableBadge(status.mergeable_state);

  // Deduplicate reviews — keep latest per user
  const latestReviews = new Map<string, Review>();
  for (const review of status.reviews) {
    if (review.state === "DISMISSED") continue;
    latestReviews.set(review.user, review);
  }

  return (
    <div className="pr-status">
      <div className="pr-status-header">
        <div className="pr-status-title-row">
          <span className="pr-status-number">#{status.number}</span>
          <span className="pr-status-pr-title">{status.title}</span>
        </div>
        <button className="pr-status-refresh" onClick={loadStatus}>
          Refresh
        </button>
      </div>

      <div className="pr-status-body">
        <div className="pr-status-badges">
          <span className={`pr-status-badge ${status.draft ? "draft" : "open"}`}>
            {status.draft ? "Draft" : "Open"}
          </span>
          {status.mergeable_state && (
            <span className={`pr-status-badge ${merge.cls}`}>
              {merge.label}
            </span>
          )}
        </div>

        {(status.additions !== null || status.deletions !== null) && (
          <div className="pr-status-stats">
            {status.additions !== null && (
              <span className="pr-status-stat-add">
                +{status.additions}
              </span>
            )}
            {status.deletions !== null && (
              <span className="pr-status-stat-del">
                -{status.deletions}
              </span>
            )}
            {status.changed_files !== null && (
              <span>
                {status.changed_files} file
                {status.changed_files !== 1 ? "s" : ""} changed
              </span>
            )}
          </div>
        )}

        {status.checks.length > 0 && (
          <div className="pr-status-section">
            <div className="pr-status-section-title">CI Checks</div>
            {status.checks.map((check, i) => {
              const { icon, cls } = checkIcon(check);
              const duration = formatDuration(
                check.started_at,
                check.completed_at
              );
              return (
                <div key={i} className="pr-status-check">
                  <span className={`pr-status-check-icon ${cls}`}>
                    {icon}
                  </span>
                  <span className="pr-status-check-name">
                    {check.html_url ? (
                      <a
                        href={check.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {check.name}
                      </a>
                    ) : (
                      check.name
                    )}
                  </span>
                  {duration && (
                    <span className="pr-status-check-duration">
                      {duration}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {latestReviews.size > 0 && (
          <div className="pr-status-section">
            <div className="pr-status-section-title">Reviews</div>
            {Array.from(latestReviews.values()).map((review, i) => (
              <div key={i} className="pr-status-review">
                <span
                  className={`pr-status-review-state ${review.state.toLowerCase()}`}
                >
                  {review.state.replace("_", " ")}
                </span>
                <span className="pr-status-review-user">{review.user}</span>
              </div>
            ))}
          </div>
        )}

        <a
          className="pr-status-link"
          href={status.html_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          View on GitHub
        </a>
      </div>
    </div>
  );
}
