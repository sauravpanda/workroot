import { useState, useCallback } from "react";
import type { WorktreeInfo, DeleteWarnings } from "../hooks/useWorktrees";
import { useUiStore } from "../stores/uiStore";

interface WorktreeItemProps {
  worktree: WorktreeInfo;
  highlight?: string;
  onDelete: (id: number) => void;
  onHide: (id: number) => void;
  onCheckWarnings: (id: number) => Promise<DeleteWarnings | null>;
}

/** Render `text` with the first occurrence of `query` wrapped in a highlight mark. */
function HighlightedText({
  text,
  query,
}: {
  text: string;
  query: string;
}): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="wt-match-highlight">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function WorktreeItem({
  worktree,
  highlight = "",
  onDelete,
  onHide,
  onCheckWarnings,
}: WorktreeItemProps) {
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
  const [deleteConfirm, setDeleteConfirm] = useState<{
    warnings: DeleteWarnings;
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

  const handleHideClick = useCallback(() => {
    setContextMenu(null);
    onHide(worktree.id);
  }, [worktree.id, onHide]);

  const handleDeleteClick = useCallback(async () => {
    setContextMenu(null);
    const warnings = await onCheckWarnings(worktree.id);
    if (warnings && (warnings.is_dirty || warnings.unpushed_commits > 0)) {
      setDeleteConfirm({ warnings });
    } else {
      onDelete(worktree.id);
    }
  }, [worktree.id, onDelete, onCheckWarnings]);

  const handleConfirmDelete = useCallback(() => {
    setDeleteConfirm(null);
    onDelete(worktree.id);
  }, [worktree.id, onDelete]);

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirm(null);
  }, []);

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
            <circle
              cx="3"
              cy="3"
              r="1.8"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <circle
              cx="9"
              cy="9"
              r="1.8"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <path
              d="M3 4.8v1.2a3 3 0 003 3h0"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="worktree-branch-name">
          <HighlightedText text={worktree.branch_name} query={highlight} />
        </span>
        <span className="worktree-indicators">
          <span
            className={`worktree-status-dot ${statusClass}`}
            title={worktree.status}
          />
          {worktree.is_dirty && (
            <span className="worktree-dirty" title="Uncommitted changes">
              M
            </span>
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
            <button className="context-menu-item" onClick={handleHideClick}>
              Hide
            </button>
            <button
              className="context-menu-item destructive"
              onClick={handleDeleteClick}
            >
              Delete Worktree
            </button>
          </div>
        </>
      )}

      {deleteConfirm && (
        <>
          <div className="context-menu-backdrop" onClick={handleCancelDelete} />
          <div className="delete-confirm-dialog">
            <div className="delete-confirm-title">Delete worktree?</div>
            <div className="delete-confirm-warnings">
              {deleteConfirm.warnings.is_dirty && (
                <div className="delete-confirm-warning">
                  Has uncommitted changes
                </div>
              )}
              {deleteConfirm.warnings.unpushed_commits > 0 && (
                <div className="delete-confirm-warning">
                  {deleteConfirm.warnings.unpushed_commits} unpushed{" "}
                  {deleteConfirm.warnings.unpushed_commits === 1
                    ? "commit"
                    : "commits"}
                </div>
              )}
            </div>
            <div className="delete-confirm-actions">
              <button
                className="delete-confirm-btn cancel"
                onClick={handleCancelDelete}
              >
                Cancel
              </button>
              <button
                className="delete-confirm-btn confirm"
                onClick={handleConfirmDelete}
              >
                Delete Anyway
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
