import { useState, useEffect } from "react";
import "../styles/status-bar.css";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface StatusBarProps {
  projectName: string | null;
  branchName: string | null;
  isGitHubConnected: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function StatusBar({
  projectName,
  branchName,
  isGitHubConnected,
}: StatusBarProps) {
  const [time, setTime] = useState(() => formatTime(new Date()));

  useEffect(() => {
    const update = () => setTime(formatTime(new Date()));
    /* Align to the start of the next minute */
    const now = new Date();
    const msToNextMinute =
      (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    const timeout = setTimeout(() => {
      update();
      const interval = setInterval(update, 60_000);
      cleanup = () => clearInterval(interval);
    }, msToNextMinute);

    let cleanup: (() => void) | undefined;
    return () => {
      clearTimeout(timeout);
      cleanup?.();
    };
  }, []);

  return (
    <div className="status-bar">
      {/* -- Left side -- */}
      <div className="status-bar-left">
        <span className="status-bar-item">
          {projectName ?? "No project selected"}
        </span>
        {branchName && (
          <span className="status-bar-item">
            <span className="status-bar-branch-icon">
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="6" y1="3" x2="6" y2="13" />
                <circle cx="6" cy="3" r="2" />
                <circle cx="6" cy="13" r="2" />
                <circle cx="13" cy="5" r="2" />
                <path d="M13 7c0 3-2 4-7 4" />
              </svg>
            </span>
            <span className="status-bar-branch">{branchName}</span>
          </span>
        )}
      </div>

      {/* -- Right side -- */}
      <div className="status-bar-right">
        <span className="status-bar-item">
          <span
            className={`status-bar-dot ${
              isGitHubConnected
                ? "status-bar-dot--connected"
                : "status-bar-dot--disconnected"
            }`}
          />
          <span className="status-bar-connection">
            {isGitHubConnected ? "Connected" : "Disconnected"}
          </span>
        </span>
        <span className="status-bar-item">
          <span className="status-bar-time">{time}</span>
        </span>
        <span className="status-bar-item">
          <kbd className="status-bar-kbd">{"\u2318K"}</kbd>
        </span>
      </div>
    </div>
  );
}
