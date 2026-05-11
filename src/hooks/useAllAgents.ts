// Fan out a `/v1/agents` fetch across every enabled helm machine, merge
// the results, and re-run on a fixed interval.
//
// Mirrors helm/app/lib/fanout.ts in spirit but uses native React state
// instead of React Query — workroot doesn't pull RQ in just for this and
// the whole "n machines × poll" surface is small enough to not need it.

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  type Agent,
  type AgentState,
  type HelmMachine,
  clientFor,
} from "../lib/helm-api";

export interface MergedAgent extends Agent {
  /** Local id of the machine the agent was fetched from. */
  machine_id: number;
  /** User-chosen label for that machine (e.g. "Work MBP"). */
  machine_label: string;
}

export interface MachineStatus {
  machine: HelmMachine;
  /** Last fetch error message, if any. Null when the most recent fetch
   *  succeeded. */
  error: string | null;
  /** Number of agents this machine returned on its last successful
   *  fetch. */
  agent_count: number;
}

export interface AllAgentsResult {
  agents: MergedAgent[];
  machines: MachineStatus[];
  /** True only on the very first load — subsequent polls keep
   *  `loading` false so the list doesn't flicker. */
  loading: boolean;
  refresh: () => void;
}

const ATTENTION_RANK: Record<AgentState, number> = {
  waiting_input: 0,
  working: 1,
  planning: 2,
  queued: 3,
  done: 4,
  failed: 5,
};

function sortByAttention(a: MergedAgent, b: MergedAgent): number {
  const ra = ATTENTION_RANK[a.state] ?? 99;
  const rb = ATTENTION_RANK[b.state] ?? 99;
  if (ra !== rb) return ra - rb;
  return b.updated_at.localeCompare(a.updated_at);
}

const POLL_INTERVAL_MS = 5_000;

// Module-level snapshot of the latest fleet poll so other surfaces
// (StatusBar, future fleet widgets) can read without spinning up
// their own polling instance. Updated by useAllAgents on each
// successful fetch and broadcast via a CustomEvent.
let cachedFleet: AllAgentsResult = {
  agents: [],
  machines: [],
  loading: true,
  refresh: () => {},
};

// Last value we pushed to the tray, so we don't IPC every poll when
// the count hasn't changed. Module-scoped: matches cachedFleet.
let lastTrayCount = -1;

function publishFleet(next: Omit<AllAgentsResult, "refresh">): void {
  cachedFleet = { ...next, refresh: cachedFleet.refresh };
  window.dispatchEvent(new CustomEvent("workroot:fleet"));
  const needsYou = next.agents.filter(
    (a) => a.state === "waiting_input",
  ).length;
  if (needsYou !== lastTrayCount) {
    lastTrayCount = needsYou;
    void invoke("update_tray_badge", { needsYou }).catch(() => {
      // Older builds before #436 don't have this command — ignore.
    });
  }
}

/** Read-only view of the latest fleet snapshot. Subscribes to the
 *  same updates useAllAgents broadcasts — no separate polling. */
export function useFleetSnapshot(): {
  agents: MergedAgent[];
  machines: MachineStatus[];
  loading: boolean;
} {
  const [snap, setSnap] = useState(() => ({
    agents: cachedFleet.agents,
    machines: cachedFleet.machines,
    loading: cachedFleet.loading,
  }));
  useEffect(() => {
    const sync = () =>
      setSnap({
        agents: cachedFleet.agents,
        machines: cachedFleet.machines,
        loading: cachedFleet.loading,
      });
    window.addEventListener("workroot:fleet", sync);
    sync(); // pick up any updates that happened between mount + subscribe
    return () => window.removeEventListener("workroot:fleet", sync);
  }, []);
  return snap;
}

export function useAllAgents(): AllAgentsResult {
  const [agents, setAgents] = useState<MergedAgent[]>([]);
  const [machines, setMachines] = useState<MachineStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const cancelledRef = useRef(false);

  const fetchOnce = useCallback(async () => {
    let allMachines: HelmMachine[];
    try {
      allMachines = await invoke<HelmMachine[]>("list_helm_machines");
    } catch {
      // Tauri command itself failed — surface as empty list, no agents.
      if (!cancelledRef.current) {
        setMachines([]);
        setAgents([]);
      }
      return;
    }

    const enabled = allMachines.filter((m) => m.enabled);
    const results = await Promise.all(
      enabled.map(
        async (machine): Promise<MachineStatus & { agents: MergedAgent[] }> => {
          try {
            const { agents: list } = await clientFor(machine).agents();
            // Mark as seen on first successful fetch per render.
            void invoke("touch_helm_machine_seen", { id: machine.id }).catch(
              () => {},
            );
            return {
              machine,
              error: null,
              agent_count: list.length,
              agents: list.map((a) => ({
                ...a,
                machine_id: machine.id,
                machine_label: machine.label,
              })),
            };
          } catch (e) {
            return {
              machine,
              error: String(e),
              agent_count: 0,
              agents: [],
            };
          }
        },
      ),
    );

    if (cancelledRef.current) return;

    const merged = results
      .flatMap((r) => r.agents)
      .filter((a) => !a.archived)
      .sort(sortByAttention);

    const machineStatuses = results.map(({ machine, error, agent_count }) => ({
      machine,
      error,
      agent_count,
    }));
    setAgents(merged);
    setMachines(machineStatuses);
    setLoading(false);
    publishFleet({
      agents: merged,
      machines: machineStatuses,
      loading: false,
    });
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    void fetchOnce();

    // Pause polling while the document is hidden — saves daemon
    // round-trips and battery when the window is minimised. Catch
    // up on visibility-change so the user doesn't see stale data
    // when they come back.
    let id: number | null = null;
    const start = () => {
      if (id !== null) return;
      id = window.setInterval(() => void fetchOnce(), POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (id !== null) {
        window.clearInterval(id);
        id = null;
      }
    };
    if (!document.hidden) start();
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        void fetchOnce();
        start();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelledRef.current = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchOnce]);

  return { agents, machines, loading, refresh: () => void fetchOnce() };
}
