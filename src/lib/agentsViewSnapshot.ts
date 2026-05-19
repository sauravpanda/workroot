// Cross-component read-only view of AgentsTab's pane state, so the
// StatusBar (rendered at App level) can give honest keyboard hints
// ("⌘⇧Z zoom" only when a pane exists, "Esc unzoom" only when one
// is currently zoomed). Mirrors the openAgent / agentFilter / fleet
// snapshot patterns: module-level cache + CustomEvent broadcast.

import { useEffect, useState } from "react";

export interface AgentsViewSnapshot {
  paneCount: number;
  zoomed: boolean;
}

let cached: AgentsViewSnapshot = { paneCount: 0, zoomed: false };

export function publishAgentsView(next: AgentsViewSnapshot): void {
  // Only fire if something changed — saves React work in StatusBar.
  if (cached.paneCount === next.paneCount && cached.zoomed === next.zoomed) {
    return;
  }
  cached = next;
  window.dispatchEvent(new CustomEvent("workroot:agents-view"));
}

export function useAgentsViewSnapshot(): AgentsViewSnapshot {
  const [snap, setSnap] = useState<AgentsViewSnapshot>(cached);
  useEffect(() => {
    const sync = () => setSnap(cached);
    window.addEventListener("workroot:agents-view", sync);
    sync();
    return () => window.removeEventListener("workroot:agents-view", sync);
  }, []);
  return snap;
}
