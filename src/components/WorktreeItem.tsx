import { useState, useCallback } from "react";
import type { WorktreeInfo } from "../hooks/useWorktrees";
import { useUiStore } from "../stores/uiStore";

interface WorktreeItemProps {
  worktree: WorktreeInfo;
  onDelete: (id: number) => void;
}

export function WorktreeItem({ worktree, onDelete }: WorktreeItemProps) {
  const { selectedWorktreeId, setSelectedWorktreeId } = useUiStore();
  const isSelected = selectedWorktreeId === worktree.id;
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const handleClick = useCallback(() => {
    setSelectedWorktreeId(worktree.id);
  }, [worktree.id, setSelectedWorktreeId]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY });
      setSelectedWorktreeId(worktree.id);
    },
    [worktree.id, setSelectedWorktreeId],
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
        <span className="worktree-branch-icon">&#9741;</span>
        <span className="worktree-branch-name">{worktree.branch_name}</span>
        <span className={`worktree-status-dot ${statusClass}`} />
        {worktree.is_dirty && <span className="worktree-dirty-dot" />}
        {worktree.port && (
          <span className="worktree-port">:{worktree.port}</span>
        )}
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
