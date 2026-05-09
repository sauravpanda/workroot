// Cross-component "open this agent" channel. The Cmd+P palette
// (rendered at App level) needs to ask AgentsTab (rendered as a child
// view) to open a specific agent in a pane. They don't share state,
// so we route the request through a module-level latch + a
// CustomEvent broadcast — same pattern as useAllAgents' fleet
// snapshot.
//
// Two delivery modes:
//   - AgentsTab is already mounted → it picks up the event and calls
//     its local openAgent() immediately.
//   - AgentsTab is being mounted by the same palette command (because
//     we navigated home first) → on mount it consumes the pending
//     latch.

export interface PendingOpen {
  machineId: number;
  agentId: string;
}

let pendingOpen: PendingOpen | null = null;

export function requestOpenAgent(machineId: number, agentId: string): void {
  pendingOpen = { machineId, agentId };
  window.dispatchEvent(new CustomEvent("workroot:open-agent"));
}

/** Returns and clears the latched pending request, if any. */
export function consumePendingOpen(): PendingOpen | null {
  const v = pendingOpen;
  pendingOpen = null;
  return v;
}
