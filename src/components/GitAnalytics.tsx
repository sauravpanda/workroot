import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/git-analytics.css";

interface DailyCommit {
  date: string;
  count: number;
}

interface Contributor {
  name: string;
  email: string;
  commit_count: number;
  first_commit: string;
  last_commit: string;
}

interface GitAnalyticsData {
  total_commits: number;
  unique_authors: number;
  avg_commits_per_week: number;
  daily_commits: DailyCommit[];
  contributors: Contributor[];
}

interface GitAnalyticsProps {
  worktreeId: number;
  onClose: () => void;
}

const PERIODS = [30, 90, 180, 365] as const;

export function GitAnalytics({ worktreeId, onClose }: GitAnalyticsProps) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(90);
  const [data, setData] = useState<GitAnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<GitAnalyticsData>("get_git_analytics", {
        worktreeId,
        days: period,
      });
      setData(result);
    } catch {
      setData(null);
    }
    setLoading(false);
  }, [worktreeId, period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const maxDailyCount =
    data && data.daily_commits.length > 0
      ? Math.max(...data.daily_commits.map((d) => d.count))
      : 1;

  const maxContribCount =
    data && data.contributors.length > 0
      ? Math.max(...data.contributors.map((c) => c.commit_count))
      : 1;

  return (
    <div className="gitana-backdrop" onClick={onClose}>
      <div className="gitana-panel" onClick={(e) => e.stopPropagation()}>
        <div className="gitana-header">
          <h3 className="gitana-title">Git Analytics</h3>
          <div className="gitana-header-actions">
            <div className="gitana-period-selector">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  className={`gitana-period-btn ${period === p ? "active" : ""}`}
                  onClick={() => setPeriod(p)}
                >
                  {p}d
                </button>
              ))}
            </div>
            <button className="gitana-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        <div className="gitana-body">
          {loading ? (
            <div className="gitana-empty">Loading analytics...</div>
          ) : !data ? (
            <div className="gitana-empty">
              Unable to load analytics for this worktree.
            </div>
          ) : (
            <>
              <div className="gitana-stats">
                <div className="gitana-stat-card">
                  <span className="gitana-stat-value">
                    {data.total_commits}
                  </span>
                  <span className="gitana-stat-label">Total Commits</span>
                </div>
                <div className="gitana-stat-card">
                  <span className="gitana-stat-value">
                    {data.unique_authors}
                  </span>
                  <span className="gitana-stat-label">Unique Authors</span>
                </div>
                <div className="gitana-stat-card">
                  <span className="gitana-stat-value">
                    {data.avg_commits_per_week.toFixed(1)}
                  </span>
                  <span className="gitana-stat-label">Avg / Week</span>
                </div>
              </div>

              <div className="gitana-section">
                <h4 className="gitana-section-title">Commit Activity</h4>
                <div className="gitana-chart">
                  {data.daily_commits.map((day) => {
                    const pct =
                      maxDailyCount > 0 ? (day.count / maxDailyCount) * 100 : 0;
                    const intensity = Math.min(
                      Math.ceil((day.count / maxDailyCount) * 4),
                      4,
                    );
                    return (
                      <div
                        key={day.date}
                        className="gitana-bar-wrap"
                        title={`${day.date}: ${day.count} commit${day.count !== 1 ? "s" : ""}`}
                      >
                        <div
                          className={`gitana-bar gitana-bar-l${intensity}`}
                          style={{ height: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="gitana-section">
                <h4 className="gitana-section-title">Top Contributors</h4>
                <div className="gitana-contributors">
                  {data.contributors.map((c, i) => (
                    <div
                      key={c.email}
                      className={`gitana-contrib-row ${i % 2 === 1 ? "gitana-contrib-alt" : ""}`}
                    >
                      <div className="gitana-contrib-info">
                        <span className="gitana-contrib-name">{c.name}</span>
                        <span className="gitana-contrib-email">{c.email}</span>
                      </div>
                      <div className="gitana-contrib-stats">
                        <span className="gitana-contrib-count">
                          {c.commit_count} commit
                          {c.commit_count !== 1 ? "s" : ""}
                        </span>
                        <span className="gitana-contrib-dates">
                          {c.first_commit} &ndash; {c.last_commit}
                        </span>
                      </div>
                      <div className="gitana-contrib-bar-bg">
                        <div
                          className="gitana-contrib-bar-fill"
                          style={{
                            width: `${(c.commit_count / maxContribCount) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
