import { useState, useEffect, useCallback } from "react";
import { ChevronRight } from "lucide-react";
import type { ProjectInfo } from "../hooks/useProjects";
import { useWorktrees } from "../hooks/useWorktrees";
import { useUiStore } from "../stores/uiStore";
import { WorktreeItem } from "./WorktreeItem";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

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
  const {
    worktrees,
    error,
    createWorktree,
    deleteWorktree,
    checkDeleteWarnings,
    loadWorktrees,
  } = useWorktrees(expanded ? project.id : null);

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
    <Collapsible open={expanded} onOpenChange={toggleExpanded}>
      <div className="project-group">
        <CollapsibleTrigger asChild>
          <div
            className={`project-header ${isSelected ? "project-selected" : ""}`}
            role="treeitem"
            aria-expanded={expanded}
            tabIndex={0}
          >
            <ChevronRight
              className={`size-3 shrink-0 text-text-muted transition-transform duration-200 ease-in-out ${expanded ? "rotate-90 text-text-secondary" : ""}`}
            />
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
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="project-children">
            {error && <div className="project-error">{error}</div>}

            {worktrees.length === 0 && !showNewWorktree && (
              <div className="project-empty">No worktrees</div>
            )}

            <div className="worktree-list" role="group">
              {worktrees.map((wt) => (
                <WorktreeItem
                  key={wt.id}
                  worktree={wt}
                  onDelete={handleDelete}
                  onCheckWarnings={checkDeleteWarnings}
                />
              ))}
            </div>

            {showNewWorktree ? (
              <form
                className="new-worktree-form"
                onSubmit={handleCreateWorktree}
              >
                <Input
                  type="text"
                  placeholder="branch name"
                  value={newBranchName}
                  onChange={(e) =>
                    setNewBranchName(e.target.value.replace(/ /g, "-"))
                  }
                  className="h-7 font-mono text-xs bg-bg-elevated border-border-default focus-visible:border-accent focus-visible:ring-accent-muted"
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
                  <Button type="submit" size="xs">
                    Create
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => setShowNewWorktree(false)}
                  >
                    Cancel
                  </Button>
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
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
