// Live tmux-pane fetch for an agent. Polls /v1/agents/:id/pane while
// `enabled` is true; stops when toggled off. Used by AgentDetailPane
// to render the raw terminal — what `tmux attach` would show — so the
// user can see and interact with TUI modals the cleaned chat view
// strips (Claude's /monitor, /resume picker, bash-tool approval).
//
// Mirrors the helm phone app's pattern: tight 500 ms cadence while
// pane mode is active, paused while document.hidden.

import { useCallback, useEffect, useRef, useState } from "react";
import { clientFor, type HelmMachine } from "../lib/helm-api";

const POLL_INTERVAL_MS = 500;

export interface AgentPaneResult {
  text: string;
  loading: boolean;
  error: string | null;
}

export function useAgentPane(
  machine: HelmMachine | null,
  agentId: string | null,
  enabled: boolean,
): AgentPaneResult {
  const [text, setText] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const machineRef = useRef(machine);
  machineRef.current = machine;

  const fetchOnce = useCallback(async () => {
    const m = machineRef.current;
    if (!m || !agentId) return;
    try {
      const t = await clientFor(m).agentPane(agentId);
      if (!cancelledRef.current) {
        setText(t);
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
    if (!enabled || !machine || !agentId) {
      // Clear stale content when pane mode is off — next toggle-on
      // should show a clean "loading" state, not the last frame.
      setText("");
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetchOnce();

    let interval: number | null = null;
    const start = () => {
      if (interval !== null) return;
      interval = window.setInterval(() => void fetchOnce(), POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (interval !== null) {
        window.clearInterval(interval);
        interval = null;
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
    // machine.id rather than `machine` so identity changes (a fresh
    // object with the same id from each useAllAgents poll) don't tear
    // down the interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchOnce, machine?.id, agentId, enabled]);

  return { text, loading, error };
}
