import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAllAgents, type MachineStatus } from "../hooks/useAllAgents";
import { AgentDetailPane } from "./AgentDetailPane";
import "../styles/agents-tab.css";

interface AgentsTabProps {
  onOpenMachines: () => void;
}

interface Pane {
  paneId: number;
  machineId: number;
  agentId: string;
}

// Cap on simultaneously open agent panes. 4 fits a 2×2 grid; beyond
// that each pane gets too narrow to be useful and the per-pane 3 s
// poll starts adding up.
const MAX_PANES = 4;

const STATE_LABELS: Record<string, string> = {
  waiting_input: "Needs you",
  working: "Working",
  planning: "Planning",
  queued: "Queued",
  done: "Done",
  failed: "Failed",
};

// "Office Mac" → "Office", "personal-mac" → "personal". The "-mac"
// suffix is the same on every machine and is wasted column width.
function shortMachineLabel(label: string): string {
  return label
    .replace(/[\s_-]?mac$/i, "")
    .replace(/[\s_-]?macbook$/i, "")
    .trim();
}

// Compact "time ago" — 1m / 2h / 3d / "now". Driven by a 30 s tick;
// resolution coarser than 1 m doesn't matter for an agent log.
function ageSince(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const secs = Math.max(0, Math.floor((now - t) / 1000));
  if (secs < 30) return "now";
  if (secs < 60 * 60) return `${Math.floor(secs / 60)}m`;
  if (secs < 60 * 60 * 24) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

function lastSeenPhrase(iso: string | null): string {
  if (!iso) return "";
  const ago = ageSince(iso, Date.now());
  if (ago === "now") return " — last seen just now";
  if (ago === "—") return "";
  return ` — last seen ${ago} ago`;
}

function OfflineBanner({
  status,
  onOpenMachines,
  onRetry,
}: {
  status: MachineStatus;
  onOpenMachines: () => void;
  onRetry: () => void;
}) {
  const errTitle = status.error ?? "no response";
  return (
    <div className="agents-tab__banner" role="alert">
      <span className="agents-tab__banner-dot" />
      <span className="agents-tab__banner-msg" title={errTitle}>
        <strong>{status.machine.label}</strong> unreachable
        {lastSeenPhrase(status.machine.last_seen_at)}
      </span>
      <div className="agents-tab__banner-actions">
        <button
          type="button"
          className="agents-tab__banner-btn"
          onClick={onRetry}
        >
          Retry
        </button>
        <button
          type="button"
          className="agents-tab__banner-btn"
          onClick={onOpenMachines}
        >
          Open machines
        </button>
      </div>
    </div>
  );
}

export function AgentsTab({ onOpenMachines }: AgentsTabProps) {
  const { agents, machines, loading, refresh } = useAllAgents();
  const [panes, setPanes] = useState<Pane[]>([]);
  const [focusedPaneId, setFocusedPaneId] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const paneIdRef = useRef(1);

  // Re-tick the "age" column every 30 s.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Open an agent in a pane. If it's already open, just focus that pane.
  // If we're at MAX_PANES, evict the oldest.
  const openAgent = useCallback((machineId: number, agentId: string) => {
    setPanes((prev) => {
      const existing = prev.find(
        (p) => p.machineId === machineId && p.agentId === agentId,
      );
      if (existing) {
        setFocusedPaneId(existing.paneId);
        return prev;
      }
      const newPane: Pane = {
        paneId: paneIdRef.current++,
        machineId,
        agentId,
      };
      const next =
        prev.length >= MAX_PANES
          ? [...prev.slice(1), newPane]
          : [...prev, newPane];
      setFocusedPaneId(newPane.paneId);
      return next;
    });
  }, []);

  const closePane = useCallback((paneId: number) => {
    setPanes((prev) => {
      const next = prev.filter((p) => p.paneId !== paneId);
      // If we just closed the focused pane, focus the new last one
      // (or null if empty).
      setFocusedPaneId((prevFocus) => {
        if (prevFocus !== paneId) return prevFocus;
        return next.length > 0 ? next[next.length - 1].paneId : null;
      });
      return next;
    });
  }, []);

  // Drop any pane whose underlying agent has disappeared (deleted
  // remotely, or its machine went offline).
  useEffect(() => {
    setPanes((prev) =>
      prev.filter((p) =>
        agents.some((a) => a.id === p.agentId && a.machine_id === p.machineId),
      ),
    );
  }, [agents]);

  // Esc closes the focused pane.
  useEffect(() => {
    if (panes.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      // Don't intercept Esc inside text inputs (clears the input).
      if (
        target &&
        (target.tagName === "TEXTAREA" || target.tagName === "INPUT")
      ) {
        return;
      }
      const id =
        focusedPaneId ??
        (panes.length > 0 ? panes[panes.length - 1].paneId : null);
      if (id !== null) closePane(id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panes, focusedPaneId, closePane]);

  const offlineMachines = useMemo(
    () => machines.filter((m) => m.error !== null),
    [machines],
  );

  const noMachines = machines.length === 0;
  const splitView = panes.length > 0;

  const onRetryMachine = useCallback(
    (machineId: number) => {
      void invoke("touch_helm_machine_seen", { id: machineId }).catch(() => {});
      refresh();
    },
    [refresh],
  );

  // Build a Set of "open" machineId:agentId so list rows can show whether
  // they're already in a pane.
  const openSet = useMemo(() => {
    const s = new Set<string>();
    for (const p of panes) s.add(`${p.machineId}:${p.agentId}`);
    return s;
  }, [panes]);

  const list = (
    <>
      <div className="agents-tab__header">
        <h2 className="agents-tab__title">Agents</h2>
        <div className="agents-tab__machines-bar">
          {machines.map(({ machine, error, agent_count }) => (
            <span
              key={machine.id}
              className={
                error
                  ? "agents-tab__machine-pill agents-tab__machine-pill--err"
                  : "agents-tab__machine-pill"
              }
              title={error ?? `${agent_count} agents`}
            >
              <span className="agents-tab__machine-pill-dot" />
              {machine.label}
              {!error && agent_count > 0 && ` · ${agent_count}`}
            </span>
          ))}
          <button
            className="agents-tab__empty-cta"
            onClick={onOpenMachines}
            style={{ marginTop: 0 }}
          >
            Manage machines
          </button>
        </div>
      </div>

      {offlineMachines.map((m) => (
        <OfflineBanner
          key={m.machine.id}
          status={m}
          onOpenMachines={onOpenMachines}
          onRetry={() => onRetryMachine(m.machine.id)}
        />
      ))}

      {noMachines ? (
        <div className="agents-tab__empty">
          <p>No helm machines registered.</p>
          <p style={{ fontSize: 12, marginTop: 8 }}>
            Add a daemon endpoint to start watching agents.
          </p>
          <button className="agents-tab__empty-cta" onClick={onOpenMachines}>
            Add machine
          </button>
        </div>
      ) : loading ? (
        <div className="agents-tab__empty">Loading agents…</div>
      ) : agents.length === 0 ? (
        <div className="agents-tab__empty">
          <p>No active agents.</p>
          <p style={{ fontSize: 12, marginTop: 8 }}>
            Spawn one from the helm CLI or phone app — it'll show up here.
          </p>
        </div>
      ) : (
        <div className="agents-tab__table" role="table" aria-label="Agents">
          <div className="agents-tab__thead" role="row">
            <span role="columnheader">State</span>
            <span role="columnheader">Name</span>
            <span role="columnheader">Activity</span>
            <span role="columnheader">Repo</span>
            <span role="columnheader">Machine</span>
            <span role="columnheader" className="agents-tab__col-age">
              Age
            </span>
          </div>
          <div className="agents-tab__tbody">
            {agents.map((a) => {
              const isOpen = openSet.has(`${a.machine_id}:${a.id}`);
              const stateLabel = STATE_LABELS[a.state] ?? a.state;
              const activity = a.last_activity ?? a.task;
              const machineShort = shortMachineLabel(a.machine_label);
              return (
                <div
                  key={`${a.machine_id}:${a.id}`}
                  className={
                    isOpen
                      ? "agents-tab__row agents-tab__row--selected"
                      : "agents-tab__row"
                  }
                  onClick={() => openAgent(a.machine_id, a.id)}
                  role="row"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openAgent(a.machine_id, a.id);
                    }
                  }}
                >
                  <span
                    className={`agents-tab__state-pill agents-tab__state-pill--${a.state}`}
                  >
                    {stateLabel}
                  </span>
                  <span className="agents-tab__cell-name" title={a.name}>
                    {a.name}
                  </span>
                  <span className="agents-tab__cell-activity" title={activity}>
                    {activity}
                  </span>
                  <span className="agents-tab__cell-repo" title={a.repo}>
                    {a.repo}
                  </span>
                  <span
                    className="agents-tab__cell-machine"
                    title={a.machine_label}
                  >
                    {machineShort}
                  </span>
                  <span className="agents-tab__cell-age">
                    {ageSince(a.updated_at, now)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {splitView && (
        <div className="agents-tab__hint">
          {panes.length} of {MAX_PANES} panes open · click a row to open another
          · Esc closes the focused pane
        </div>
      )}
    </>
  );

  if (!splitView) {
    return <div className="agents-tab">{list}</div>;
  }

  return (
    <div className="agents-tab agents-tab--splits">
      <div className="agents-tab__list-pane">{list}</div>
      <div className={`agents-tab__panes agents-tab__panes--n${panes.length}`}>
        {panes.map((p) => {
          const focused = focusedPaneId === p.paneId;
          return (
            <div
              key={p.paneId}
              className={
                focused
                  ? "agents-tab__pane agents-tab__pane--focused"
                  : "agents-tab__pane"
              }
              onClick={() => setFocusedPaneId(p.paneId)}
              onFocus={() => setFocusedPaneId(p.paneId)}
            >
              <AgentDetailPane
                machineId={p.machineId}
                agentId={p.agentId}
                onClose={() => closePane(p.paneId)}
                onDeleted={() => closePane(p.paneId)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
