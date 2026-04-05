import { useEffect } from "react";
import { useErrorReporter, type AppError } from "../contexts/ErrorContext";

const AUTO_DISMISS_MS: Record<AppError["severity"], number> = {
  info: 4000,
  warning: 6000,
  error: 0, // errors stay until manually dismissed
};

const severityStyles: Record<AppError["severity"], string> = {
  error:
    "border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.07)] [&_.toast-msg]:text-[#fca5a5]",
  warning:
    "border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.07)] [&_.toast-msg]:text-[#fcd34d]",
  info: "border-[var(--border)] bg-[var(--bg-elevated)]",
};

function Toast({ err, onDismiss }: { err: AppError; onDismiss: () => void }) {
  useEffect(() => {
    const ms = AUTO_DISMISS_MS[err.severity];
    if (ms > 0) {
      const t = setTimeout(onDismiss, ms);
      return () => clearTimeout(t);
    }
  }, [err.id, err.severity, onDismiss]);

  return (
    <div
      className={`flex items-start gap-2.5 rounded-[var(--radius)] border px-3 py-2.5 shadow-[var(--shadow-lg)] [animation:toast-in_0.2s_var(--ease-spring)] pointer-events-auto ${severityStyles[err.severity]}`}
      role="alert"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="toast-msg text-xs font-medium leading-[1.4] text-[var(--text-primary)]">
          {err.message}
        </span>
        {err.detail && (
          <span className="break-words font-mono text-[11px] leading-[1.4] text-[var(--text-muted)]">
            {err.detail}
          </span>
        )}
      </div>
      <button
        className="flex size-[18px] shrink-0 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent p-0 text-[10px] text-[var(--text-muted)] transition-[color,background] duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

export function GlobalErrorToast() {
  const { errors, dismissError } = useErrorReporter();
  if (errors.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-6 right-6 z-[9999] flex max-w-[380px] flex-col-reverse gap-2"
      aria-live="polite"
    >
      {errors.map((err) => (
        <Toast key={err.id} err={err} onDismiss={() => dismissError(err.id)} />
      ))}
    </div>
  );
}
