// Single-agent live detail fetch.
//
// Given a (machine_id, agent_id) pair, repeatedly fetches /v1/agents/:id
// against the matching machine. Used by the right pane in AgentsTab to
// keep the thread/usage view current while an agent runs.

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { type AgentDetail, type HelmMachine, clientFor } from "../lib/helm-api";

const POLL_INTERVAL_MS = 3_000;

export interface AgentDetailResult {
  detail: AgentDetail | null;
  /** Machine the agent belongs to. Null when not yet resolved or if the
   *  machine row has been removed. */
  machine: HelmMachine | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAgentDetail(
  machineId: number | null,
  agentId: string | null,
): AgentDetailResult {
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [machine, setMachine] = useState<HelmMachine | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const fetchOnce = useCallback(async () => {
    if (machineId === null || agentId === null) {
      setDetail(null);
      setMachine(null);
      setError(null);
      return;
    }
    try {
      const machines = await invoke<HelmMachine[]>("list_helm_machines");
      const m = machines.find((x) => x.id === machineId) ?? null;
      if (!m) {
        if (!cancelledRef.current) {
          setMachine(null);
          setDetail(null);
          setError("Machine no longer registered");
        }
        return;
      }
      if (!cancelledRef.current) setMachine(m);
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
  }, [machineId, agentId]);

  useEffect(() => {
    cancelledRef.current = false;
    if (machineId === null || agentId === null) {
      setDetail(null);
      setMachine(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetchOnce();
    const id = window.setInterval(() => void fetchOnce(), POLL_INTERVAL_MS);
    return () => {
      cancelledRef.current = true;
      window.clearInterval(id);
    };
  }, [fetchOnce, machineId, agentId]);

  return {
    detail,
    machine,
    loading,
    error,
    refresh: () => void fetchOnce(),
  };
}
