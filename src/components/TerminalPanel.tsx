import { useEffect, useRef, useState, useCallback, useReducer } from "react";
import { createPortal } from "react-dom";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { spawn } from "tauri-pty";
import type { IPty } from "tauri-pty";
import { getThemeById, DEFAULT_THEME_ID } from "../lib/terminalThemes";
import "@xterm/xterm/css/xterm.css";
import "../styles/terminal.css";
import {
  SplitPane,
  collectLeafIds,
  splitLeaf,
  removeLeaf,
  useSplitPaneShortcuts,
} from "./TerminalSplitPane";
import type { PaneNode, SplitDirection } from "./TerminalSplitPane";

interface TerminalTab {
  id: string;
  label: string;
  cwd: string;
  paneTree: PaneNode;
}

interface TerminalPanelProps {
  cwd: string;
  worktreeName: string;
  shell: string;
  initCommand: string | null;
  themeId?: string;
  onAgentComplete?: () => void;
  onAgentNeedsAttention?: () => void;
}

let paneCounter = 0;

function newPaneId(): string {
  return `pane-${++paneCounter}`;
}

function makeTab(label: string, cwd: string): TerminalTab {
  const paneId = newPaneId();
  return {
    id: paneId,
    label,
    cwd,
    paneTree: { type: "leaf", id: paneId },
  };
}

// Per-path tab state — persists across worktree switches so terminals stay alive.
interface PathTabState {
  worktreeName: string;
  tabs: TerminalTab[];
  activeTabId: string;
  focusedPaneId: string | null;
}

function makeInitialPathState(worktreeName: string, cwd: string): PathTabState {
  const firstTab = makeTab(worktreeName, cwd);
  return {
    worktreeName,
    tabs: [firstTab],
    activeTabId: firstTab.id,
    focusedPaneId:
      firstTab.paneTree.type === "leaf" ? firstTab.paneTree.id : null,
  };
}

