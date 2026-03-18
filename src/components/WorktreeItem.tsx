import { useState, useCallback } from "react";
import type { WorktreeInfo } from "../hooks/useWorktrees";
import { useUiStore } from "../stores/uiStore";

interface WorktreeItemProps {
  worktree: WorktreeInfo;
  onDelete: (id: number) => void;
}

export function WorktreeItem({ worktree, onDelete }: WorktreeItemProps) {
  const {
    selectedWorktreeId,
    setSelectedWorktreeId,
    setSelectedWorktreePath,
    setSelectedWorktreeName,
    setShowSettings,
  } = useUiStore();
  const isSelected = selectedWorktreeId === worktree.id;
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const handleClick = useCallback(() => {
    setSelectedWorktreeId(worktree.id);
    setSelectedWorktreePath(worktree.path);
    setSelectedWorktreeName(worktree.branch_name);
    setShowSettings(false);
  }, [
    worktree.id,
    worktree.path,
    worktree.branch_name,
    setSelectedWorktreeId,
    setSelectedWorktreePath,
    setSelectedWorktreeName,
    setShowSettings,
  ]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY });
      setSelectedWorktreeId(worktree.id);
      setSelectedWorktreePath(worktree.path);
      setSelectedWorktreeName(worktree.branch_name);
    },
    [
      worktree.id,
      worktree.path,
      worktree.branch_name,
      setSelectedWorktreeId,
      setSelectedWorktreePath,
      setSelectedWorktreeName,
    ],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleDelete = useCallback(() => {
    setContextMenu(null);
    onDelete(worktree.id);
  }, [worktree.id, onDelete]);

  const statusClass =
    worktree.status === "active"
      ? "wt-status-active"
      : worktree.status === "missing"
        ? "wt-status-missing"
        : "wt-status-stopped";

  return (
    <>
      <div
        className={`worktree-item ${isSelected ? "worktree-selected" : ""}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        role="treeitem"
        aria-selected={isSelected}
        tabIndex={0}
      >
        <span className="worktree-branch-icon">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <circle cx="3" cy="3" r="1.8" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="9" cy="9" r="1.8" stroke="currentColor" strokeWidth="1.2" />
            <path d="M3 4.8v1.2a3 3 0 003 3h0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="worktree-branch-name">{worktree.branch_name}</span>
        <span className="worktree-indicators">
          <span className={`worktree-status-dot ${statusClass}`} title={worktree.status} />
          {worktree.is_dirty && (
            <span className="worktree-dirty" title="Uncommitted changes">M</span>
          )}
          {worktree.port && (
            <span className="worktree-port">:{worktree.port}</span>
          )}
        </span>
      </div>

      {contextMenu && (
        <>
          <div className="context-menu-backdrop" onClick={closeContextMenu} />
          <div
            className="context-menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <button className="context-menu-item" disabled>
              Start
            </button>
            <button className="context-menu-item" disabled>
              Stop
            </button>
            <div className="context-menu-separator" />
            <button
              className="context-menu-item destructive"
              onClick={handleDelete}
            >
              Delete Worktree
            </button>
          </div>
        </>
      )}
    </>
  );
}
