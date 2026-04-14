import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useReducer,
  useRef,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUiStore } from "../stores/uiStore";
import "../styles/workspace-grid.css";
import "../styles/terminal-grid.css";

const TerminalPreviewLazy = lazy(() =>
  import("./TerminalGrid").then((m) => ({ default: m.TerminalPreview })),
);
const TerminalSnapshotLazy = lazy(() =>
  import("./TerminalGrid").then((m) => ({ default: m.TerminalSnapshot })),
);

type TerminalSnapshotMap = Map<string, string>;

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
  is_dirty?: boolean;
  port?: number | null;
  ahead?: number;
  behind?: number;
}

interface WorkspaceGridProps {
  projects: ProjectInfo[];
  worktrees: Array<WorktreeInfo & { projectName: string }>;
  onSelectWorktree: (wt: WorktreeInfo) => void;
  onNewWorktree?: (projectId: number) => void;
  onOpenAgent?: (wt: WorktreeInfo) => void;
  onOpenDiff?: (wt: WorktreeInfo) => void;
  shell?: string;
  themeId?: string;
  snapshotMap?: React.MutableRefObject<TerminalSnapshotMap>;
}

type CardStatus = "current" | "attention" | "done" | "idle";
type FilterTab = "all" | "attention" | "active" | "done";

const STATUS_RANK: Record<CardStatus, number> = {
  attention: 0,
  current: 1,
  done: 2,
  idle: 3,
};

function formatPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, "~");
}

/** Convert a free-text task description into a valid git branch name. */
function slugifyTask(task: string): string {
  const slug = task
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40)
    .replace(/-$/, "");
  return slug ? `task-${slug}` : `task-${Date.now()}`;
}

type ViewMode = "cards" | "terminals";

