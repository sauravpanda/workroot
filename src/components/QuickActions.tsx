import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

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

const ACTIONS: ActionButton[] = [
  { id: "commit", icon: "\u2713", label: "Commit", group: "git" },
  { id: "push", icon: "\u2191", label: "Push", group: "git" },
  { id: "pull", icon: "\u2193", label: "Pull", group: "git" },
  { id: "diff", icon: "\u00B1", label: "Diff", group: "view" },
];

export function QuickActions({
  worktreeId,
  worktreePath,
  projectId: _projectId,
  onAction,
}: QuickActionsProps) {
  const [isDirty, setIsDirty] = useState(false);
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (worktreeId !== null && worktreePath !== null) {
      const timer = setTimeout(() => setVisible(true), 50);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [worktreeId, worktreePath]);

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

  if (worktreeId === null || worktreePath === null) return null;

  const groups: Array<"git" | "view"> = ["git", "view"];
  const showDock = visible && hovered;

  return (
    <div
      className="fixed bottom-0 left-1/2 z-[9000] h-12 w-[300px] -translate-x-1/2"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={`absolute bottom-4 left-1/2 flex items-center gap-1 whitespace-nowrap rounded-[28px] border border-[var(--border)] bg-[rgba(30,30,34,0.85)] px-4 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.04)] [backdrop-filter:blur(16px)] [-webkit-backdrop-filter:blur(16px)] transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] pointer-events-none opacity-0 -translate-x-1/2 translate-y-5 ${showDock ? "!translate-y-0 !opacity-100 !pointer-events-auto" : ""}`}
      >
        {/* Git status dot */}
        <div
          className={`mr-1.5 size-2 shrink-0 rounded-full transition-colors duration-300 ${
            isDirty
              ? "bg-[var(--warning)] shadow-[0_0_6px_var(--warning)]"
              : "bg-[var(--success)] shadow-[0_0_6px_var(--success)]"
          }`}
          title={isDirty ? "Working tree has changes" : "Working tree is clean"}
        />

        {groups.map((group, gi) => (
          <div key={group} className="flex items-center gap-0.5">
            {gi > 0 && (
              <div className="mx-1.5 h-6 w-px bg-[var(--border)] opacity-50" />
            )}
            {ACTIONS.filter((a) => a.group === group).map((action) => (
              <button
                key={action.id}
                className="group/btn relative flex cursor-pointer flex-col items-center gap-0.5 rounded-sm border-none bg-transparent px-2 py-1.5 transition-[transform,background-color] duration-150 hover:scale-[1.2] hover:-translate-y-0.5 hover:bg-white/[0.06] active:scale-[1.05] active:translate-y-0"
                onClick={() => onAction(action.id)}
                title={action.label}
              >
                <span className="text-[1.1em] leading-none text-[var(--text-primary)] transition-colors duration-100 group-hover/btn:text-[var(--accent)]">
                  {action.icon}
                </span>
                <span className="whitespace-nowrap font-sans text-[0.56em] font-medium tracking-[0.02em] text-[var(--text-muted)] transition-colors duration-100 group-hover/btn:text-[var(--text-secondary)]">
                  {action.label}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
