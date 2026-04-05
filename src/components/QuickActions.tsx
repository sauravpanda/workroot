import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/quick-actions.css";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ChangedFile {
  path: string;
  status: string;
}

interface QuickActionsProps {
  worktreeId: number | null;
  worktreePath: string | null;
  projectId: number | null;
  onAction: (action: string) => void;
}

interface ActionButton {
  id: string;
  icon: string;
  label: string;
  group: "git" | "view";
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ACTIONS: ActionButton[] = [
  // Git
  { id: "commit", icon: "\u2713", label: "Commit", group: "git" },
  { id: "push", icon: "\u2191", label: "Push", group: "git" },
  { id: "pull", icon: "\u2193", label: "Pull", group: "git" },
  // View
  { id: "diff", icon: "\u00B1", label: "Diff", group: "view" },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function QuickActions({
  worktreeId,
  worktreePath,
  projectId: _projectId,
  onAction,
}: QuickActionsProps) {
  const [isDirty, setIsDirty] = useState(false);
  const [visible, setVisible] = useState(false);

  // Animate in when worktree selected
  useEffect(() => {
    if (worktreeId !== null && worktreePath !== null) {
      const timer = setTimeout(() => setVisible(true), 50);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [worktreeId, worktreePath]);

  // Check git status periodically
  const checkStatus = useCallback(async () => {
    if (!worktreePath) {
      setIsDirty(false);
      return;
    }
    try {
      const files = await invoke<ChangedFile[]>("get_changed_files", {
        worktreePath,
      });
      setIsDirty(files.length > 0);
    } catch {
      setIsDirty(false);
    }
  }, [worktreePath]);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 15_000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const [hovered, setHovered] = useState(false);

  if (worktreeId === null || worktreePath === null) return null;

  const groups: Array<"git" | "view"> = ["git", "view"];
  const showDock = visible && hovered;

  return (
    <div
      className="qa-hover-zone"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={`qa-dock ${showDock ? "qa-dock--visible" : ""}`}>
        {/* Git status indicator */}
        <div
          className={`qa-status-dot ${isDirty ? "qa-status-dot--dirty" : "qa-status-dot--clean"}`}
          title={isDirty ? "Working tree has changes" : "Working tree is clean"}
        />

        {groups.map((group, gi) => (
          <div key={group} className="qa-group">
            {gi > 0 && <div className="qa-divider" />}
            {ACTIONS.filter((a) => a.group === group).map((action) => (
              <button
                key={action.id}
                className="qa-btn"
                onClick={() => onAction(action.id)}
                title={action.label}
              >
                <span className="qa-btn-icon">{action.icon}</span>
                <span className="qa-btn-label">{action.label}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
