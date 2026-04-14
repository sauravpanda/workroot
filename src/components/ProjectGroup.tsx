import { useState, useEffect, useCallback } from "react";
import { ChevronRight } from "lucide-react";
import type { ProjectInfo } from "../hooks/useProjects";
import type { WorktreeInfo } from "../hooks/useWorktrees";
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
  filter?: string;
}

export function ProjectGroup({
  project,
  defaultExpanded = false,
  filter = "",
}: ProjectGroupProps) {
  const {
    selectedProjectId,
    setSelectedProjectId,
    selectedWorktreeId,
    setSelectedWorktreeId,
    setSelectedWorktreePath,
    setSelectedWorktreeName,
    setShowSettings,
  } = useUiStore();
  const isSelected = selectedProjectId === project.id;
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showNewWorktree, setShowNewWorktree] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [createNew, setCreateNew] = useState(true);
  const [showHidden, setShowHidden] = useState(false);
  const [hiddenWorktrees, setHiddenWorktrees] = useState<WorktreeInfo[]>([]);
  const {
    worktrees,
    error,
    createWorktree,
    deleteWorktree,
    hideWorktree,
    unhideWorktree,
    loadHiddenWorktrees,
    checkDeleteWarnings,
    loadWorktrees,
  } = useWorktrees(expanded ? project.id : null);

  useEffect(() => {
    if (expanded) {
      loadWorktrees();
    }
  }, [expanded, loadWorktrees]);

  // Auto-expand when a filter is active so worktrees load and can be searched.
  useEffect(() => {
    if (filter && !expanded) {
      setExpanded(true);
    }
  }, [filter, expanded]);

  // Auto-expand when this project is selected (e.g. from Mission Control).
  useEffect(() => {
    if (isSelected && !expanded) {
      setExpanded(true);
    }
  }, [isSelected, expanded]);

  const q = filter.trim().toLowerCase();
  const filteredWorktrees = q
    ? worktrees.filter((wt) => wt.branch_name.toLowerCase().includes(q))
    : worktrees;

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
    setSelectedProjectId(project.id);
  }, [project.id, setSelectedProjectId]);

  const handleCreateWorktree = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newBranchName.trim()) return;
      const newWorktree = await createWorktree(newBranchName.trim(), createNew);
      setNewBranchName("");
      setShowNewWorktree(false);
      if (newWorktree) {
        setSelectedWorktreeId(newWorktree.id);
        setSelectedWorktreePath(newWorktree.path);
        setSelectedWorktreeName(newWorktree.branch_name);
        setShowSettings(false);
      }
    },
    [
      newBranchName,
      createNew,
      createWorktree,
      setSelectedWorktreeId,
      setSelectedWorktreePath,
      setSelectedWorktreeName,
      setShowSettings,
    ],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      await deleteWorktree(id);
      // If the deleted worktree was selected, navigate away to home
      if (selectedWorktreeId === id) {
        setSelectedWorktreeId(null);
        setSelectedWorktreePath(null);
        setSelectedWorktreeName(null);
      }
    },
    [
      deleteWorktree,
      selectedWorktreeId,
      setSelectedWorktreeId,
      setSelectedWorktreePath,
      setSelectedWorktreeName,
    ],
  );

  const handleHide = useCallback(
    async (id: number) => {
      await hideWorktree(id);
    },
    [hideWorktree],
  );

  const handleToggleHidden = useCallback(async () => {
    if (!showHidden) {
      const hidden = await loadHiddenWorktrees();
      setHiddenWorktrees(hidden);
    }
    setShowHidden((prev) => !prev);
  }, [showHidden, loadHiddenWorktrees]);

  const handleUnhide = useCallback(
    async (id: number) => {
      await unhideWorktree(id);
      const hidden = await loadHiddenWorktrees();
      setHiddenWorktrees(hidden);
    },
    [unhideWorktree, loadHiddenWorktrees],
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
              {expanded && worktrees.length > 0 && (
                <span className="project-wt-count">
                  {q && filteredWorktrees.length !== worktrees.length
                    ? `${filteredWorktrees.length}/${worktrees.length}`
                    : worktrees.length}
                </span>
              )}
              {!project.exists_locally && (
                <span className="project-missing">missing</span>
              )}
            </span>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="project-children">
            {error && (
              <div className="project-error">
                {error.includes("no commits yet")
                  ? "This repo has no commits yet — make an initial commit to enable worktrees."
                  : error}
              </div>
            )}

            {filteredWorktrees.length === 0 && !showNewWorktree && (
              <div className="project-empty">
                {q ? "No matches" : "No worktrees"}
              </div>
            )}

            <div className="worktree-list" role="group">
              {filteredWorktrees.map((wt) => (
                <WorktreeItem
                  key={wt.id}
                  worktree={wt}
                  highlight={filter}
                  onDelete={handleDelete}
                  onHide={handleHide}
                  onCheckWarnings={checkDeleteWarnings}
                />
              ))}
            </div>

            <button className="show-hidden-btn" onClick={handleToggleHidden}>
              {showHidden ? "Hide hidden worktrees" : "Show hidden worktrees"}
            </button>

            {showHidden && hiddenWorktrees.length === 0 && (
              <div className="project-empty">No hidden worktrees</div>
            )}

            {showHidden && hiddenWorktrees.length > 0 && (
              <div className="worktree-list worktree-list-hidden" role="group">
                {hiddenWorktrees.map((wt) => (
                  <div key={wt.id} className="worktree-hidden-row">
                    <span className="worktree-branch-name">
                      {wt.branch_name}
                    </span>
                    <button
                      className="unhide-btn"
                      onClick={() => handleUnhide(wt.id)}
                    >
                      Unhide
                    </button>
                  </div>
                ))}
              </div>
            )}

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
