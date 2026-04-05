import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { invoke } from "@tauri-apps/api/core";
import { spawn } from "tauri-pty";
import type { IPty } from "tauri-pty";
import { getThemeById, DEFAULT_THEME_ID } from "../lib/terminalThemes";
import type { TerminalTheme } from "../lib/terminalThemes";
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
  themeId?: string;
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
  themeId,
}: TerminalPanelProps) {
  // All per-worktree tab states, keyed by cwd path.
  const [pathStates, setPathStates] = useState<Record<string, PathTabState>>(
    () => ({ [cwd]: makeInitialPathState(worktreeName, cwd) }),
  );
  // Which cwd is currently visible.
  const [activeCwd, setActiveCwd] = useState(cwd);

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
        return { ...s, tabs: next, activeTabId: newActiveTabId };
      });
    },
    [updateCurrentPath],
  );

  const activeTab = tabs.find((t) => t.id === activeTabId);

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
    (id: string) => updateCurrentPath((s) => ({ ...s, activeTabId: id })),
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
                  renderLeaf={(paneId, isFocused) => (
                    <TerminalInstance
                      key={paneId}
                      cwd={path}
                      active={isActivePathAndTab && isFocused}
                      visible={isActivePathAndTab}
                      themeId={themeId}
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
  themeId?: string;
}

async function loadTerminalSettings(): Promise<{
  shell: string;
  initCommand: string | null;
  theme: TerminalTheme;
}> {
  const defaultShell = navigator.platform.toLowerCase().includes("win")
    ? "powershell.exe"
    : "/bin/zsh";

  try {
    const [shellSetting, initSetting, themeSetting] = await Promise.all([
      invoke<string | null>("get_setting", { key: "terminal_shell" }),
      invoke<string | null>("get_setting", { key: "terminal_init_command" }),
      invoke<string | null>("get_setting", { key: "terminal_theme" }),
    ]);
    return {
      shell: shellSetting?.trim() || defaultShell,
      initCommand: initSetting?.trim() || null,
      theme: getThemeById(themeSetting?.trim() || DEFAULT_THEME_ID),
    };
  } catch {
    return {
      shell: defaultShell,
      initCommand: null,
      theme: getThemeById(DEFAULT_THEME_ID),
    };
  }
}

function TerminalInstance({
  cwd,
  active,
  visible = true,
  themeId,
}: TerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const ptyRef = useRef<IPty | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Create xterm + PTY on mount, destroy on unmount
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;

    const initialTheme = getThemeById(themeId || DEFAULT_THEME_ID);
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

    // Load settings, fit, spawn
    const initTimer = setTimeout(async () => {
      if (cancelled) return;

      try {
        fitAddon.fit();
      } catch {
        // fit can throw if dimensions are 0
      }

      const settings = await loadTerminalSettings();

      if (cancelled) return;

      // Apply the saved theme (may differ from initial)
      term.options.theme = settings.theme.theme;

      try {
        const pty = spawn(settings.shell, [], {
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
        ptyRef.current = pty;

        pty.onData((data: Uint8Array) => {
          term.write(data);
        });

        pty.onExit(() => {
          term.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n");
        });

        term.onData((data: string) => {
          pty.write(data);
        });

        term.onResize((e) => {
          try {
            pty.resize(e.cols, e.rows);
          } catch {
            // pty may already be dead
          }
        });

        // Run init commands after shell is ready
        if (settings.initCommand) {
          const cmd = settings.initCommand;
          setTimeout(() => {
            pty.write(cmd + "\n");
          }, 400);
        }
      } catch (err) {
        term.write(`\r\n\x1b[31mFailed to spawn shell: ${err}\x1b[0m\r\n`);
      }
    }, 100);

    return () => {
      cancelled = true;
      clearTimeout(initTimer);
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
  }, [cwd, themeId]);

  // Update theme when themeId prop changes
  useEffect(() => {
    if (!termRef.current || !themeId) return;
    const t = getThemeById(themeId);
    termRef.current.options.theme = t.theme;
  }, [themeId]);

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

  return <div className="terminal-container" ref={containerRef} />;
}
