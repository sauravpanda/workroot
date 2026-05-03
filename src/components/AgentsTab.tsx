import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAllAgents, type MachineStatus } from "../hooks/useAllAgents";
import { AgentDetailPane } from "./AgentDetailPane";
import "../styles/agents-tab.css";

interface AgentsTabProps {
  onOpenMachines: () => void;
}

interface Selection {
  machineId: number;
  agentId: string;
}

const STATE_LABELS: Record<string, string> = {
  waiting_input: "Needs you",
  working: "Working",
  planning: "Planning",
  queued: "Queued",
  done: "Done",
  failed: "Failed",
};

// "Office Mac" → "Office", "personal-mac" → "personal", etc. The "-mac"
// suffix is the same on every machine and is wasted column width.
function shortMachineLabel(label: string): string {
  return label
    .replace(/[\s_-]?mac$/i, "")
    .replace(/[\s_-]?macbook$/i, "")
    .trim();
}

// Compact "time ago" — 1m / 2h / 3d / "now". Driven by the 5 s poll tick;
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

// "now" → "just now"; everything else → "last seen 3m ago"
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
  const [selected, setSelected] = useState<Selection | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  // Re-tick the "age" column every 30 s so rows update between polls
  // without a full re-fetch.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const closeDetail = useCallback(() => setSelected(null), []);

  // Drop selection if the underlying agent disappears (deleted remotely,
  // or its machine went offline).
  useEffect(() => {
    if (!selected) return;
    const stillThere = agents.some(
      (a) => a.id === selected.agentId && a.machine_id === selected.machineId,
    );
    if (!stillThere) setSelected(null);
  }, [agents, selected]);

  // Esc closes the detail pane.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, closeDetail]);

  const offlineMachines = useMemo(
    () => machines.filter((m) => m.error !== null),
    [machines],
  );

  const noMachines = machines.length === 0;
  const twoPane = selected !== null;

  const onRetryMachine = useCallback(
    (machineId: number) => {
      // No per-machine retry endpoint — kick a full refresh. The fan-out
      // re-tries every enabled machine.
      void invoke("touch_helm_machine_seen", { id: machineId }).catch(() => {});
      refresh();
    },
    [refresh],
  );

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
              const isSelected =
                selected?.agentId === a.id &&
                selected?.machineId === a.machine_id;
              const stateLabel = STATE_LABELS[a.state] ?? a.state;
              const activity = a.last_activity ?? a.task;
              const machineShort = shortMachineLabel(a.machine_label);
              return (
                <div
                  key={`${a.machine_id}:${a.id}`}
                  className={
                    isSelected
                      ? "agents-tab__row agents-tab__row--selected"
                      : "agents-tab__row"
                  }
                  onClick={() =>
                    setSelected({ machineId: a.machine_id, agentId: a.id })
                  }
                  role="row"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected({
                        machineId: a.machine_id,
                        agentId: a.id,
                      });
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
    </>
  );

  if (!twoPane) {
    return <div className="agents-tab">{list}</div>;
  }

  return (
    <div className="agents-tab agents-tab--two-pane">
      <div className="agents-tab__list-pane">{list}</div>
      <div className="agents-tab__detail-pane">
        <AgentDetailPane
          machineId={selected.machineId}
          agentId={selected.agentId}
          onClose={closeDetail}
          onDeleted={closeDetail}
        />
      </div>
    </div>
  );
}
