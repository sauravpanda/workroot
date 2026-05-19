import { useState, useEffect, useMemo } from "react";
import { useFleetSnapshot } from "../hooks/useAllAgents";
import { requestAgentFilter } from "../lib/agentFilter";
import { useAgentsViewSnapshot } from "../lib/agentsViewSnapshot";
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
/*  Fleet summary — left-most status zone                              */
/* ------------------------------------------------------------------ */

// One-line ambient answer to "is anything on fire across the fleet."
// Renders nothing when the user hasn't registered any helm machines
// yet; otherwise: "N machines online · M agents (K need you)".
// "K need you" goes amber when > 0.
function FleetSummary() {
  const { machines, agents } = useFleetSnapshot();
  const summary = useMemo(() => {
    if (machines.length === 0) return null;
    const online = machines.filter((m) => m.error === null).length;
    const needsYou = agents.filter((a) => a.state === "waiting_input").length;
    return { online, total: machines.length, agents: agents.length, needsYou };
  }, [machines, agents]);
  if (!summary) return null;

  const machineLabel =
    summary.total === summary.online
      ? `${summary.online} machine${summary.online === 1 ? "" : "s"}`
      : `${summary.online}/${summary.total} machines`;
  const agentLabel = `${summary.agents} agent${summary.agents === 1 ? "" : "s"}`;

  return (
    <span
      className={
        summary.needsYou > 0
          ? "status-bar-item status-bar-fleet status-bar-fleet--alert"
          : "status-bar-item status-bar-fleet"
      }
      title={
        summary.online < summary.total
          ? `${summary.total - summary.online} machine(s) unreachable`
          : undefined
      }
    >
      {machineLabel} · {agentLabel}
      {summary.needsYou > 0 && (
        <>
          {" ("}
          <button
            type="button"
            className="status-bar-fleet-link"
            onClick={() => requestAgentFilter("waiting_input")}
            title="Filter agents to waiting-on-you"
          >
            {summary.needsYou} need you
          </button>
          {")"}
        </>
      )}
    </span>
  );
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
  const agentsView = useAgentsViewSnapshot();
  const { agents, machines } = useFleetSnapshot();

  useEffect(() => {
    const update = () => setTime(formatTime(new Date()));
    /* Align to the start of the next minute */
    const now = new Date();
    const msToNextMinute =
      (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    let cleanup: (() => void) | undefined;
    const timeout = setTimeout(() => {
      update();
      const interval = setInterval(update, 60_000);
      cleanup = () => clearInterval(interval);
    }, msToNextMinute);

    return () => {
      clearTimeout(timeout);
      cleanup?.();
    };
  }, []);

  return (
    <div className="status-bar">
      {/* -- Left side -- */}
      <div className="status-bar-left">
        <FleetSummary />
        {projectName ? (
          <span className="status-bar-item">{projectName}</span>
        ) : machines.length > 0 ? (
          // On the Agents view (no worktree selected), "No project
          // selected" is stale/confusing. Show agent context instead.
          // #503.
          <span className="status-bar-item">
            {agents.length} agent{agents.length === 1 ? "" : "s"}
          </span>
        ) : null}
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
          <span
            className="status-bar-connection"
            title="GitHub authentication status"
          >
            GitHub: {isGitHubConnected ? "Connected" : "Disconnected"}
          </span>
        </span>
        <span className="status-bar-item">
          <span className="status-bar-time">{time}</span>
        </span>
        {/* Honest keymap hint \u2014 only the shortcuts that are actually
         *  wired today (#467) AND apply to the current context (#501).
         *  \u2318K palette is always shown; the rest are gated on whether
         *  there's a pane to act on. */}
        <span
          className="status-bar-item status-bar-hints"
          title="Keyboard shortcuts"
        >
          <kbd className="status-bar-kbd">{"\u2318K"}</kbd>
          <span className="status-bar-hint-label">palette</span>
          {agentsView.paneCount > 0 && (
            <>
              <span className="status-bar-hint-sep">{"\u00b7"}</span>
              <kbd className="status-bar-kbd">{"\u2318\u21e7Z"}</kbd>
              <span className="status-bar-hint-label">zoom</span>
            </>
          )}
          {agentsView.zoomed && (
            <>
              <span className="status-bar-hint-sep">{"\u00b7"}</span>
              <kbd className="status-bar-kbd">Esc</kbd>
              <span className="status-bar-hint-label">unzoom</span>
            </>
          )}
        </span>
      </div>
    </div>
  );
}
