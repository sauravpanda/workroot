import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
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
import type { PaneNode } from "./TerminalSplitPane";

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

export function TerminalPanel({
  cwd,
  worktreeName,
  themeId,
}: TerminalPanelProps) {
  const [tabs, setTabs] = useState<TerminalTab[]>(() => [
    makeTab(worktreeName, cwd),
  ]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);
  const [focusedPaneId, setFocusedPaneId] = useState<string | null>(
    tabs[0].paneTree.type === "leaf" ? tabs[0].paneTree.id : null,
  );

  // When worktree changes, reset to a single tab for the new cwd
  const prevCwd = useRef(cwd);
  useEffect(() => {
    if (cwd !== prevCwd.current) {
      prevCwd.current = cwd;
      const newTab = makeTab(worktreeName, cwd);
      setTabs([newTab]);
      setActiveTabId(newTab.id);
      setFocusedPaneId(
        newTab.paneTree.type === "leaf" ? newTab.paneTree.id : null,
      );
    }
  }, [cwd, worktreeName]);

  const addTab = useCallback(() => {
    const newTab = makeTab(`Shell`, cwd);
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setFocusedPaneId(
      newTab.paneTree.type === "leaf" ? newTab.paneTree.id : null,
    );
  }, [cwd]);

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== id);
        if (next.length === 0) return prev;
        if (activeTabId === id) {
          const idx = prev.findIndex((t) => t.id === id);
          const newActive = next[Math.min(idx, next.length - 1)];
          setActiveTabId(newActive.id);
        }
        return next;
      });
    },
    [activeTabId],
  );

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const updatePaneTree = useCallback(
    (newTree: PaneNode) => {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId ? { ...t, paneTree: newTree } : t,
        ),
      );
    },
    [activeTabId],
  );

  // Split the focused pane
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
  }, [focusedPaneId, activeTab, updatePaneTree]);

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
  }, [focusedPaneId, activeTab, updatePaneTree]);

  // Close the focused pane (remove from tree)
  const handleClosePane = useCallback(() => {
    if (!focusedPaneId || !activeTab) return;
    const leafIds = collectLeafIds(activeTab.paneTree);
    if (leafIds.length <= 1) return; // Don't close the last pane
    const newTree = removeLeaf(activeTab.paneTree, focusedPaneId);
    if (newTree) {
      updatePaneTree(newTree);
      const remaining = collectLeafIds(newTree);
      setFocusedPaneId(remaining[0] ?? null);
    }
  }, [focusedPaneId, activeTab, updatePaneTree]);

  useSplitPaneShortcuts(handleSplitH, handleSplitV, handleClosePane);

  // Per-tab renderLeaf so inactive tabs can stay mounted (visibility:hidden)
  // without being confused about active/visible state.
  const makeRenderLeaf = useCallback(
    (tabId: string) => (paneId: string, isFocused: boolean) => (
      <TerminalInstance
        key={paneId}
        cwd={cwd}
        active={tabId === activeTabId && isFocused}
        visible={tabId === activeTabId}
        themeId={themeId}
      />
    ),
    [cwd, activeTabId, themeId],
  );

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
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`terminal-instance ${tab.id === activeTabId ? "terminal-instance-active" : ""}`}
          >
            <SplitPane
              node={tab.paneTree}
              onUpdateNode={
                tab.id === activeTabId
                  ? updatePaneTree
                  : (newTree) =>
                      setTabs((prev) =>
                        prev.map((t) =>
                          t.id === tab.id ? { ...t, paneTree: newTree } : t,
                        ),
                      )
              }
              renderLeaf={makeRenderLeaf(tab.id)}
              focusedId={tab.id === activeTabId ? focusedPaneId : null}
              onFocusLeaf={tab.id === activeTabId ? setFocusedPaneId : () => {}}
            />
          </div>
        ))}
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
    term.open(el);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

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
          cols: Math.max(term.cols, 1),
          rows: Math.max(term.rows, 1),
          cwd,
          env: { TERM: "xterm-256color" },
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
