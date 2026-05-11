// Cross-component "filter the agents list" channel. The StatusBar
// (rendered at App level) wants to nudge AgentsTab (rendered as a
// child view) to switch its state filter — same problem the openAgent
// channel solves for opening a pane. Module-level latch + CustomEvent
// broadcast.

import type { AgentState } from "./helm-api";

export type AgentFilter = "all" | AgentState;

let pendingFilter: AgentFilter | null = null;

export function requestAgentFilter(filter: AgentFilter): void {
  pendingFilter = filter;
  window.dispatchEvent(new CustomEvent("workroot:agent-filter"));
}

/** Returns and clears the latched pending filter, if any. */
export function consumePendingFilter(): AgentFilter | null {
  const v = pendingFilter;
  pendingFilter = null;
  return v;
}
