import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openShell } from "@tauri-apps/plugin-shell";
import { useAllAgents, type MachineStatus } from "../hooks/useAllAgents";
import type { AgentState } from "../lib/helm-api";
import { AgentDetailPane } from "./AgentDetailPane";
import { consumePendingOpen } from "../lib/openAgent";
import { consumePendingFilter } from "../lib/agentFilter";
import "../styles/agents-tab.css";

interface AgentsTabProps {
  onOpenMachines: () => void;
}

interface Pane {
  paneId: number;
  machineId: number;
  agentId: string;
  /** Pinned panes are never evicted by FIFO when opening a new agent
   *  at capacity. The user toggles via the ⋯ menu. */
  pinned: boolean;
}

type LayoutSize = 1 | 2 | 3 | 4;

// Hard cap. The layout picker lets the user choose 1..4; we don't
// allow more because each extra pane gets too narrow to be useful and
// the per-pane 3 s poll starts adding up.
const MAX_PANES = 4;

const STATE_LABELS: Record<string, string> = {
  waiting_input: "Needs you",
  working: "Working",
  planning: "Planning",
  queued: "Queued",
  done: "Done",
  failed: "Failed",
};

// Strip common suffixes — "Office Mac" → "Office", "build-server" →
// "build", etc. The suffix is rarely useful in the column and just
// eats width.
function shortMachineLabel(label: string): string {
  return label
    .replace(/[\s_-]?(?:mac|macbook|linux|server|host|machine)$/i, "")
    .trim();
}

// Compact "time ago" — 1m / 2h / 3d / "now". Driven by a 30 s tick;
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

function lastSeenPhrase(iso: string | null): string {
  if (!iso) return "";
  const ago = ageSince(iso, Date.now());
  if (ago === "now") return " — last seen just now";
  if (ago === "—") return "";
  return ` — last seen ${ago} ago`;
}

// Draggable splitter between two panes. `direction: 'vertical'` means
// the bar runs vertically — it sits between left/right panes and resizes
// their widths (cursor: col-resize). `'horizontal'` is the opposite: a
// horizontal bar between top/bottom panes (cursor: row-resize).
//
// `ratio` is the size fraction of the *first* sibling (0..1). The drag
// computes a new ratio from the parent's current size and forwards it
// to the parent via onChange.
function Divider({
  direction,
  ratio,
  onChange,
}: {
  direction: "vertical" | "horizontal";
  ratio: number;
  onChange: (next: number) => void;
}) {
  const dragging = useRef(false);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Use mouse button 0 only — Tauri's window-drag region listener
    // can interfere with right-click / middle-click on some surfaces.
    if (e.button !== 0) return;
    e.preventDefault();
    const parent = e.currentTarget.parentElement;
    if (!parent) return;
    const total =
      direction === "vertical" ? parent.offsetWidth : parent.offsetHeight;
    if (total <= 0) return;
    const startPos = direction === "vertical" ? e.clientX : e.clientY;
    const startRatio = ratio;
    dragging.current = true;
    document.body.style.cursor =
      direction === "vertical" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: PointerEvent) => {
      if (!dragging.current) return;
      const cur = direction === "vertical" ? ev.clientX : ev.clientY;
      const delta = cur - startPos;
      const next = Math.max(0.15, Math.min(0.85, startRatio + delta / total));
      onChange(next);
    };
    const cleanup = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", cleanup);
      document.removeEventListener("pointercancel", cleanup);
    };
    // Document listeners (not window): they catch the events even if
    // some inner element calls stopPropagation, and document.body
    // bubbling is reliable across the whole webview.
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", cleanup);
    document.addEventListener("pointercancel", cleanup);
  };
  return (
    <div
      className={`agents-tab__divider agents-tab__divider--${direction}`}
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation={direction === "vertical" ? "vertical" : "horizontal"}
    />
  );
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

type StateFilter = "all" | AgentState;

