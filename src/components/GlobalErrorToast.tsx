import { useEffect } from "react";
import { useErrorReporter, type AppError } from "../contexts/ErrorContext";
import "../styles/global-error-toast.css";

const AUTO_DISMISS_MS: Record<AppError["severity"], number> = {
  info: 4000,
  warning: 6000,
  error: 0, // errors stay until manually dismissed
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
    <div className={`global-toast global-toast--${err.severity}`} role="alert">
      <div className="global-toast__body">
        <span className="global-toast__msg">{err.message}</span>
        {err.detail && (
          <span className="global-toast__detail">{err.detail}</span>
        )}
      </div>
      <button
        className="global-toast__close"
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
    <div className="global-toast-stack" aria-live="polite">
      {errors.map((err) => (
        <Toast key={err.id} err={err} onDismiss={() => dismissError(err.id)} />
      ))}
    </div>
  );
}
