import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { spawn } from "tauri-pty";
import type { IPty } from "tauri-pty";
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

export function TerminalPanel({ cwd, worktreeName }: TerminalPanelProps) {
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

  const renderLeaf = useCallback(
    (paneId: string, isFocused: boolean) => (
      <TerminalInstance
        key={paneId}
        cwd={cwd}
        active={activeTab?.id === activeTabId && isFocused}
        visible={activeTab?.id === activeTabId}
      />
    ),
    [cwd, activeTab, activeTabId],
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
            {tab.id === activeTabId && activeTab ? (
              <SplitPane
                node={activeTab.paneTree}
                onUpdateNode={updatePaneTree}
                renderLeaf={renderLeaf}
                focusedId={focusedPaneId}
                onFocusLeaf={setFocusedPaneId}
              />
            ) : null}
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
}

async function loadTerminalSettings(): Promise<{
  shell: string;
  initCommand: string | null;
}> {
  const defaultShell = navigator.platform.toLowerCase().includes("win")
    ? "powershell.exe"
    : "/bin/zsh";

  try {
    const [shellSetting, initSetting] = await Promise.all([
      invoke<string | null>("get_setting", { key: "terminal_shell" }),
      invoke<string | null>("get_setting", { key: "terminal_init_command" }),
    ]);
    return {
      shell: shellSetting?.trim() || defaultShell,
      initCommand: initSetting?.trim() || null,
    };
  } catch {
    return { shell: defaultShell, initCommand: null };
  }
}

function TerminalInstance({
  cwd,
  active,
  visible = true,
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

    const term = new Terminal({
      fontFamily: "'JetBrains Mono', 'Menlo', 'Monaco', monospace",
      fontSize: 13,
      lineHeight: 1.35,
      theme: {
        background: "#0c0c0e",
        foreground: "#ededef",
        cursor: "#10b981",
        cursorAccent: "#0c0c0e",
        selectionBackground: "rgba(16, 185, 129, 0.2)",
        selectionForeground: "#ededef",
        black: "#1b1b1f",
        red: "#ef4444",
        green: "#10b981",
        yellow: "#f59e0b",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#ededef",
        brightBlack: "#5c5c66",
        brightRed: "#f87171",
        brightGreen: "#34d399",
        brightYellow: "#fbbf24",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#22d3ee",
        brightWhite: "#fafafa",
      },
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

      try {
        const pty = spawn(settings.shell, [], {
          cols: Math.max(term.cols, 1),
          rows: Math.max(term.rows, 1),
          cwd,
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
  }, [cwd]);

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