export function TerminalPanel({
  cwd,
  worktreeName,
  shell,
  initCommand,
  themeId,
  onAgentComplete,
  onAgentNeedsAttention,
}: TerminalPanelProps) {
  // All per-worktree tab states, keyed by cwd path.
  const [pathStates, setPathStates] = useState<Record<string, PathTabState>>(
    () => ({ [cwd]: makeInitialPathState(worktreeName, cwd) }),
  );
  // Which cwd is currently visible.
  const [activeCwd, setActiveCwd] = useState(cwd);

  // Stable per-pane DOM containers. Each pane gets one div that is NEVER
  // recreated — it is physically moved into the SplitPane slot via the slot
  // ref callback.  Because the container is stable, the React portal inside it
  // (which holds the TerminalInstance) never unmounts when the split tree is
  // restructured, so the PTY process survives the split.
  const paneContainersRef = useRef<Map<string, HTMLDivElement>>(new Map());
  // Bumped whenever a new container is registered so that portals re-render.
  const [, triggerUpdate] = useReducer((n: number) => n + 1, 0);

  // When the cwd prop changes (user switches worktree), create a new path state
  // if one doesn't exist yet — but never destroy existing states so PTY
  // processes on other paths stay alive.
  useEffect(() => {
    setActiveCwd(cwd);
    setPathStates((prev) => {
      if (prev[cwd]) return prev;
      return { ...prev, [cwd]: makeInitialPathState(worktreeName, cwd) };
    });
  }, [cwd, worktreeName]);

  // Convenience: current path's state + derived values.
  const currentState = pathStates[activeCwd];
  const tabs = currentState?.tabs ?? [];
  const activeTabId = currentState?.activeTabId ?? "";
  const focusedPaneId = currentState?.focusedPaneId ?? null;

  const updateCurrentPath = useCallback(
    (updater: (s: PathTabState) => PathTabState) => {
      setPathStates((prev) => {
        const s = prev[activeCwd];
        if (!s) return prev;
        return { ...prev, [activeCwd]: updater(s) };
      });
    },
    [activeCwd],
  );

  const addTab = useCallback(() => {
    const newTab = makeTab("Shell", activeCwd);
    updateCurrentPath((s) => ({
      ...s,
      tabs: [...s.tabs, newTab],
      activeTabId: newTab.id,
      focusedPaneId:
        newTab.paneTree.type === "leaf" ? newTab.paneTree.id : null,
    }));
  }, [activeCwd, updateCurrentPath]);

  const closeTab = useCallback(
    (id: string) => {
      updateCurrentPath((s) => {
        const next = s.tabs.filter((t) => t.id !== id);
        if (next.length === 0) return s;
        let newActiveTabId = s.activeTabId;
        if (s.activeTabId === id) {
          const idx = s.tabs.findIndex((t) => t.id === id);
          newActiveTabId = next[Math.min(idx, next.length - 1)].id;
        }
        const nextActiveTab = next.find((t) => t.id === newActiveTabId);
        const nextLeafIds = nextActiveTab
          ? collectLeafIds(nextActiveTab.paneTree)
          : [];
        const nextFocusedPaneId = nextLeafIds.includes(s.focusedPaneId ?? "")
          ? s.focusedPaneId
          : (nextLeafIds[0] ?? null);
        return {
          ...s,
          tabs: next,
          activeTabId: newActiveTabId,
          focusedPaneId: nextFocusedPaneId,
        };
      });
    },
    [updateCurrentPath],
  );

  const activeTab = tabs.find((t) => t.id === activeTabId);

  useEffect(() => {
    if (!activeTab) return;
    const leafIds = collectLeafIds(activeTab.paneTree);
    const nextFocusedPaneId =
      focusedPaneId && leafIds.includes(focusedPaneId)
        ? focusedPaneId
        : (leafIds[0] ?? null);
    if (nextFocusedPaneId !== focusedPaneId) {
      updateCurrentPath((s) => ({ ...s, focusedPaneId: nextFocusedPaneId }));
    }
  }, [activeTab, focusedPaneId, updateCurrentPath]);

  const updatePaneTree = useCallback(
    (newTree: PaneNode) => {
      updateCurrentPath((s) => ({
        ...s,
        tabs: s.tabs.map((t) =>
          t.id === s.activeTabId ? { ...t, paneTree: newTree } : t,
        ),
      }));
    },
    [updateCurrentPath],
  );

  const setActiveTabId = useCallback(
    (id: string) =>
      updateCurrentPath((s) => {
        const nextActiveTab = s.tabs.find((t) => t.id === id);
        return {
          ...s,
          activeTabId: id,
          focusedPaneId: nextActiveTab
            ? (collectLeafIds(nextActiveTab.paneTree)[0] ?? null)
            : s.focusedPaneId,
        };
      }),
    [updateCurrentPath],
  );

  const setFocusedPaneId = useCallback(
    (id: string | null) =>
      updateCurrentPath((s) => ({ ...s, focusedPaneId: id })),
    [updateCurrentPath],
  );

  const handleSplitH = useCallback(() => {
    if (!focusedPaneId || !activeTab) return;
    const newId = newPaneId();
    const newTree = splitLeaf(
      activeTab.paneTree,
      focusedPaneId,
      "vertical",
      newId,
    );
    updatePaneTree(newTree);
    setFocusedPaneId(newId);
  }, [focusedPaneId, activeTab, updatePaneTree, setFocusedPaneId]);

  const handleSplitV = useCallback(() => {
    if (!focusedPaneId || !activeTab) return;
    const newId = newPaneId();
    const newTree = splitLeaf(
      activeTab.paneTree,
      focusedPaneId,
      "horizontal",
      newId,
    );
    updatePaneTree(newTree);
    setFocusedPaneId(newId);
  }, [focusedPaneId, activeTab, updatePaneTree, setFocusedPaneId]);

  const handleClosePane = useCallback(() => {
    if (!focusedPaneId || !activeTab) return;
    const leafIds = collectLeafIds(activeTab.paneTree);
    if (leafIds.length <= 1) return;
    const newTree = removeLeaf(activeTab.paneTree, focusedPaneId);
    if (newTree) {
      updatePaneTree(newTree);
      setFocusedPaneId(collectLeafIds(newTree)[0] ?? null);
    }
  }, [focusedPaneId, activeTab, updatePaneTree, setFocusedPaneId]);

  const handleClosePaneById = useCallback(
    (paneId: string) => {
      if (!activeTab) return;
      const leafIds = collectLeafIds(activeTab.paneTree);
      if (leafIds.length <= 1) return;
      const newTree = removeLeaf(activeTab.paneTree, paneId);
      if (newTree) {
        updatePaneTree(newTree);
        if (focusedPaneId === paneId) {
          setFocusedPaneId(collectLeafIds(newTree)[0] ?? null);
        }
      }
    },
    [activeTab, focusedPaneId, updatePaneTree, setFocusedPaneId],
  );

  const handleSplitLeaf = useCallback(
    (paneId: string, direction: SplitDirection) => {
      if (!activeTab) return;
      const leafIds = collectLeafIds(activeTab.paneTree);
      if (leafIds.length >= 4) return;
      const newId = newPaneId();
      const newTree = splitLeaf(activeTab.paneTree, paneId, direction, newId);
      updatePaneTree(newTree);
      setFocusedPaneId(newId);
    },
    [activeTab, updatePaneTree, setFocusedPaneId],
  );

  useSplitPaneShortcuts(handleSplitH, handleSplitV, handleClosePane);

  return (
    <div className="terminal-fullscreen">
      <div className="terminal-tab-bar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`terminal-tab ${tab.id === activeTabId ? "terminal-tab-active" : ""}`}
            onClick={() => setActiveTabId(tab.id)}
          >
            <span className="terminal-tab-label">{tab.label}</span>
            {tabs.length > 1 && (
              <button
                className="terminal-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                &times;
              </button>
            )}
          </div>
        ))}
        <button className="terminal-tab-add" onClick={addTab} title="New tab">
          +
        </button>
        {activeTab && collectLeafIds(activeTab.paneTree).length < 4 && (
          <>
            <button
              className="terminal-tab-add"
              onClick={handleSplitV}
              title="Split vertically (⌘\)"
            >
              &#9783;
            </button>
            <button
              className="terminal-tab-add"
              onClick={handleSplitH}
              title="Split horizontally (⌘⇧-)"
            >
              &#9776;
            </button>
          </>
        )}
      </div>
      <div className="terminal-tab-content">
        {/* Render ALL paths' tabs so their TerminalInstance components stay
            mounted and PTY processes survive worktree switches. Only the
            active path + active tab is made visible. */}
        {Object.entries(pathStates).flatMap(([path, state]) =>
          state.tabs.map((tab) => {
            const isActivePathAndTab =
              path === activeCwd && tab.id === state.activeTabId;
            return (
              <div
                key={tab.id}
                className={`terminal-instance ${isActivePathAndTab ? "terminal-instance-active" : ""}`}
              >
                <SplitPane
                  node={tab.paneTree}
                  onUpdateNode={(newTree) =>
                    setPathStates((prev) => {
                      const s = prev[path];
                      if (!s) return prev;
                      return {
                        ...prev,
                        [path]: {
                          ...s,
                          tabs: s.tabs.map((t) =>
                            t.id === tab.id ? { ...t, paneTree: newTree } : t,
                          ),
                        },
                      };
                    })
                  }
                  renderLeaf={(paneId) => (
                    // Each leaf renders a thin slot div.  The ref callback
                    // places (or moves) the stable per-pane container into this
                    // slot so the terminal content appears in the right place.
                    <div
                      style={{ width: "100%", height: "100%" }}
                      ref={(slotEl) => {
                        if (!slotEl) return;
                        // Create a stable container for this pane on first use.
                        if (!paneContainersRef.current.has(paneId)) {
                          const div = document.createElement("div");
                          div.style.cssText =
                            "width:100%;height:100%;display:flex;flex-direction:column;";
                          paneContainersRef.current.set(paneId, div);
                          triggerUpdate();
                        }
                        const container =
                          paneContainersRef.current.get(paneId)!;
                        // Move the container into this slot if it isn't already
                        // there (e.g. after a split restructures the tree).
                        if (!slotEl.contains(container)) {
                          slotEl.replaceChildren(container);
                          triggerUpdate();
                        }
                      }}
                    />
                  )}
                  focusedId={
                    path === activeCwd && tab.id === activeTabId
                      ? focusedPaneId
                      : null
                  }
                  onFocusLeaf={
                    path === activeCwd && tab.id === activeTabId
                      ? setFocusedPaneId
                      : () => {}
                  }
                  leafCount={collectLeafIds(tab.paneTree).length}
                  onCloseLeaf={
                    isActivePathAndTab ? handleClosePaneById : undefined
                  }
                  onSplitLeaf={isActivePathAndTab ? handleSplitLeaf : undefined}
                />
                {/* Render TerminalInstances via portals into the stable per-pane
                    containers. The portal key (paneId) and container object are
                    both stable across splits, so React never unmounts an existing
                    TerminalInstance — the PTY process is preserved. */}
                {collectLeafIds(tab.paneTree).map((paneId) => {
                  const container = paneContainersRef.current.get(paneId);
                  if (!container) return null;
                  const isFocusedPane =
                    path === activeCwd &&
                    tab.id === state.activeTabId &&
                    paneId === focusedPaneId;
                  return createPortal(
                    <TerminalInstance
                      cwd={path}
                      active={isActivePathAndTab && isFocusedPane}
                      visible={isActivePathAndTab}
                      shell={shell}
                      initCommand={initCommand}
                      themeId={themeId}
                      onAgentComplete={
                        isActivePathAndTab ? onAgentComplete : undefined
                      }
                      onAgentNeedsAttention={
                        isActivePathAndTab ? onAgentNeedsAttention : undefined
                      }
                    />,
                    container,
                    paneId,
                  );
                })}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

interface TerminalInstanceProps {
  cwd: string;
  active: boolean;
  visible?: boolean;
  shell: string;
  initCommand: string | null;
  themeId?: string;
  onAgentComplete?: () => void;
  onAgentNeedsAttention?: () => void;
}

// Image MIME types accepted for drag-and-drop into the terminal.
const IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/svg+xml",
]);

// Map MIME type to file extension for saving dropped images.
function extensionForMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/bmp":
      return "bmp";
    case "image/svg+xml":
      return "svg";
    default:
      return "png";
  }
}

// Patterns that suggest the agent is waiting for user input.
const ATTENTION_PATTERNS = [
  /Do you want to proceed/i,
  /\(y\/n\)/i,
  /\[Y\/n\]/i,
  /\[yes\/no\]/i,
  /Press Enter/i,
  /waiting for.*input/i,
  /permission/i,
  /approve|deny/i,
];

// Cooldown (ms) between attention notifications to avoid spam.
const ATTENTION_COOLDOWN_MS = 10_000;

// Minimum bytes of PTY output to count as "agent activity" before we watch for idle.
const ACTIVITY_THRESHOLD_BYTES = 500;
// How long the terminal must be idle (ms) after activity before we fire onAgentComplete.
const IDLE_TIMEOUT_MS = 4000;

function TerminalInstance({
  cwd,
  active,
  visible = true,
  shell,
  initCommand,
  themeId,
  onAgentComplete,
  onAgentNeedsAttention,
}: TerminalInstanceProps) {
  const initialThemeIdRef = useRef(themeId || DEFAULT_THEME_ID);
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const ptyRef = useRef<IPty | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const activityBytesRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onAgentCompleteRef = useRef(onAgentComplete);
  onAgentCompleteRef.current = onAgentComplete;
  const onAgentNeedsAttentionRef = useRef(onAgentNeedsAttention);
  onAgentNeedsAttentionRef.current = onAgentNeedsAttention;
  const lastAttentionTimeRef = useRef(0);
  const [dragOver, setDragOver] = useState(false);

  // Handle HTML5 drag-and-drop so users can drop image files (screenshots)
  // directly onto the terminal. The image is saved to a temp file via the
  // backend and the resulting path is written to the PTY.
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      const imageFiles = files.filter((f) => IMAGE_MIME_TYPES.has(f.type));

      if (imageFiles.length === 0) {
        // Not images — let the Tauri native handler deal with regular files.
        return;
      }

      if (!ptyRef.current || !active) return;

      const paths: string[] = [];
      for (const file of imageFiles) {
        try {
          const buffer = await file.arrayBuffer();
          const data = Array.from(new Uint8Array(buffer));
          const ext = extensionForMime(file.type);
          const savedPath = await invoke<string>("save_dropped_image", {
            data,
            extension: ext,
          });
          paths.push(`"${savedPath}"`);
        } catch (err) {
          console.error("Failed to save dropped image:", err);
        }
      }

      if (paths.length > 0 && ptyRef.current) {
        ptyRef.current.write(paths.join(" "));
      }
    },
    [active],
  );

  // Create xterm + PTY on mount, destroy on unmount
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;

    const initialTheme = getThemeById(initialThemeIdRef.current);
    const term = new Terminal({
      fontFamily: "'JetBrains Mono', 'Menlo', 'Monaco', monospace",
      fontSize: 13,
      lineHeight: 1.35,
      theme: initialTheme.theme,
      cursorBlink: true,
      scrollback: 10000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(
      new WebLinksAddon((_event, url) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tauri = (window as any).__TAURI__;
          if (tauri?.shell?.open) {
            tauri.shell.open(url);
            return;
          }
        } catch {
          // ignore
        }
        window.open(url, "_blank", "noopener");
      }),
    );

    // Clear any leftover DOM from a previous terminal instance
    // (e.g. React StrictMode double-mount in dev).
    el.replaceChildren();

    term.open(el);

    // GPU-accelerated renderer; fall back silently if WebGL is unavailable.
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      // WebGL not available — xterm falls back to its canvas renderer.
    }

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Prevent WebKit/WKWebView from consuming Backspace/Delete as browser
    // navigation before xterm can handle them. Capture phase so we run first;
    // only fires when this terminal container holds focus so other inputs
    // (search boxes, etc.) are unaffected. xterm still processes the key
    // through its own listener — preventDefault() only blocks browser defaults.
    const preventBrowserNav = (e: KeyboardEvent) => {
      if (e.key === "Backspace" || e.key === "Delete") {
        if (el.contains(document.activeElement)) {
          e.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", preventBrowserNav, true);

    let initCommandTimer: ReturnType<typeof setTimeout> | null = null;

    // Wait one frame for layout, then start the PTY immediately using the
    // settings the app already prefetched during startup.
    const initFrame = requestAnimationFrame(() => {
      if (cancelled) return;

      try {
        fitAddon.fit();
      } catch {
        // fit can throw if dimensions are 0
      }

      try {
        const pty = spawn(shell, [], {
          name: "xterm-256color",
          cols: Math.max(term.cols, 1),
          rows: Math.max(term.rows, 1),
          cwd,
          env: {
            TERM: "xterm-256color",
            TERM_PROGRAM: "workroot",
            COLORTERM: "truecolor",
          },
        });

        // Check cancelled after spawn — cwd may have changed during startup.
        if (cancelled) {
          try {
            pty.kill();
          } catch {
            // ignore
          }
          return;
        }

        ptyRef.current = pty;

        pty.onData((data: Uint8Array) => {
          if (!termRef.current) return;
          term.write(data);

          // Check for patterns that suggest the agent needs user input.
          const text = new TextDecoder().decode(data);
          const now = Date.now();
          if (now - lastAttentionTimeRef.current >= ATTENTION_COOLDOWN_MS) {
            for (const pattern of ATTENTION_PATTERNS) {
              if (pattern.test(text)) {
                lastAttentionTimeRef.current = now;
                onAgentNeedsAttentionRef.current?.();
                break;
              }
            }
          }

          // Activity tracking for agent-complete detection.
          activityBytesRef.current += data.length;
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
          if (activityBytesRef.current >= ACTIVITY_THRESHOLD_BYTES) {
            idleTimerRef.current = setTimeout(() => {
              idleTimerRef.current = null;
              if (activityBytesRef.current >= ACTIVITY_THRESHOLD_BYTES) {
                onAgentCompleteRef.current?.();
              }
              activityBytesRef.current = 0;
            }, IDLE_TIMEOUT_MS);
          }
        });

        pty.onExit(() => {
          if (termRef.current) {
            term.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n");
          }
          if (idleTimerRef.current) {
            clearTimeout(idleTimerRef.current);
            idleTimerRef.current = null;
          }
          activityBytesRef.current = 0;
        });

        term.onData((data: string) => {
          if (!ptyRef.current) return;
          pty.write(data);
        });

        term.onResize((e) => {
          if (!ptyRef.current) return;
          try {
            pty.resize(e.cols, e.rows);
          } catch {
            // pty may already be dead
          }
        });

        if (initCommand) {
          initCommandTimer = setTimeout(() => {
            if (cancelled || !ptyRef.current) return;
            pty.write(initCommand + "\n");
          }, 400);
        }
      } catch (err) {
        if (!cancelled && termRef.current) {
          term.write(`\r\n\x1b[31mFailed to spawn shell: ${err}\x1b[0m\r\n`);
        }
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(initFrame);
      if (initCommandTimer) {
        clearTimeout(initCommandTimer);
      }
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      activityBytesRef.current = 0;
      window.removeEventListener("keydown", preventBrowserNav, true);
      try {
        ptyRef.current?.kill();
      } catch {
        // ignore
      }
      term.dispose();
      termRef.current = null;
      ptyRef.current = null;
      fitAddonRef.current = null;
    };
  }, [cwd, initCommand, shell]);

  // Only the currently visible terminal should react to native file drops.
  useEffect(() => {
    if (!visible || !active) return;

    let unlistenDrop: (() => void) | null = null;
    let disposed = false;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "over") {
          setDragOver(true);
          return;
        }

        if (event.payload.type === "leave") {
          setDragOver(false);
          return;
        }

        setDragOver(false);
        const paths = event.payload.paths;
        if (paths.length === 0 || !ptyRef.current) return;
        const pathStr = paths.map((p: string) => `"${p}"`).join(" ");
        ptyRef.current.write(pathStr);
      })
      .then((unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }
        unlistenDrop = unlisten;
      })
      .catch(() => {
        // Ignore webview drag listener registration failures and keep the
        // terminal usable with standard keyboard input.
      });

    return () => {
      disposed = true;
      setDragOver(false);
      unlistenDrop?.();
    };
  }, [active, visible]);

  // Update theme when themeId prop changes (without recreating the PTY).
  // Also reapply when the terminal becomes visible, because hidden terminals
  // (visibility: hidden) may not repaint after a theme options change.
  useEffect(() => {
    if (!termRef.current || !themeId) return;
    const t = getThemeById(themeId);
    termRef.current.options.theme = t.theme;
    // Force a full redraw so the new colours appear immediately — this is
    // especially important for inactive tabs whose WebGL canvas was not
    // repainted while hidden.
    termRef.current.refresh(0, termRef.current.rows - 1);
  }, [themeId, visible]);

  // Refit when becoming active or visible
  useEffect(() => {
    if (!visible || !fitAddonRef.current) return;
    const timer = setTimeout(() => {
      try {
        fitAddonRef.current?.fit();
      } catch {
        // ignore
      }
      if (active) {
        termRef.current?.focus();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [active, visible]);

  // Refit on window resize
  useEffect(() => {
    const handleResize = () => {
      if (!visible) return;
      try {
        fitAddonRef.current?.fit();
      } catch {
        // ignore
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [visible]);

  // Refit when container size changes (e.g. sidebar toggled)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !visible) return;
    const ro = new ResizeObserver((entries) => {
      // Skip refit when container is hidden (display:none gives zero size)
      const { width, height } = entries[0].contentRect;
      if (width === 0 || height === 0) return;
      try {
        fitAddonRef.current?.fit();
      } catch {
        // ignore
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [visible]);

  return (
    <div
      className={`terminal-container${dragOver ? " terminal-drag-over" : ""}`}
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    />
  );
}
