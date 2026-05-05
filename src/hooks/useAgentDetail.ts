// Single-agent live detail fetch.
//
// Given a (machine, agent_id) pair, repeatedly polls /v1/agents/:id
// against that machine. Used by the right pane in AgentsTab to keep
// the thread/usage view current while an agent runs.
//
// History: v0.4.5 and earlier called `invoke("list_helm_machines")`
// inside this hook every poll tick to look up the machine row by id.
// At 4 panes × 3 s polling that was ~80 SQLite calls/min just for
// machine lookups. v0.4.6 has the parent (AgentsTab) pass the
// resolved machine in directly — same data, no DB round-trip.
//
// Also new in v0.4.6: polling pauses while document.hidden, so a
// minimised window doesn't burn battery firing useless requests.

import { useCallback, useEffect, useRef, useState } from "react";
import { type AgentDetail, type HelmMachine, clientFor } from "../lib/helm-api";

const POLL_INTERVAL_MS = 3_000;

export interface AgentDetailResult {
  detail: AgentDetail | null;
  /** Echoed back from the input — exposed here so the consumer doesn't
   *  have to thread the same value separately. Null when no machine. */
  machine: HelmMachine | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAgentDetail(
  machine: HelmMachine | null,
  agentId: string | null,
): AgentDetailResult {
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  // Always-fresh ref so polling closures pick up new machine objects
  // (e.g., token rotation) without re-creating the interval.
  const machineRef = useRef(machine);
  machineRef.current = machine;

  const fetchOnce = useCallback(async () => {
    const m = machineRef.current;
    if (!m || !agentId) {
      if (!cancelledRef.current) {
        setDetail(null);
        setError(null);
      }
      return;
    }
    try {
      const d = await clientFor(m).agent(agentId);
      if (!cancelledRef.current) {
        setDetail(d);
        setError(null);
      }
    } catch (e) {
      if (!cancelledRef.current) setError(String(e));
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    cancelledRef.current = false;
    if (!machine || !agentId) {
      setDetail(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetchOnce();

    let interval: number | null = null;
    const startPolling = () => {
      if (interval !== null) return;
      interval = window.setInterval(() => void fetchOnce(), POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (interval !== null) {
        window.clearInterval(interval);
        interval = null;
      }
    };

    if (!document.hidden) startPolling();

    const onVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        // Catch up immediately, then resume the regular tick.
        void fetchOnce();
        startPolling();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelledRef.current = true;
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // machine.id rather than `machine` so identity changes (a fresh
    // object with the same id from each useAllAgents poll) don't tear
    // down the interval. Token / label changes still get picked up via
    // machineRef on the next poll tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchOnce, machine?.id, agentId]);

  return {
    detail,
    machine,
    loading,
    error,
    refresh: () => void fetchOnce(),
  };
}