// Order the filter chips appear in. "all" first, then by attention
// priority (waiting_input → ... → failed). Matches the same ranking
// the list uses internally.
const FILTER_ORDER: StateFilter[] = [
  "all",
  "waiting_input",
  "working",
  "planning",
  "queued",
  "done",
  "failed",
];

const FILTER_LABELS: Record<StateFilter, string> = {
  all: "All",
  waiting_input: "Needs you",
  working: "Working",
  planning: "Planning",
  queued: "Queued",
  done: "Done",
  failed: "Failed",
};

export function AgentsTab({ onOpenMachines }: AgentsTabProps) {
  const { agents, machines, loading, refresh } = useAllAgents();
  const [panes, setPanes] = useState<Pane[]>([]);
  const [focusedPaneId, setFocusedPaneId] = useState<number | null>(null);
  // Active state filter for the list. "all" passes everything through.
  // Counts per chip are computed from the unfiltered list so the user
  // can see "Done 12" even when looking at "Needs you 2".
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  // Keyboard cursor into the filtered agents list — j/k move it,
  // Enter opens the agent under the cursor. -1 means "no cursor"
  // (the user hasn't pressed j/k yet, or the list is empty). #466.
  const [listCursor, setListCursor] = useState<number>(-1);
  // Zed-style "zoom the focused pane" — when set, only this pane is
  // visible inside the panes container (others stay mounted so polls
  // and scroll positions survive). The list pane stays put; only the
  // splits area collapses to one full-size pane. ⌘⇧Z toggles; Esc
  // unzooms.
  const [zoomedPaneId, setZoomedPaneId] = useState<number | null>(null);
  // Layout shape (1-4 cells). Defaults to 1 + auto-grows on open so the
  // out-of-the-box behavior matches v0.4.0 (click two agents → see two
  // splits). Once the user explicitly picks a layout via the picker,
  // userPickedLayout flips to true and auto-grow stops — pick is the
  // intent, don't fight it.
  const [layoutSize, setLayoutSize] = useState<LayoutSize>(1);
  const [userPickedLayout, setUserPickedLayout] = useState(false);
  // Split ratios (0..1) — first sibling fraction. The fixed-grid model
  // is gone; layouts are now flex with draggable dividers between any
  // two adjacent panes. We track three ratios because n=4 has two
  // horizontal cuts (top row, bottom row) plus one vertical cut.
  const [ratios, setRatios] = useState({
    twoCol: 0.5, // n=2: single vertical divider
    vertical: 0.5, // n=3, n=4: top/bottom horizontal divider
    topRow: 0.5, // n=3, n=4: vertical divider in top row
    botRow: 0.5, // n=4: vertical divider in bottom row
  });
  const setRatio = useCallback(
    (key: keyof typeof ratios, value: number) =>
      setRatios((prev) => ({ ...prev, [key]: value })),
    [],
  );
  const [now, setNow] = useState<number>(() => Date.now());
  const paneIdRef = useRef(1);

  // Re-tick the "age" column every 30 s.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Open an agent. Behavior:
  //   - already open → focus that pane
  //   - room left in the layout (panes.length < layoutSize) → append
  //   - at capacity → replace the focused pane if unpinned;
  //     else replace the oldest unpinned pane;
  //     else replace focused anyway (everything pinned, force).
  // The "pinned never evicted" rule is the whole point of the pin.
  const openAgent = useCallback(
    (machineId: number, agentId: string) => {
      setPanes((prev) => {
        const existing = prev.find(
          (p) => p.machineId === machineId && p.agentId === agentId,
        );
        if (existing) {
          setFocusedPaneId(existing.paneId);
          return prev;
        }
        const newPane: Pane = {
          paneId: paneIdRef.current++,
          machineId,
          agentId,
          pinned: false,
        };
        // Room in the current layout? Append.
        if (prev.length < layoutSize) {
          setFocusedPaneId(newPane.paneId);
          return [...prev, newPane];
        }
        // Layout's full but auto-grow still active (user hasn't picked
        // a layout) and there's room within MAX_PANES → grow the
        // layout by one and append.
        if (!userPickedLayout && prev.length < MAX_PANES) {
          setLayoutSize((prev.length + 1) as LayoutSize);
          setFocusedPaneId(newPane.paneId);
          return [...prev, newPane];
        }
        // Pick a slot to replace.
        const focusedIdx = prev.findIndex((p) => p.paneId === focusedPaneId);
        let replaceIdx = -1;
        if (focusedIdx >= 0 && !prev[focusedIdx].pinned) {
          replaceIdx = focusedIdx;
        } else {
          replaceIdx = prev.findIndex((p) => !p.pinned);
        }
        if (replaceIdx === -1) {
          // Everything pinned — replace focused (or first) anyway.
          replaceIdx = focusedIdx >= 0 ? focusedIdx : 0;
        }
        const next = prev.slice();
        next[replaceIdx] = newPane;
        setFocusedPaneId(newPane.paneId);
        return next;
      });
    },
    [layoutSize, focusedPaneId, userPickedLayout],
  );

  const togglePin = useCallback((paneId: number) => {
    setPanes((prev) =>
      prev.map((p) => (p.paneId === paneId ? { ...p, pinned: !p.pinned } : p)),
    );
  }, []);

  // Bridge for the Cmd+P palette → "Open Agent" commands. Two paths:
  //   1. AgentsTab was already mounted and the user picked an agent
  //      from the palette — the CustomEvent fires and we open it.
  //   2. App-level navigation just mounted us as a side effect of the
  //      same palette command — drain any latched request now.
  useEffect(() => {
    const pending = consumePendingOpen();
    if (pending) openAgent(pending.machineId, pending.agentId);
    const onOpen = () => {
      const p = consumePendingOpen();
      if (p) openAgent(p.machineId, p.agentId);
    };
    window.addEventListener("workroot:open-agent", onOpen);
    return () => window.removeEventListener("workroot:open-agent", onOpen);
  }, [openAgent]);

  // Same pattern for the StatusBar's clickable "N need you" → filter
  // the list. AgentsTab is the source of truth for `stateFilter`, so
  // we let other surfaces broadcast intents through this latch.
  useEffect(() => {
    const pending = consumePendingFilter();
    if (pending) setStateFilter(pending);
    const onFilter = () => {
      const p = consumePendingFilter();
      if (p) setStateFilter(p);
    };
    window.addEventListener("workroot:agent-filter", onFilter);
    return () => window.removeEventListener("workroot:agent-filter", onFilter);
  }, []);

  // Switch to a different layout size. Marks the user as having picked
  // explicitly (locks auto-grow). If the new size is smaller than the
  // current pane count, trim — keep pinned first, drop oldest unpinned.
  const setLayout = useCallback((size: LayoutSize) => {
    setUserPickedLayout(true);
    setLayoutSize(size);
    setPanes((prev) => {
      if (prev.length <= size) return prev;
      const toDrop = prev.length - size;
      // Build a list of (idx, p) so we can sort while preserving the
      // original order for the kept set. Sort dropped-first by:
      //   1. pinned later (drop unpinned first)
      //   2. lower idx first (drop older first)
      const indexed = prev.map((p, idx) => ({ idx, p }));
      indexed.sort((a, b) => {
        if (a.p.pinned !== b.p.pinned) return a.p.pinned ? 1 : -1;
        return a.idx - b.idx;
      });
      const dropIds = new Set(indexed.slice(0, toDrop).map((x) => x.p.paneId));
      return prev.filter((p) => !dropIds.has(p.paneId));
    });
  }, []);

  // If the focused pane gets dropped (close, layout trim, agent
  // disappears), move focus to the new last pane (or null).
  useEffect(() => {
    if (focusedPaneId === null) return;
    if (panes.some((p) => p.paneId === focusedPaneId)) return;
    setFocusedPaneId(panes.length > 0 ? panes[panes.length - 1].paneId : null);
  }, [panes, focusedPaneId]);

  const closePane = useCallback((paneId: number) => {
    setPanes((prev) => {
      const next = prev.filter((p) => p.paneId !== paneId);
      // If we just closed the focused pane, focus the new last one
      // (or null if empty).
      setFocusedPaneId((prevFocus) => {
        if (prevFocus !== paneId) return prevFocus;
        return next.length > 0 ? next[next.length - 1].paneId : null;
      });
      return next;
    });
  }, []);

  // Drop a pane only when its machine is online AND the agent is no
  // longer in the list (deleted remotely or kill+wipe). If the machine
  // failed its latest poll (transient network blip on Tailscale, daemon
  // restart), keep the pane — closing it under the user is catastrophic
  // when 3 panes are open and wifi hiccups for one cycle.
  useEffect(() => {
    const onlineMachineIds = new Set(
      machines.filter((m) => m.error === null).map((m) => m.machine.id),
    );
    setPanes((prev) =>
      prev.filter((p) => {
        if (!onlineMachineIds.has(p.machineId)) return true; // keep — machine offline, can't tell
        return agents.some(
          (a) => a.id === p.agentId && a.machine_id === p.machineId,
        );
      }),
    );
  }, [agents, machines]);

  // Keyboard:
  //   Esc       — unzoom if zoomed, else close the focused pane
  //   ⌘⇧Z       — toggle zoom on the focused pane (Zed parity)
  // Both no-op inside text inputs so they don't fight Cancel/blur.
  useEffect(() => {
    if (panes.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput =
        target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT");

      // ⌘⇧Z toggles zoom on the focused pane.
      if (
        e.key.toLowerCase() === "z" &&
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        !inInput
      ) {
        e.preventDefault();
        setZoomedPaneId((cur) => {
          if (cur !== null) return null; // unzoom
          return focusedPaneId ?? panes[panes.length - 1].paneId;
        });
        return;
      }

      if (e.key !== "Escape") return;
      if (inInput) return;
      // Esc unzooms first (don't close the pane while we're zoomed —
      // the user expects "back to multi-pane view").
      if (zoomedPaneId !== null) {
        setZoomedPaneId(null);
        return;
      }
      const id =
        focusedPaneId ??
        (panes.length > 0 ? panes[panes.length - 1].paneId : null);
      if (id !== null) closePane(id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panes, focusedPaneId, zoomedPaneId, closePane]);

  // If the zoomed pane goes away (closed elsewhere, agent deleted),
  // unzoom so the layout doesn't end up stuck on a phantom pane.
  useEffect(() => {
    if (zoomedPaneId === null) return;
    if (!panes.some((p) => p.paneId === zoomedPaneId)) {
      setZoomedPaneId(null);
    }
  }, [panes, zoomedPaneId]);

  const offlineMachines = useMemo(
    () => machines.filter((m) => m.error !== null),
    [machines],
  );

  const noMachines = machines.length === 0;
  const splitView = panes.length > 0;

  const onRetryMachine = useCallback(
    (machineId: number) => {
      void invoke("touch_helm_machine_seen", { id: machineId }).catch(() => {});
      refresh();
    },
    [refresh],
  );

  // Build a Set of "open" machineId:agentId so list rows can show whether
  // they're already in a pane.
  const openSet = useMemo(() => {
    const s = new Set<string>();
    for (const p of panes) s.add(`${p.machineId}:${p.agentId}`);
    return s;
  }, [panes]);

  // Per-state counts for the filter chips, computed once from the
  // unfiltered list so a chip's number stays meaningful even when the
  // filter narrows what the user sees.
  const stateCounts = useMemo(() => {
    const counts: Record<string, number> = { all: agents.length };
    for (const a of agents) {
      counts[a.state] = (counts[a.state] ?? 0) + 1;
    }
    return counts;
  }, [agents]);

  const filteredAgents = useMemo(
    () =>
      stateFilter === "all"
        ? agents
        : agents.filter((a) => a.state === stateFilter),
    [agents, stateFilter],
  );

  // List navigation: j/k move the cursor through filteredAgents,
  // Enter opens the agent under the cursor. Skipped when the user is
  // typing in an input/textarea so it doesn't fight reply composition.
  // #466 first slice.
  useEffect(() => {
    if (filteredAgents.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "TEXTAREA" ||
          t.tagName === "INPUT" ||
          t.isContentEditable)
      ) {
        return;
      }
      // Ignore modifier-key combinations — those are reserved for
      // ⌘P / ⌘⇧Z / ⌘W etc., not for list navigation.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setListCursor((cur) =>
          Math.min(filteredAgents.length - 1, (cur < 0 ? -1 : cur) + 1),
        );
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setListCursor((cur) =>
          cur < 0 ? filteredAgents.length - 1 : Math.max(0, cur - 1),
        );
      } else if (e.key === "Enter" && listCursor >= 0) {
        const a = filteredAgents[listCursor];
        if (a) {
          e.preventDefault();
          openAgent(a.machine_id, a.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filteredAgents, listCursor, openAgent]);

  // Keep the cursor in range as the filtered list churns (poll updates,
  // filter changes). Clamp rather than reset so the cursor sticks
  // visually near where the user left it.
  useEffect(() => {
    if (filteredAgents.length === 0) {
      if (listCursor !== -1) setListCursor(-1);
      return;
    }
    if (listCursor >= filteredAgents.length) {
      setListCursor(filteredAgents.length - 1);
    }
  }, [filteredAgents, listCursor]);

  // Scroll the cursor row into view whenever it moves.
  useEffect(() => {
    if (listCursor < 0) return;
    const el = document.querySelector(".agents-tab__row--cursor");
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [listCursor]);

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
        {agents.length > 0 && (
          <div
            className="agents-tab__filters"
            role="tablist"
            aria-label="Filter by state"
          >
            {FILTER_ORDER.map((f) => {
              const count = stateCounts[f] ?? 0;
              // Hide state chips that have zero matches so we don't
              // show "Failed 0 · Queued 0" noise. "All" is always
              // visible.
              if (f !== "all" && count === 0) return null;
              const active = stateFilter === f;
              return (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={
                    active
                      ? "agents-tab__filter-chip agents-tab__filter-chip--active"
                      : "agents-tab__filter-chip"
                  }
                  onClick={() => setStateFilter(f)}
                >
                  {FILTER_LABELS[f]} {count}
                </button>
              );
            })}
          </div>
        )}
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
          <h3 className="agents-tab__empty-title">
            Workroot watches AI agents running on your machines.
          </h3>
          <p>
            Connect a helm-daemon — local, remote over SSH, or Tailscale — to
            see what your agents are doing right now.
          </p>
          <div className="agents-tab__empty-actions">
            <button
              className="agents-tab__empty-cta agents-tab__empty-cta--primary"
              onClick={onOpenMachines}
            >
              Add a machine
            </button>
            <button
              type="button"
              className="agents-tab__empty-cta"
              onClick={() => {
                void openShell(
                  "https://github.com/sauravpanda/workroot#readme",
                ).catch(() => {});
              }}
            >
              Read the setup docs
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="agents-tab__empty">Loading agents…</div>
      ) : agents.length === 0 ? (
        <div className="agents-tab__empty">
          <h3 className="agents-tab__empty-title">No active agents yet.</h3>
          <p>Spawn one from the helm CLI:</p>
          <pre className="agents-tab__empty-code">
            helm spawn &lt;repo&gt; "&lt;task&gt;"
          </pre>
          <p>It'll show up here within a few seconds of starting.</p>
        </div>
      ) : (
        <div
          className={
            machines.length <= 1
              ? "agents-tab__table agents-tab__table--solo-machine"
              : "agents-tab__table"
          }
          role="table"
          aria-label="Agents"
        >
          <div className="agents-tab__thead" role="row">
            <span role="columnheader">State</span>
            <span role="columnheader">Name</span>
            <span role="columnheader">Doing</span>
            <span role="columnheader">Repo</span>
            <span role="columnheader">Machine</span>
            <span role="columnheader" className="agents-tab__col-age">
              Age
            </span>
          </div>
          <div className="agents-tab__tbody">
            {filteredAgents.length === 0 && stateFilter !== "all" && (
              <div className="agents-tab__filter-empty">
                No agents in <strong>{FILTER_LABELS[stateFilter]}</strong>.{" "}
                <button
                  type="button"
                  className="agents-tab__filter-reset"
                  onClick={() => setStateFilter("all")}
                >
                  Show all
                </button>
              </div>
            )}
            {filteredAgents.map((a, idx) => {
              const isOpen = openSet.has(`${a.machine_id}:${a.id}`);
              const isCursor = idx === listCursor;
              const stateLabel = STATE_LABELS[a.state] ?? a.state;
              const activity = a.last_activity ?? a.task;
              const machineShort = shortMachineLabel(a.machine_label);
              const ageStr = ageSince(a.updated_at, now);
              return (
                <div
                  key={`${a.machine_id}:${a.id}`}
                  className={[
                    "agents-tab__row",
                    isOpen ? "agents-tab__row--selected" : "",
                    isCursor ? "agents-tab__row--cursor" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => openAgent(a.machine_id, a.id)}
                  role="row"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openAgent(a.machine_id, a.id);
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
                  <span
                    className="agents-tab__cell-age"
                    title={`updated ${ageStr} ago — on ${a.machine_label}`}
                  >
                    {ageStr}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {splitView && (
        <div className="agents-tab__hint">
          <div
            className="agents-tab__layout-picker"
            role="radiogroup"
            aria-label="Layout"
          >
            <span className="agents-tab__layout-label">layout:</span>
            {([1, 2, 3, 4] as LayoutSize[]).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={layoutSize === n}
                className={
                  layoutSize === n
                    ? "agents-tab__layout-btn agents-tab__layout-btn--active"
                    : "agents-tab__layout-btn"
                }
                onClick={() => setLayout(n)}
                title={`${n} pane${n > 1 ? "s" : ""}`}
              >
                [{n}]
              </button>
            ))}
          </div>
          <div className="agents-tab__hint-text">
            {panes.length}/{layoutSize} · click row to open · drag dividers ·
            ⌘⇧Z zoom · Esc closes focused
          </div>
        </div>
      )}
    </>
  );

  if (!splitView) {
    return <div className="agents-tab">{list}</div>;
  }

  // Build cells = filled panes padded with nulls up to layoutSize.
  // Empty cells render as placeholders.
  const cells: (Pane | null)[] = [];
  for (let i = 0; i < layoutSize; i++) {
    cells.push(panes[i] ?? null);
  }

  // Render a single grid cell — either the AgentDetailPane wrapped in
  // focus/click chrome, or an empty placeholder telling the user to
  // click an agent to fill it.
  const cell = (c: Pane | null, key: string | number, basis?: number) => {
    if (!c) {
      return (
        <div
          key={`empty-${key}`}
          className="agents-tab__pane agents-tab__pane--empty"
          style={
            basis !== undefined ? { flexBasis: `${basis * 100}%` } : undefined
          }
        >
          <div className="agents-tab__placeholder">
            click an agent in the list to open here
          </div>
        </div>
      );
    }
    // Resolve the machine once here so the pane (and useAgentDetail
    // inside it) doesn't have to do a per-pane lookup every poll.
    const paneMachine =
      machines.find((m) => m.machine.id === c.machineId)?.machine ?? null;
    const focused = focusedPaneId === c.paneId;
    const isZoomed = zoomedPaneId === c.paneId;
    const cls = [
      "agents-tab__pane",
      focused && "agents-tab__pane--focused",
      c.pinned && "agents-tab__pane--pinned",
      isZoomed && "agents-tab__pane--zoomed",
      zoomedPaneId !== null && !isZoomed && "agents-tab__pane--zoom-hidden",
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <div
        key={c.paneId}
        className={cls}
        style={
          basis !== undefined ? { flexBasis: `${basis * 100}%` } : undefined
        }
        onClick={() => setFocusedPaneId(c.paneId)}
        onFocus={() => setFocusedPaneId(c.paneId)}
      >
        <AgentDetailPane
          machine={paneMachine}
          agentId={c.agentId}
          onClose={() => closePane(c.paneId)}
          onDeleted={() => closePane(c.paneId)}
          pinned={c.pinned}
          onTogglePin={() => togglePin(c.paneId)}
          zoomed={zoomedPaneId === c.paneId}
          onToggleZoom={() => {
            setZoomedPaneId((cur) => (cur === c.paneId ? null : c.paneId));
            setFocusedPaneId(c.paneId);
          }}
        />
      </div>
    );
  };

  let panesNode: React.ReactNode;
  if (zoomedPaneId !== null) {
    // Zoom mode: skip split-row wrappers entirely so the zoomed cell
    // can fill the panes container directly. Other cells still render
    // (cell() applies --zoom-hidden) so their state — scroll, expand,
    // unread counter — survives across zoom toggles.
    panesNode = cells.map((c, i) => (
      <Fragment key={`zcell-${i}`}>{cell(c, i)}</Fragment>
    ));
  } else if (layoutSize === 1) {
    panesNode = cell(cells[0], 0);
  } else if (layoutSize === 2) {
    panesNode = (
      <>
        {cell(cells[0], 0, ratios.twoCol)}
        <Divider
          direction="vertical"
          ratio={ratios.twoCol}
          onChange={(n) => setRatio("twoCol", n)}
        />
        {cell(cells[1], 1, 1 - ratios.twoCol)}
      </>
    );
  } else if (layoutSize === 3) {
    // Top row: cells[0] | cells[1]; bottom row spans: cells[2].
    panesNode = (
      <>
        <div
          className="agents-tab__split-row"
          style={{ flexBasis: `${ratios.vertical * 100}%` }}
        >
          {cell(cells[0], 0, ratios.topRow)}
          <Divider
            direction="vertical"
            ratio={ratios.topRow}
            onChange={(n) => setRatio("topRow", n)}
          />
          {cell(cells[1], 1, 1 - ratios.topRow)}
        </div>
        <Divider
          direction="horizontal"
          ratio={ratios.vertical}
          onChange={(n) => setRatio("vertical", n)}
        />
        <div
          className="agents-tab__split-row"
          style={{ flexBasis: `${(1 - ratios.vertical) * 100}%` }}
        >
          {cell(cells[2], 2, 1)}
        </div>
      </>
    );
  } else {
    // 4 panes: 2×2.
    panesNode = (
      <>
        <div
          className="agents-tab__split-row"
          style={{ flexBasis: `${ratios.vertical * 100}%` }}
        >
          {cell(cells[0], 0, ratios.topRow)}
          <Divider
            direction="vertical"
            ratio={ratios.topRow}
            onChange={(n) => setRatio("topRow", n)}
          />
          {cell(cells[1], 1, 1 - ratios.topRow)}
        </div>
        <Divider
          direction="horizontal"
          ratio={ratios.vertical}
          onChange={(n) => setRatio("vertical", n)}
        />
        <div
          className="agents-tab__split-row"
          style={{ flexBasis: `${(1 - ratios.vertical) * 100}%` }}
        >
          {cell(cells[2], 2, ratios.botRow)}
          <Divider
            direction="vertical"
            ratio={ratios.botRow}
            onChange={(n) => setRatio("botRow", n)}
          />
          {cell(cells[3], 3, 1 - ratios.botRow)}
        </div>
      </>
    );
  }

  return (
    <div className="agents-tab agents-tab--splits">
      <div className="agents-tab__list-pane">{list}</div>
      <div
        className={
          zoomedPaneId !== null
            ? `agents-tab__panes agents-tab__panes--n${layoutSize} agents-tab__panes--zoomed`
            : `agents-tab__panes agents-tab__panes--n${layoutSize}`
        }
      >
        {panesNode}
      </div>
    </div>
  );
}