export function WorkspaceGrid({
  projects,
  worktrees,
  onSelectWorktree,
  onNewWorktree,
  onOpenAgent,
  onOpenDiff,
  shell,
  themeId,
  snapshotMap,
}: WorkspaceGridProps) {
  const { selectedWorktreeId, agentNeedsAttentionIds, agentDoneWorktreeIds } =
    useUiStore();

  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");

  // Auto-refresh snapshot tiles every 5s when in terminal view
  const [, bumpSnapshot] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (viewMode !== "terminals" || !snapshotMap) return;
    const id = setInterval(bumpSnapshot, 5000);
    return () => clearInterval(id);
  }, [viewMode, snapshotMap]);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    wt: WorktreeInfo & { projectName: string };
  } | null>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, wt: WorktreeInfo & { projectName: string }) => {
      e.preventDefault();
      e.stopPropagation();
      setCtxMenu({ x: e.clientX, y: e.clientY, wt });
    },
    [],
  );

  // Close context menu on click anywhere
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [ctxMenu]);

  // Command bar state
  const [cmdTask, setCmdTask] = useState("");
  const [cmdProjectId, setCmdProjectId] = useState<number | null>(null);
  const [spawning, setSpawning] = useState(false);
  const [spawnError, setSpawnError] = useState<string | null>(null);
  const cmdInputRef = useRef<HTMLInputElement>(null);

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

  // Resolve command bar project: explicit selection, or first available project
  const cmdProject =
    activeProjects.find((p) => p.id === cmdProjectId) ?? activeProjects[0];

  const statusFor = useCallback(
    (wt: WorktreeInfo): CardStatus => {
      if (agentNeedsAttentionIds.has(wt.id)) return "attention";
      if (selectedWorktreeId === wt.id) return "current";
      if (agentDoneWorktreeIds.has(wt.id)) return "done";
      return "idle";
    },
    [selectedWorktreeId, agentNeedsAttentionIds, agentDoneWorktreeIds],
  );

  // All worktrees sorted by activity (attention > current > done > idle),
  // used for Cmd+1-9 quick-switch.
  const sortedWorktrees = useMemo(
    () =>
      [...activeWorktrees].sort(
        (a, b) => STATUS_RANK[statusFor(a)] - STATUS_RANK[statusFor(b)],
      ),
    [activeWorktrees, statusFor],
  );

  // Filtered worktrees for the active tab
  const filteredWorktrees = useMemo(() => {
    if (filterTab === "all") return sortedWorktrees;
    if (filterTab === "attention")
      return sortedWorktrees.filter((wt) => statusFor(wt) === "attention");
    if (filterTab === "active")
      return sortedWorktrees.filter((wt) => statusFor(wt) === "current");
    if (filterTab === "done")
      return sortedWorktrees.filter((wt) => statusFor(wt) === "done");
    return sortedWorktrees;
  }, [sortedWorktrees, filterTab, statusFor]);

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
    for (const wt of filteredWorktrees) {
      const entry = byProject.get(wt.project_id);
      if (entry) entry.worktrees.push(wt);
    }
    // Only include projects that have visible worktrees in this filter
    return Array.from(byProject.values()).filter((g) =>
      filterTab === "all" ? true : g.worktrees.length > 0,
    );
  }, [activeProjects, filteredWorktrees, filterTab]);

  // Cmd+1-9: jump to the nth worktree in activity order
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!e.metaKey) return;
      const n = parseInt(e.key, 10);
      if (isNaN(n) || n < 1 || n > 9) return;
      const target = sortedWorktrees[n - 1];
      if (!target) return;
      e.preventDefault();
      onSelectWorktree(target);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [sortedWorktrees, onSelectWorktree]);

  // Create a new worktree from the command bar task description
  const handleSpawn = useCallback(async () => {
    const task = cmdTask.trim();
    if (!task || !cmdProject || spawning) return;
    setSpawning(true);
    setSpawnError(null);
    try {
      const branchName = slugifyTask(task);
      const wt = await invoke<WorktreeInfo>("create_worktree", {
        projectId: cmdProject.id,
        branchName,
        createNewBranch: true,
      });
      setCmdTask("");
      onSelectWorktree(wt);
    } catch (err) {
      setSpawnError(String(err));
    } finally {
      setSpawning(false);
    }
  }, [cmdTask, cmdProject, spawning, onSelectWorktree]);

  const totalWorktrees = activeWorktrees.length;
  const attentionCount = activeWorktrees.filter(
    (wt) => statusFor(wt) === "attention",
  ).length;
  const doneCount = activeWorktrees.filter(
    (wt) => statusFor(wt) === "done",
  ).length;

  return (
    <div className="workspace-grid-root">
      <div className="workspace-grid-inner">
        <div className="workspace-grid-header">
          <div>
            <h1 className="workspace-grid-title">Mission Control</h1>
            <div className="workspace-grid-subtitle">
              {totalWorktrees === 0
                ? "No worktrees yet. Create one to get started."
                : `${totalWorktrees} worktree${totalWorktrees === 1 ? "" : "s"} across ${activeProjects.length} project${activeProjects.length === 1 ? "" : "s"}`}
            </div>
          </div>
          {totalWorktrees > 0 && (
            <div className="workspace-filter-tabs">
              <button
                type="button"
                className={
                  "workspace-filter-tab" +
                  (filterTab === "all" ? " workspace-filter-tab--active" : "")
                }
                onClick={() => setFilterTab("all")}
              >
                All
                <span className="workspace-filter-count">{totalWorktrees}</span>
              </button>
              {attentionCount > 0 && (
                <button
                  type="button"
                  className={
                    "workspace-filter-tab workspace-filter-tab--attention" +
                    (filterTab === "attention"
                      ? " workspace-filter-tab--active"
                      : "")
                  }
                  onClick={() => setFilterTab("attention")}
                >
                  Attention
                  <span className="workspace-filter-count workspace-filter-count--attention">
                    {attentionCount}
                  </span>
                </button>
              )}
              <button
                type="button"
                className={
                  "workspace-filter-tab" +
                  (filterTab === "active"
                    ? " workspace-filter-tab--active"
                    : "")
                }
                onClick={() => setFilterTab("active")}
              >
                Active
              </button>
              {doneCount > 0 && (
                <button
                  type="button"
                  className={
                    "workspace-filter-tab" +
                    (filterTab === "done"
                      ? " workspace-filter-tab--active"
                      : "")
                  }
                  onClick={() => setFilterTab("done")}
                >
                  Done
                  <span className="workspace-filter-count workspace-filter-count--done">
                    {doneCount}
                  </span>
                </button>
              )}
            </div>
          )}
          {totalWorktrees > 0 && shell && (
            <div className="workspace-view-toggle">
              <button
                type="button"
                className={
                  "workspace-view-btn" +
                  (viewMode === "cards" ? " workspace-view-btn--active" : "")
                }
                onClick={() => setViewMode("cards")}
                title="Card view"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="1" y="1" width="5" height="5" rx="1" />
                  <rect x="8" y="1" width="5" height="5" rx="1" />
                  <rect x="1" y="8" width="5" height="5" rx="1" />
                  <rect x="8" y="8" width="5" height="5" rx="1" />
                </svg>
              </button>
              <button
                type="button"
                className={
                  "workspace-view-btn" +
                  (viewMode === "terminals"
                    ? " workspace-view-btn--active"
                    : "")
                }
                onClick={() => setViewMode("terminals")}
                title="Terminal view"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="2 4 5 7 2 10" />
                  <line x1="7" y1="10" x2="12" y2="10" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {grouped.length === 0 && filterTab === "all" && (
          <div className="workspace-grid-empty">
            No projects registered. Add a project to begin.
          </div>
        )}

        {grouped.length === 0 && filterTab !== "all" && (
          <div className="workspace-grid-empty">
            No worktrees match this filter.
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
            <div
              className={
                "workspace-grid" +
                (viewMode === "terminals" ? " workspace-grid--terminal" : "")
              }
            >
              {wts.map((wt) => {
                const status = statusFor(wt);
                const idx = sortedWorktrees.indexOf(wt);
                const shortcutHint = idx >= 0 && idx < 9 ? `⌘${idx + 1}` : null;
                return (
                  <button
                    key={wt.id}
                    type="button"
                    className={
                      "workspace-card" +
                      (status === "current" ? " workspace-card--current" : "")
                    }
                    onClick={() => onSelectWorktree(wt)}
                    onContextMenu={(e) => handleContextMenu(e, wt)}
                    title={shortcutHint ? `Open (${shortcutHint})` : undefined}
                  >
                    <div className="workspace-card-top">
                      <span
                        className={
                          "workspace-card-dot" +
                          (status === "current"
                            ? " workspace-card-dot--active"
                            : status === "attention"
                              ? " workspace-card-dot--attention"
                              : status === "done"
                                ? " workspace-card-dot--done"
                                : "")
                        }
                        aria-hidden
                      />
                      <span className="workspace-card-branch">
                        {wt.branch_name}
                      </span>
                      {shortcutHint && (
                        <span className="workspace-card-shortcut">
                          {shortcutHint}
                        </span>
                      )}
                    </div>
                    <div className="workspace-card-meta">
                      <span className="workspace-card-project">
                        {project.name}
                      </span>
                      <span
                        className={
                          "workspace-card-status" +
                          (status === "current"
                            ? " workspace-card-status--active"
                            : status === "attention"
                              ? " workspace-card-status--attention"
                              : status === "done"
                                ? " workspace-card-status--done"
                                : "")
                        }
                      >
                        {status === "current"
                          ? "Open"
                          : status === "attention"
                            ? "Attention"
                            : status === "done"
                              ? "Done"
                              : "Idle"}
                      </span>
                      {wt.is_dirty && (
                        <span className="workspace-card-dirty">M</span>
                      )}
                      {wt.port ? (
                        <span className="workspace-card-port">:{wt.port}</span>
                      ) : null}
                      {(wt.ahead ?? 0) > 0 || (wt.behind ?? 0) > 0 ? (
                        <span className="workspace-card-sync">
                          {(wt.ahead ?? 0) > 0 && (
                            <span className="workspace-card-ahead">
                              {wt.ahead}↑
                            </span>
                          )}
                          {(wt.behind ?? 0) > 0 && (
                            <span className="workspace-card-behind">
                              {wt.behind}↓
                            </span>
                          )}
                        </span>
                      ) : null}
                    </div>
                    {viewMode === "terminals" && shell && (
                      <div className="workspace-card-terminal">
                        <Suspense fallback={null}>
                          {snapshotMap?.current?.has(wt.path) ? (
                            <TerminalSnapshotLazy
                              text={snapshotMap.current.get(wt.path) ?? ""}
                              themeId={themeId}
                            />
                          ) : (
                            <TerminalPreviewLazy
                              cwd={wt.path}
                              shell={shell}
                              themeId={themeId}
                            />
                          )}
                        </Suspense>
                      </div>
                    )}
                  </button>
                );
              })}
              {filterTab === "all" && (
                <button
                  type="button"
                  className="workspace-card workspace-card--new"
                  onClick={() => {
                    setCmdProjectId(project.id);
                    cmdInputRef.current?.focus();
                    onNewWorktree?.(project.id);
                  }}
                  aria-label={`New worktree in ${project.name}`}
                >
                  <span className="workspace-card-plus">+</span>
                  <span className="workspace-card-new-label">New worktree</span>
                </button>
              )}
            </div>
          </div>
        ))}

        {/* ── Phase 4: Command Bar ───────────────────────────────────── */}
        {activeProjects.length > 0 && (
          <div className="workspace-cmd-bar">
            <span className="workspace-cmd-icon" aria-hidden>
              &#9889;
            </span>
            <input
              ref={cmdInputRef}
              className="workspace-cmd-input"
              type="text"
              placeholder="Describe a task to start a new worktree&#8230;"
              value={cmdTask}
              onChange={(e) => {
                setCmdTask(e.target.value);
                setSpawnError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSpawn()}
              disabled={spawning}
              aria-label="Task description"
            />
            {activeProjects.length > 1 && (
              <select
                className="workspace-cmd-project"
                value={cmdProject?.id ?? ""}
                onChange={(e) => setCmdProjectId(Number(e.target.value))}
                disabled={spawning}
                aria-label="Project"
              >
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="workspace-cmd-run"
              onClick={handleSpawn}
              disabled={!cmdTask.trim() || spawning || !cmdProject}
            >
              {spawning ? "Creating\u2026" : "Run"}
            </button>
            {spawnError && (
              <div className="workspace-cmd-error">{spawnError}</div>
            )}
          </div>
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          className="workspace-ctx-menu"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
        >
          <button
            type="button"
            className="workspace-ctx-item"
            onClick={() => {
              onSelectWorktree(ctxMenu.wt);
              setCtxMenu(null);
            }}
          >
            Open Terminal
          </button>
          {onOpenAgent && (
            <button
              type="button"
              className="workspace-ctx-item"
              onClick={() => {
                onSelectWorktree(ctxMenu.wt);
                onOpenAgent(ctxMenu.wt);
                setCtxMenu(null);
              }}
            >
              Run Agent
            </button>
          )}
          {onOpenDiff && (
            <button
              type="button"
              className="workspace-ctx-item"
              onClick={() => {
                onSelectWorktree(ctxMenu.wt);
                onOpenDiff(ctxMenu.wt);
                setCtxMenu(null);
              }}
            >
              View Changes
            </button>
          )}
        </div>
      )}
    </div>
  );
}
