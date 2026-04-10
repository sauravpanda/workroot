import { useEffect, useMemo, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUiStore } from "../stores/uiStore";
import "../styles/workspace-grid.css";

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

interface WorkspaceGridProps {
  projects: ProjectInfo[];
  worktrees: Array<WorktreeInfo & { projectName: string }>;
  onSelectWorktree: (wt: WorktreeInfo) => void;
  onNewWorktree?: (projectId: number) => void;
}

type CardStatus = "active" | "attention" | "idle";

function formatPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, "~");
}

export function WorkspaceGrid({
  projects,
  worktrees,
  onSelectWorktree,
  onNewWorktree,
}: WorkspaceGridProps) {
  const { selectedWorktreeId, agentNeedsAttentionIds, agentDoneWorktreeIds } =
    useUiStore();

  // Fallback in case props are empty — load projects + worktrees ourselves.
  const [fallbackProjects, setFallbackProjects] = useState<ProjectInfo[]>([]);
  const [fallbackWorktrees, setFallbackWorktrees] = useState<
    Array<WorktreeInfo & { projectName: string }>
  >([]);

  useEffect(() => {
    if (projects.length > 0) return;
    let cancelled = false;
    async function load() {
      try {
        const ps = await invoke<ProjectInfo[]>("list_projects");
        if (cancelled) return;
        setFallbackProjects(ps);
        const results = await Promise.all(
          ps.map(async (p) => {
            try {
              const wts = await invoke<WorktreeInfo[]>(
                "list_project_worktrees",
                { projectId: p.id },
              );
              return wts.map((wt) => ({ ...wt, projectName: p.name }));
            } catch {
              return [];
            }
          }),
        );
        if (cancelled) return;
        setFallbackWorktrees(results.flat());
      } catch {
        // ignore
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [projects.length]);

  const activeProjects = projects.length > 0 ? projects : fallbackProjects;
  const activeWorktrees =
    worktrees.length > 0 || projects.length > 0 ? worktrees : fallbackWorktrees;

  const grouped = useMemo(() => {
    const byProject = new Map<
      number,
      {
        project: ProjectInfo;
        worktrees: Array<WorktreeInfo & { projectName: string }>;
      }
    >();
    for (const p of activeProjects) {
      byProject.set(p.id, { project: p, worktrees: [] });
    }
    for (const wt of activeWorktrees) {
      const entry = byProject.get(wt.project_id);
      if (entry) entry.worktrees.push(wt);
    }
    return Array.from(byProject.values());
  }, [activeProjects, activeWorktrees]);

  const statusFor = useCallback(
    (wt: WorktreeInfo): CardStatus => {
      if (agentNeedsAttentionIds.has(wt.id)) return "attention";
      if (selectedWorktreeId === wt.id || agentDoneWorktreeIds.has(wt.id)) {
        return "active";
      }
      return "idle";
    },
    [selectedWorktreeId, agentNeedsAttentionIds, agentDoneWorktreeIds],
  );

  const totalWorktrees = activeWorktrees.length;

  return (
    <div className="workspace-grid-root">
      <div className="workspace-grid-inner">
        <div className="workspace-grid-header">
          <div>
            <h1 className="workspace-grid-title">Workspaces</h1>
            <div className="workspace-grid-subtitle">
              {totalWorktrees === 0
                ? "No worktrees yet. Create one to get started."
                : `${totalWorktrees} worktree${totalWorktrees === 1 ? "" : "s"} across ${activeProjects.length} project${activeProjects.length === 1 ? "" : "s"}`}
            </div>
          </div>
        </div>

        {grouped.length === 0 && (
          <div className="workspace-grid-empty">
            No projects registered. Add a project to begin.
          </div>
        )}

        {grouped.map(({ project, worktrees: wts }) => (
          <div key={project.id} className="workspace-project-group">
            <div className="workspace-project-header">
              <span className="workspace-project-name">{project.name}</span>
              <span className="workspace-project-path">
                {formatPath(project.local_path)}
              </span>
              <span className="workspace-project-count">{wts.length}</span>
            </div>
            <div className="workspace-grid">
              {wts.map((wt) => {
                const status = statusFor(wt);
                return (
                  <button
                    key={wt.id}
                    type="button"
                    className="workspace-card"
                    onClick={() => onSelectWorktree(wt)}
                  >
                    <div className="workspace-card-top">
                      <span
                        className={
                          "workspace-card-dot" +
                          (status === "active"
                            ? " workspace-card-dot--active"
                            : status === "attention"
                              ? " workspace-card-dot--attention"
                              : "")
                        }
                        aria-hidden
                      />
                      <span className="workspace-card-branch">
                        {wt.branch_name}
                      </span>
                    </div>
                    <div className="workspace-card-meta">
                      <span className="workspace-card-project">
                        {project.name}
                      </span>
                      <span
                        className={
                          "workspace-card-status" +
                          (status === "active"
                            ? " workspace-card-status--active"
                            : status === "attention"
                              ? " workspace-card-status--attention"
                              : "")
                        }
                      >
                        {status === "active"
                          ? "Active"
                          : status === "attention"
                            ? "Attention"
                            : "Idle"}
                      </span>
                    </div>
                  </button>
                );
              })}
              <button
                type="button"
                className="workspace-card workspace-card--new"
                onClick={() => onNewWorktree?.(project.id)}
                aria-label={`New worktree in ${project.name}`}
              >
                <span className="workspace-card-plus">+</span>
                <span className="workspace-card-new-label">New worktree</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
