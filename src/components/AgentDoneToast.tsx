import { useEffect, useCallback } from "react";
import "../styles/agent-toast.css";

export interface AgentDoneToastItem {
  id: string;
  worktreeName: string;
  cwd: string;
  timestamp: number;
}

interface AgentDoneToastProps {
  toasts: AgentDoneToastItem[];
  onDismiss: (id: string) => void;
  onJump: (cwd: string) => void;
}

const AUTO_DISMISS_MS = 6000;

export function AgentDoneToast({
  toasts,
  onDismiss,
  onJump,
}: AgentDoneToastProps) {
  // Auto-dismiss each toast after AUTO_DISMISS_MS
  useEffect(() => {
    if (toasts.length === 0) return;
    const oldest = toasts[0];
    const elapsed = Date.now() - oldest.timestamp;
    const remaining = Math.max(0, AUTO_DISMISS_MS - elapsed);
    const timer = setTimeout(() => onDismiss(oldest.id), remaining);
    return () => clearTimeout(timer);
  }, [toasts, onDismiss]);

  const handleJump = useCallback(
    (toast: AgentDoneToastItem) => {
      onJump(toast.cwd);
      onDismiss(toast.id);
    },
    [onJump, onDismiss],
  );

  if (toasts.length === 0) return null;

  return (
    <div className="agent-toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="agent-toast">
          <div className="agent-toast__icon">
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3.5 8.5l3 3 6-7" />
            </svg>
          </div>
          <div className="agent-toast__body">
            <span className="agent-toast__title">Agent done</span>
            <span className="agent-toast__name">{toast.worktreeName}</span>
          </div>
          <button
            className="agent-toast__jump"
            onClick={() => handleJump(toast)}
            title="Switch to worktree"
          >
            Jump
          </button>
          <button
            className="agent-toast__close"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
