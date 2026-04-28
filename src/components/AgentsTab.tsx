import { useCallback, useEffect, useState } from "react";
import { useAllAgents } from "../hooks/useAllAgents";
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

export function AgentsTab({ onOpenMachines }: AgentsTabProps) {
  const { agents, machines, loading } = useAllAgents();
  const [selected, setSelected] = useState<Selection | null>(null);

  const closeDetail = useCallback(() => setSelected(null), []);

  // Drop the selection if the underlying agent disappears (e.g. deleted
  // remotely) — keeps the right pane from rendering stale data.
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

  const noMachines = machines.length === 0;
  const twoPane = selected !== null;

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
        <div className="agents-tab__list">
          {agents.map((a) => {
            const isSelected =
              selected?.agentId === a.id &&
              selected?.machineId === a.machine_id;
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
                role="button"
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
                  className={`agents-tab__row-state agents-tab__row-state--${a.state}`}
                >
                  {STATE_LABELS[a.state] ?? a.state}
                </span>
                <div className="agents-tab__row-meta">
                  <span className="agents-tab__row-name">{a.name}</span>
                  <span className="agents-tab__row-task">
                    {a.last_activity ?? a.task}
                  </span>
                </div>
                <span className="agents-tab__row-repo">{a.repo}</span>
                <span className="agents-tab__row-machine">
                  {a.machine_label}
                </span>
              </div>
            );
          })}
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
