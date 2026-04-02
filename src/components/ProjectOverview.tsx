import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/project-overview.css";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProjectInfo {
  id: number;
  name: string;
  local_path: string;
  framework: string | null;
}

interface WorktreeInfo {
  id: number;
  project_id: number;
  branch_name: string;
  path: string;
  status: string;
}

interface ActivityEvent {
  id: number;
  event_type: string;
  title: string;
  detail: string;
  timestamp: string;
}

interface TaskRun {
  id: number;
  task_name: string;
  cwd: string;
  exit_code: number;
  duration_ms: number;
  output_preview: string;
  created_at: string;
}

interface RepoPull {
  number: number;
  title: string;
  html_url: string;
  state: string;
  draft: boolean;
  user_login: string;
  updated_at: string;
  head_branch: string;
  labels: string[];
}

interface EnvProfile {
  id: number;
  name: string;
}

interface ProjectOverviewProps {
  projectId: number;
  onClose: () => void;
}

interface OverviewData {
  project: ProjectInfo | null;
  worktrees: WorktreeInfo[];
  activities: ActivityEvent[];
  taskRuns: TaskRun[];
  pulls: RepoPull[];
  envProfiles: EnvProfile[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ProjectOverview({ projectId, onClose }: ProjectOverviewProps) {
  const [data, setData] = useState<OverviewData>({
    project: null,
    worktrees: [],
    activities: [],
    taskRuns: [],
    pulls: [],
    envProfiles: [],
  });
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);

    const results = await Promise.allSettled([
      invoke<ProjectInfo[]>("list_projects"),
      invoke<WorktreeInfo[]>("list_project_worktrees", { projectId }),
      invoke<ActivityEvent[]>("get_activity_timeline", {
        limit: 10,
        offset: 0,
      }),
      invoke<TaskRun[]>("get_task_history", {
        cwd: "",
        taskName: "",
        limit: 5,
      }),
      invoke<RepoPull[]>("list_repo_pulls", { projectId }),
      invoke<EnvProfile[]>("list_env_profiles", { projectId }),
    ]);

    const projects =
      results[0].status === "fulfilled"
        ? (results[0].value as ProjectInfo[])
        : [];
    const worktrees =
      results[1].status === "fulfilled"
        ? (results[1].value as WorktreeInfo[])
        : [];
    const activities =
      results[2].status === "fulfilled"
        ? (results[2].value as ActivityEvent[])
        : [];
    const taskRuns =
      results[3].status === "fulfilled" ? (results[3].value as TaskRun[]) : [];
    const pulls =
      results[4].status === "fulfilled" ? (results[4].value as RepoPull[]) : [];
    const envProfiles =
      results[5].status === "fulfilled"
        ? (results[5].value as EnvProfile[])
        : [];

    const project = projects.find((p) => p.id === projectId) ?? null;

    setData({
      project,
      worktrees,
      activities,
      taskRuns,
      pulls,
      envProfiles,
    });
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openPrCount = data.pulls.filter((p) => p.state === "open").length;

  return (
    <div className="po-backdrop" onClick={onClose}>
      <div className="po-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="po-header">
          <div className="po-header-info">
            <h3 className="po-title">
              {data.project?.name ?? "Project Overview"}
            </h3>
            {data.project?.local_path && (
              <span className="po-subtitle">{data.project.local_path}</span>
            )}
          </div>
          <button className="po-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="po-body">
          {loading ? (
            <div className="po-loading">Loading project data...</div>
          ) : (
            <div className="po-grid">
              {/* Quick stats */}
              <div className="po-card po-card--stats">
                <div className="po-card-header">Quick Stats</div>
                <div className="po-stats-grid">
                  <div className="po-stat">
                    <span className="po-stat-value">
                      {data.worktrees.length}
                    </span>
                    <span className="po-stat-label">Worktrees</span>
                  </div>
                  <div className="po-stat">
                    <span className="po-stat-value">
                      {data.envProfiles.length}
                    </span>
                    <span className="po-stat-label">Env Profiles</span>
                  </div>
                  <div className="po-stat">
                    <span className="po-stat-value">{openPrCount}</span>
                    <span className="po-stat-label">Open PRs</span>
                  </div>
                  <div className="po-stat">
                    <span className="po-stat-value">
                      {data.project?.framework ?? "N/A"}
                    </span>
                    <span className="po-stat-label">Framework</span>
                  </div>
                </div>
              </div>

              {/* Worktrees */}
              <div className="po-card">
                <div className="po-card-header">
                  Worktrees
                  <span className="po-card-badge">{data.worktrees.length}</span>
                </div>
                <div className="po-card-body">
                  {data.worktrees.length === 0 ? (
                    <div className="po-card-empty">No worktrees.</div>
                  ) : (
                    <div className="po-list">
                      {data.worktrees.slice(0, 6).map((wt) => (
                        <div key={wt.id} className="po-list-item">
                          <span className="po-list-icon">{"\u2387"}</span>
                          <span className="po-list-text">{wt.branch_name}</span>
                          <span
                            className={`po-list-badge ${wt.status === "active" ? "po-list-badge--success" : ""}`}
                          >
                            {wt.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Activity */}
              <div className="po-card">
                <div className="po-card-header">
                  Recent Activity
                  <span className="po-card-badge">
                    {data.activities.length}
                  </span>
                </div>
                <div className="po-card-body">
                  {data.activities.length === 0 ? (
                    <div className="po-card-empty">No recent activity.</div>
                  ) : (
                    <div className="po-list">
                      {data.activities.slice(0, 6).map((evt) => (
                        <div key={evt.id} className="po-list-item">
                          <span className="po-list-icon">{"\u25CF"}</span>
                          <div className="po-list-col">
                            <span className="po-list-text">{evt.title}</span>
                            <span className="po-list-meta">
                              {evt.event_type} &middot;{" "}
                              {formatTimestamp(evt.timestamp)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Task runs */}
              <div className="po-card">
                <div className="po-card-header">Recent Tasks</div>
                <div className="po-card-body">
                  {data.taskRuns.length === 0 ? (
                    <div className="po-card-empty">No recent task runs.</div>
                  ) : (
                    <div className="po-list">
                      {data.taskRuns.slice(0, 5).map((run) => (
                        <div key={run.id} className="po-list-item">
                          <span
                            className={`po-list-icon ${run.exit_code === 0 ? "po-list-icon--success" : "po-list-icon--fail"}`}
                          >
                            {run.exit_code === 0 ? "\u2714" : "\u2718"}
                          </span>
                          <div className="po-list-col">
                            <span className="po-list-text">
                              {run.task_name}
                            </span>
                            <span className="po-list-meta">
                              {formatDuration(run.duration_ms)} &middot;{" "}
                              {formatTimestamp(run.created_at)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Open PRs */}
              <div className="po-card">
                <div className="po-card-header">
                  Open Pull Requests
                  <span className="po-card-badge">{openPrCount}</span>
                </div>
                <div className="po-card-body">
                  {data.pulls.filter((p) => p.state === "open").length === 0 ? (
                    <div className="po-card-empty">No open pull requests.</div>
                  ) : (
                    <div className="po-list">
                      {data.pulls
                        .filter((p) => p.state === "open")
                        .slice(0, 5)
                        .map((pr) => (
                          <div key={pr.number} className="po-list-item">
                            <span className="po-list-icon">{"\u21C4"}</span>
                            <div className="po-list-col">
                              <span className="po-list-text">
                                #{pr.number} {pr.title}
                              </span>
                              <span className="po-list-meta">
                                {pr.user_login} &middot; {pr.head_branch}
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Env Profiles */}
              <div className="po-card">
                <div className="po-card-header">
                  Env Profiles
                  <span className="po-card-badge">
                    {data.envProfiles.length}
                  </span>
                </div>
                <div className="po-card-body">
                  {data.envProfiles.length === 0 ? (
                    <div className="po-card-empty">No env profiles.</div>
                  ) : (
                    <div className="po-list">
                      {data.envProfiles.slice(0, 6).map((ep) => (
                        <div key={ep.id} className="po-list-item">
                          <span className="po-list-icon">{"\u2699"}</span>
                          <span className="po-list-text">{ep.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
