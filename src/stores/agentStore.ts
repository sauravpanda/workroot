import { createContext, useContext, useState, useCallback } from "react";

interface AgentStoreValue {
  /** Paths (cwd) of worktrees whose agent recently completed. */
  donePaths: Set<string>;
  markDone: (cwd: string) => void;
  clearDone: (cwd: string) => void;
}

export const AgentContext = createContext<AgentStoreValue>({
  donePaths: new Set(),
  markDone: () => {},
  clearDone: () => {},
});

export function useAgentStore() {
  return useContext(AgentContext);
}

export function useAgentStoreProvider(): AgentStoreValue {
  const [donePaths, setDonePaths] = useState<Set<string>>(new Set());

  const markDone = useCallback((cwd: string) => {
    setDonePaths((prev) => new Set(prev).add(cwd));
  }, []);

  const clearDone = useCallback((cwd: string) => {
    setDonePaths((prev) => {
      const next = new Set(prev);
      next.delete(cwd);
      return next;
    });
  }, []);

  return { donePaths, markDone, clearDone };
}
