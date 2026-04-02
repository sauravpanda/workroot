import { useState, useEffect, useCallback } from "react";
import type { ProjectInfo } from "../hooks/useProjects";
import { useWorktrees } from "../hooks/useWorktrees";
import { useUiStore } from "../stores/uiStore";
import { WorktreeItem } from "./WorktreeItem";

interface ProjectGroupProps {
  project: ProjectInfo;
  defaultExpanded?: boolean;
}

export function ProjectGroup({
  project,
  defaultExpanded = false,
}: ProjectGroupProps) {
  const { selectedProjectId, setSelectedProjectId } = useUiStore();
  const isSelected = selectedProjectId === project.id;
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showNewWorktree, setShowNewWorktree] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [createNew, setCreateNew] = useState(true);
  const { worktrees, error, createWorktree, deleteWorktree, loadWorktrees } =
    useWorktrees(expanded ? project.id : null);

  useEffect(() => {
    if (expanded) {
      loadWorktrees();
    }
  }, [expanded, loadWorktrees]);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
    setSelectedProjectId(project.id);
  }, [project.id, setSelectedProjectId]);

  const handleCreateWorktree = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newBranchName.trim()) return;
      await createWorktree(newBranchName.trim(), createNew);
      setNewBranchName("");
      setShowNewWorktree(false);
    },
    [newBranchName, createNew, createWorktree],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      await deleteWorktree(id);
    },
    [deleteWorktree],
  );

  return (
    <div className="project-group">
      <div
        className={`project-header ${isSelected ? "project-selected" : ""}`}
        onClick={toggleExpanded}
        role="treeitem"
        aria-expanded={expanded}
        tabIndex={0}
      >
        <span className={`project-chevron ${expanded ? "expanded" : ""}`}>
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <path
              d="M2.5 1.5l4 3-4 3"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="project-info">
          <span className="project-name-row">
            <span className="project-name">{project.name}</span>
          </span>
          <span className="project-path">
            {project.local_path.replace(/^\/Users\/[^/]+/, "~")}
          </span>
        </span>
        <span className="project-badges">
          {project.framework && (
            <span className="project-framework">{project.framework}</span>
          )}
          {expanded && worktrees.length > 0 && (
            <span className="project-wt-count">{worktrees.length}</span>
          )}
          {!project.exists_locally && (
            <span className="project-missing">missing</span>
          )}
        </span>
      </div>

      {expanded && (
        <div className="project-children">
          {error && <div className="project-error">{error}</div>}

          {worktrees.length === 0 && !showNewWorktree && (
            <div className="project-empty">No worktrees</div>
          )}

          <div className="worktree-list" role="group">
            {worktrees.map((wt) => (
              <WorktreeItem key={wt.id} worktree={wt} onDelete={handleDelete} />
            ))}
          </div>

          {showNewWorktree ? (
            <form className="new-worktree-form" onSubmit={handleCreateWorktree}>
              <input
                type="text"
                placeholder="branch name"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                className="new-worktree-input"
                autoFocus
              />
              <label className="new-worktree-checkbox">
                <input
                  type="checkbox"
                  checked={createNew}
                  onChange={(e) => setCreateNew(e.target.checked)}
                />
                New branch
              </label>
              <div className="new-worktree-actions">
                <button type="submit" className="new-worktree-btn">
                  Create
                </button>
                <button
                  type="button"
                  className="new-worktree-cancel"
                  onClick={() => setShowNewWorktree(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              className="add-worktree-btn"
              onClick={() => setShowNewWorktree(true)}
            >
              + Worktree
            </button>
          )}
        </div>
      )}
    </div>
  );
}
