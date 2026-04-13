import {
  lazy,
  Suspense,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import { ErrorProvider } from "./contexts/ErrorContext";
import { ErrorBoundary, PanelBoundary } from "./components/ErrorBoundary";
import { GlobalErrorToast } from "./components/GlobalErrorToast";
import { invoke } from "@tauri-apps/api/core";
import { MainLayout } from "./layouts/MainLayout";
import { QuickActions } from "./components/QuickActions";
import { StatusBar } from "./components/StatusBar";
import { PanelHost } from "./components/PanelHost";
import { useUiStore } from "./stores/uiStore";
import {
  useCommandRegistry,
  useGlobalShortcuts,
} from "./hooks/useCommandRegistry";
import type { Command } from "./hooks/useCommandRegistry";
import { usePanels } from "./hooks/usePanels";
import { useTerminalSettings } from "./hooks/useTerminalSettings";
import { useAppTheme } from "./hooks/useAppTheme";
import { useShellData } from "./hooks/useShellData";

/* eslint-disable @typescript-eslint/no-explicit-any */
const namedLazy = <K extends string>(
  factory: () => Promise<Record<K, React.ComponentType<any>>>,
  name: K,
): React.LazyExoticComponent<React.ComponentType<any>> =>
  lazy(() => factory().then((m) => ({ default: m[name] })));
/* eslint-enable @typescript-eslint/no-explicit-any */

const loadTerminalPanel = () => import("./components/TerminalPanel");
const TerminalPanel = namedLazy(loadTerminalPanel, "TerminalPanel");
const ContentToolbar = namedLazy(
  () => import("./components/ContentToolbar"),
  "ContentToolbar",
);
const SettingsTab = namedLazy(
  () => import("./components/SettingsTab"),
  "SettingsTab",
);
const WorkspaceGrid = namedLazy(
  () => import("./components/WorkspaceGrid"),
  "WorkspaceGrid",
);

interface WorktreeInfo {
  id: number;
  project_id: number;
  branch_name: string;
  path: string;
  status: string;
}

interface SidebarActions {
  openSearch: () => void;
  openAiChat: () => void;
  openNotifications: () => void;
  openSettings: () => void;
}

function AppContent({
  sidebarActionsRef,
}: {
  sidebarActionsRef: React.MutableRefObject<SidebarActions>;
}) {
  const {
    selectedProjectId,
    selectedWorktreeId,
    selectedWorktreePath,
    selectedWorktreeName,
    showSettings,
    setShowSettings,
    setSelectedProjectId,
    setSelectedWorktreeId,
    setSelectedWorktreePath,
    setSelectedWorktreeName,
    markAgentDone,
    markAgentNeedsAttention,
  } = useUiStore();

  const [isGitHubConnected, setIsGitHubConnected] = useState(false);
  useEffect(() => {
    const check = () =>
      invoke<boolean>("github_check_auth")
        .then(setIsGitHubConnected)
        .catch((err: unknown) => {
          const msg = String(err).toLowerCase();
          if (
            msg.includes("network") ||
            msg.includes("fetch") ||
            msg.includes("timeout")
          ) {
            return;
          }
          setIsGitHubConnected(false);
        });
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, []);

  const { panels, openPanel, closePanel, togglePanel, closePanels } =
    usePanels();
  const [blameFilePath, setBlameFilePath] = useState("");
  const [contentTab, setContentTab] = useState("terminal");
  const [agentDoneToast, setAgentDoneToast] = useState<string | null>(null);

  // Request notification permission once on mount.
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Preload terminal panel eagerly
  useEffect(() => {
    const preloadTimer = window.setTimeout(() => {
      void loadTerminalPanel();
    }, 0);
    return () => clearTimeout(preloadTimer);
  }, []);

  // Stable refs so callbacks don't need to be in dependency arrays.
  const selectedWorktreeIdRef = useRef(selectedWorktreeId);
  const selectedWorktreeNameRef = useRef(selectedWorktreeName);
  selectedWorktreeIdRef.current = selectedWorktreeId;
  selectedWorktreeNameRef.current = selectedWorktreeName;

  // Remember the last valid worktree path/name so TerminalPanel stays
  // mounted (and PTY sessions survive) when navigating to Home or Settings.
  const lastWorktreePathRef = useRef(selectedWorktreePath);
  const lastWorktreeNameRef = useRef(selectedWorktreeName);
  if (selectedWorktreePath) {
    lastWorktreePathRef.current = selectedWorktreePath;
    lastWorktreeNameRef.current = selectedWorktreeName;
  }

  const openPanelRef = useRef(openPanel);
  openPanelRef.current = openPanel;

  const contentTabRef = useRef(contentTab);
  contentTabRef.current = contentTab;

  const handleAgentComplete = useCallback(() => {
    const id = selectedWorktreeIdRef.current;
    const name = selectedWorktreeNameRef.current ?? "Terminal";
    if (id !== null) markAgentDone(id);
    if (!document.hasFocus()) {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Agent completed", {
          body: `${name} is ready for review`,
          silent: false,
        });
      }
    } else if (contentTabRef.current !== "terminal") {
      setAgentDoneToast(name);
    }
  }, [markAgentDone]);

  const handleAgentNeedsAttention = useCallback(() => {
    const id = selectedWorktreeIdRef.current;
    if (id !== null) markAgentNeedsAttention(id);
    if (!document.hasFocus()) {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Agent needs attention", {
          body: `${selectedWorktreeNameRef.current ?? "Terminal"} is waiting for input`,
          silent: false,
        });
      }
    }
  }, [markAgentNeedsAttention]);

  // Reset content tab and close tab-launched panels when switching worktrees
  useEffect(() => {
    setContentTab("terminal");
    closePanels([
      "gitDiff",
      "createPr",
      "securityAudit",
      "testRunnerPanel",
      "docker",
    ]);
  }, [selectedWorktreeId, closePanels]);

  const { register, execute, search } = useCommandRegistry();
  const {
    terminalShell,
    terminalThemeId,
    terminalInitCommand,
    setTerminalThemeId,
  } = useTerminalSettings();
  const {
    appThemeId,
    densityMode,
    setAppThemeId,
    applyAppTheme,
    applyDensityMode,
  } = useAppTheme();
  const { allProjects, allWorktrees, selectedProjectName, selectWorktree } =
    useShellData(openPanel);

  // Build commands from current app state
  const commands: Command[] = useMemo(() => {
    const cmds: Command[] = [
      {
        id: "nav:home",
        label: "Go Home",
        category: "Navigation",
        icon: "\u2302",
        action: () => {
          setShowSettings(false);
          setSelectedWorktreeId(null);
          setSelectedWorktreePath(null);
          setSelectedWorktreeName(null);
        },
      },
      {
        id: "nav:settings",
        label: "Open Settings",
        category: "Navigation",
        shortcut: "\u2318,",
        icon: "\u2699",
        action: () => {
          setShowSettings(true);
          setSelectedWorktreeId(null);
          setSelectedWorktreePath(null);
          setSelectedWorktreeName(null);
        },
      },
      {
        id: "nav:close-settings",
        label: "Close Settings",
        category: "Navigation",
        icon: "\u2717",
        enabled: () => showSettings,
        action: () => setShowSettings(false),
      },
      {
        id: "nav:close-terminal",
        label: "Close Terminal",
        category: "Navigation",
        icon: "\u2717",
        enabled: () => selectedWorktreePath !== null,
        action: () => {
          setSelectedWorktreeId(null);
          setSelectedWorktreePath(null);
          setSelectedWorktreeName(null);
        },
      },
      {
        id: "bookmarks:open",
        label: "Command Bookmarks",
        category: "Tools",
        shortcut: "\u2318B",
        icon: "\u2606",
        action: () => openPanel("bookmarks"),
      },
      {
        id: "theme:app",
        label: "App Theme",
        category: "Appearance",
        icon: "\u25D1",
        action: () => openPanel("appThemePicker"),
      },
      {
        id: "theme:editor",
        label: "Theme Editor",
        category: "Appearance",
        icon: "\uD83C\uDFA8",
        action: () => openPanel("themeEditor"),
      },
      {
        id: "theme:custom-css",
        label: "Custom CSS Editor",
        category: "Appearance",
        icon: "\u270E",
        action: () => openPanel("cssEditor"),
      },
      {
        id: "density:picker",
        label: "Layout Density",
        category: "Appearance",
        icon: "\u25A4",
        action: () => openPanel("densityPicker"),
      },
      {
        id: "theme:terminal",
        label: "Terminal Theme",
        category: "Appearance",
        shortcut: "\u2318T",
        icon: "\u25D0",
        action: () => openPanel("themeSelector"),
      },
      {
        id: "shortcuts:open",
        label: "Keyboard Shortcuts",
        category: "Help",
        shortcut: "\u2318?",
        icon: "\u2328",
        action: () => openPanel("shortcuts"),
      },
      {
        id: "tasks:open",
        label: "Task Runner",
        category: "Tools",
        shortcut: "\u2318R",
        icon: "\u25B6",
        enabled: () => selectedWorktreePath !== null,
        action: () => openPanel("taskRunner"),
      },
      // Git tools
      {
        id: "git:stash",
        label: "Stash Manager",
        category: "Git",
        icon: "\u2193",
        enabled: () => selectedWorktreeId !== null,
        action: () => openPanel("stashManager"),
      },
      {
        id: "git:checkpoints",
        label: "Checkpoints",
        category: "Git",
        icon: "\u23F1",
        enabled: () => selectedWorktreeId !== null,
        action: () => openPanel("checkpointManager"),
      },
      {
        id: "git:blame",
        label: "Blame View",
        category: "Git",
        icon: "\u2261",
        enabled: () => selectedWorktreeId !== null,
        action: () => {
          setBlameFilePath("");
          openPanel("blameView");
        },
      },
      {
        id: "git:compare",
        label: "Branch Compare",
        category: "Git",
        icon: "\u21C4",
        enabled: () => selectedWorktreeId !== null,
        action: () => openPanel("branchCompare"),
      },
      {
        id: "git:hooks",
        label: "Git Hooks",
        category: "Git",
        icon: "\u2693",
        enabled: () => selectedWorktreeId !== null,
        action: () => openPanel("gitHooks"),
      },
      {
        id: "git:conflicts",
        label: "Conflict Resolver",
        category: "Git",
        icon: "!",
        enabled: () => selectedWorktreeId !== null,
        action: () => openPanel("conflictResolver"),
      },
      // Security tools
      {
        id: "security:audit",
        label: "Security Audit",
        category: "Security",
        icon: "\u26A0",
        enabled: () => selectedWorktreePath !== null,
        action: () => openPanel("securityAudit"),
      },
      {
        id: "security:secrets",
        label: "Secret Scanner",
        category: "Security",
        icon: "\uD83D\uDD12",
        enabled: () => selectedWorktreePath !== null,
        action: () => openPanel("secretScanner"),
      },
      {
        id: "security:licenses",
        label: "License Report",
        category: "Security",
        icon: "\u00A9",
        enabled: () => selectedWorktreePath !== null,
        action: () => openPanel("licenseReport"),
      },
      {
        id: "security:headers",
        label: "Security Headers",
        category: "Security",
        icon: "\u26D4",
        action: () => openPanel("securityHeaders"),
      },
      // Testing tools
      {
        id: "testing:runner",
        label: "Test Runner",
        category: "Testing",
        icon: "\u2714",
        enabled: () => selectedWorktreePath !== null,
        action: () => openPanel("testRunnerPanel"),
      },
      {
        id: "testing:coverage",
        label: "Coverage Report",
        category: "Testing",
        icon: "\u25A3",
        enabled: () => selectedWorktreePath !== null,
        action: () => openPanel("coverageReport"),
      },
      {
        id: "testing:benchmark",
        label: "Benchmark Dashboard",
        category: "Testing",
        icon: "\u23F1",
        enabled: () => selectedWorktreePath !== null,
        action: () => openPanel("benchmark"),
      },
      // Infrastructure
      {
        id: "infra:docker",
        label: "Docker",
        category: "Infrastructure",
        icon: "\uD83D\uDC33",
        enabled: () => selectedWorktreePath !== null,
        action: () => openPanel("docker"),
      },
      {
        id: "infra:docker-images",
        label: "Docker Images",
        category: "Infrastructure",
        icon: "\uD83D\uDCE6",
        action: () => openPanel("dockerImages"),
      },
      {
        id: "infra:container-monitor",
        label: "Container Monitor",
        category: "Infrastructure",
        icon: "\uD83D\uDCCA",
        action: () => openPanel("containerMonitor"),
      },
      {
        id: "testing:flaky",
        label: "Flaky Tests",
        category: "Testing",
        icon: "\u26A0",
        enabled: () => selectedWorktreePath !== null,
        action: () => openPanel("flakyTests"),
      },
      {
        id: "collab:notifications",
        label: "Notifications",
        category: "Collaboration",
        shortcut: "\u2318N",
        icon: "\uD83D\uDD14",
        action: () => openPanel("notifications"),
      },
      {
        id: "collab:activity-timeline",
        label: "Activity Timeline",
        category: "Collaboration",
        icon: "\uD83D\uDCC5",
        action: () => openPanel("activityTimeline"),
      },
      {
        id: "tools:plugins",
        label: "Plugins",
        category: "Tools",
        icon: "\uD83E\uDDE9",
        action: () => openPanel("pluginManager"),
      },
      {
        id: "tools:backup",
        label: "Backup & Restore",
        category: "Tools",
        icon: "\uD83D\uDCBE",
        action: () => openPanel("backupRestore"),
      },
      {
        id: "tools:analytics",
        label: "Analytics",
        category: "Tools",
        icon: "\uD83D\uDCC8",
        enabled: () => selectedWorktreePath !== null,
        action: () => openPanel("analyticsDashboard"),
      },
      {
        id: "ai:chat",
        label: "AI Chat",
        category: "AI",
        shortcut: "\u2318J",
        icon: "\u2728",
        action: () => togglePanel("aiChat"),
      },
      {
        id: "search:unified",
        label: "Search Everything",
        category: "Navigation",
        shortcut: "\u2318P",
        icon: "\u2315",
        action: () => openPanel("unifiedSearch"),
      },
      {
        id: "nav:settings-page",
        label: "All Settings",
        category: "Navigation",
        icon: "\u2699",
        action: () => openPanel("settingsPage"),
      },
      {
        id: "terminal:recording",
        label: "Terminal Recording",
        category: "Tools",
        icon: "\u25CF",
        enabled: () => selectedWorktreeId !== null,
        action: () => openPanel("terminalRecording"),
      },
      {
        id: "metrics:dora",
        label: "DORA Metrics",
        category: "Metrics",
        icon: "\u2261",
        enabled: () => selectedProjectId !== null,
        action: () => openPanel("doraMetrics"),
      },
      {
        id: "tools:webhooks",
        label: "Webhook Events",
        category: "Tools",
        icon: "\u21AF",
        action: () => openPanel("webhookEvents"),
      },
      {
        id: "tools:ssh",
        label: "SSH Connections",
        category: "Tools",
        icon: "\u2192",
        action: () => openPanel("sshManager"),
      },
      {
        id: "git:analytics",
        label: "Git Analytics",
        category: "Git",
        icon: "\u2593",
        enabled: () => selectedWorktreeId !== null,
        action: () => openPanel("gitAnalytics"),
      },
      {
        id: "tools:snippets",
        label: "Code Snippets",
        category: "Tools",
        icon: "\u2702",
        action: () => openPanel("snippetManager"),
      },
      {
        id: "env:diff",
        label: "Compare Env Profiles",
        category: "Environment",
        icon: "\u2194",
        enabled: () => selectedProjectId !== null,
        action: () => openPanel("envDiff"),
      },
      {
        id: "tools:performance",
        label: "App Performance",
        category: "Tools",
        icon: "\u2261",
        action: () => openPanel("appPerformance"),
      },
      {
        id: "nav:files",
        label: "File Explorer",
        category: "Navigation",
        shortcut: "\u2318E",
        icon: "\u2630",
        enabled: () => selectedWorktreePath !== null,
        action: () => openPanel("fileExplorer"),
      },
      {
        id: "nav:project-overview",
        label: "Project Overview",
        category: "Navigation",
        icon: "\u25A3",
        enabled: () => selectedProjectId !== null,
        action: () => openPanel("projectOverview"),
      },
      {
        id: "perf:vitals",
        label: "Web Vitals",
        category: "Performance",
        icon: "\u26A1",
        action: () => openPanel("webVitals"),
      },
      {
        id: "tools:plugin-runtime",
        label: "Plugin Runtime",
        category: "Tools",
        icon: "\u25B7",
        enabled: () => selectedWorktreePath !== null,
        action: () => openPanel("pluginRuntime"),
      },
      {
        id: "tools:deps",
        label: "Dependency Analyzer",
        category: "Tools",
        icon: "\u2B21",
        enabled: () => selectedWorktreePath !== null,
        action: () => openPanel("depAnalyzer"),
      },
      {
        id: "network:ports",
        label: "Port Scanner",
        category: "Network",
        icon: "\u2299",
        action: () => openPanel("portScanner"),
      },
      {
        id: "tools:dir-stats",
        label: "Directory Stats",
        category: "Tools",
        icon: "\u25A7",
        enabled: () => selectedWorktreePath !== null,
        action: () => openPanel("dirStats"),
      },
      {
        id: "git:tags",
        label: "Tag Manager",
        category: "Git",
        icon: "\u2691",
        enabled: () => selectedWorktreeId !== null,
        action: () => openPanel("tagManager"),
      },
      {
        id: "git:log",
        label: "Git Log",
        category: "Git",
        shortcut: "\u2318L",
        icon: "\u2630",
        enabled: () => selectedWorktreeId !== null,
        action: () => openPanel("gitLog"),
      },
      {
        id: "tools:workspaces",
        label: "Workspaces",
        category: "Tools",
        icon: "\u25A1",
        action: () => openPanel("workspaceManager"),
      },
      {
        id: "tools:scheduler",
        label: "Task Scheduler",
        category: "Tools",
        icon: "\u23F0",
        action: () => openPanel("taskScheduler"),
      },
      {
        id: "tools:clipboard",
        label: "Clipboard History",
        category: "Tools",
        icon: "\u2398",
        action: () => openPanel("clipboardHistory"),
      },
      {
        id: "tools:todos",
        label: "Todos",
        category: "Tools",
        icon: "\u2611",
        action: () => openPanel("todoPanel"),
      },
      {
        id: "nav:quick-switcher",
        label: "Quick Switcher",
        category: "Navigation",
        icon: "\u21C4",
        shortcut: "Cmd+Shift+O",
        action: () => openPanel("quickSwitcher"),
      },
      {
        id: "ai:error-diagnosis",
        label: "Error Diagnosis",
        category: "AI",
        icon: "\u26A0",
        shortcut: "Cmd+Shift+D",
        action: () => openPanel("errorDiagnosis"),
      },
      {
        id: "view:morning-briefing",
        label: "Morning Briefing",
        category: "View",
        icon: "\u2600",
        action: () => openPanel("morningBriefing"),
      },
      {
        id: "view:network-traffic",
        label: "Network Traffic",
        category: "View",
        icon: "\u21C6",
        action: () => openPanel("networkTab"),
      },
      {
        id: "git:pr-status",
        label: "PR Status",
        category: "Git",
        icon: "\u2117",
        action: () => openPanel("prStatus"),
      },
      {
        id: "git:diff-view",
        label: "Git Changes",
        category: "Git",
        icon: "\u00B1",
        action: () => openPanel("gitDiff"),
      },
      {
        id: "git:create-pr",
        label: "Create Pull Request",
        category: "Git",
        icon: "\u2197",
        action: () => openPanel("createPr"),
      },
      {
        id: "view:memory-notes",
        label: "Memory Notes",
        category: "View",
        icon: "\u2709",
        action: () => openPanel("memoryTab"),
      },
      {
        id: "view:shell-history",
        label: "Shell History",
        category: "View",
        icon: "\u2328",
        action: () => openPanel("shellHistory"),
      },
      {
        id: "view:dead-ends",
        label: "Dead Ends Log",
        category: "View",
        icon: "\u26D4",
        action: () => openPanel("deadEnds"),
      },
      {
        id: "view:db-schema",
        label: "Database Schema",
        category: "View",
        icon: "\u2637",
        action: () => openPanel("dbSchema"),
      },
      {
        id: "help:onboarding",
        label: "Setup Wizard",
        category: "Help",
        icon: "\u2699",
        action: () => openPanel("onboarding"),
      },
      {
        id: "view:browser-events",
        label: "Browser Events",
        category: "View",
        icon: "\u2301",
        action: () => openPanel("browserEvents"),
      },
      {
        id: "view:db-explorer",
        label: "Database Explorer",
        category: "View",
        icon: "\u2338",
        action: () => openPanel("dbExplorer"),
      },
      {
        id: "ai:multi-agent-pipeline",
        label: "Multi-Agent Pipeline",
        category: "AI",
        icon: "\u25B6",
        enabled: () => selectedWorktreeId !== null,
        action: () => openPanel("multiAgentPipeline"),
      },
      {
        id: "ai:model-comparison",
        label: "Model Comparison",
        category: "AI",
        icon: "\u21C6",
        enabled: () => selectedWorktreeId !== null,
        action: () => openPanel("modelComparison"),
      },
    ];

    // Add project switch commands
    for (const project of allProjects) {
      cmds.push({
        id: `project:${project.id}`,
        label: project.name,
        category: "Switch Project",
        icon: "\u2630",
        action: () => {
          setSelectedProjectId(project.id);
          setShowSettings(false);
        },
      });
    }

    // Add worktree switch commands
    for (const wt of allWorktrees) {
      cmds.push({
        id: `worktree:${wt.id}`,
        label: `${wt.branch_name}`,
        category: `Open Terminal \u2014 ${wt.projectName}`,
        icon: "\u9741",
        action: () => selectWorktree(wt),
      });
    }

    return cmds;
  }, [
    showSettings,
    selectedProjectId,
    selectedWorktreePath,
    selectedWorktreeId,
    allProjects,
    allWorktrees,
    selectWorktree,
    setShowSettings,
    setSelectedProjectId,
    setSelectedWorktreeId,
    setSelectedWorktreePath,
    setSelectedWorktreeName,
    openPanel,
    togglePanel,
  ]);

  // Register commands whenever they change
  useEffect(() => register(commands), [commands, register]);

  // Global keyboard shortcuts
  const shortcuts = useMemo(
    () => [
      { key: "k", meta: true, action: () => togglePanel("palette") },
      { key: "b", meta: true, action: () => togglePanel("bookmarks") },
      {
        key: "t",
        meta: true,
        action: () => togglePanel("themeSelector"),
      },
      {
        key: "/",
        meta: true,
        shift: true,
        action: () => togglePanel("shortcuts"),
      },
      {
        key: ",",
        meta: true,
        action: () => {
          setShowSettings(true);
          setSelectedWorktreeId(null);
          setSelectedWorktreePath(null);
          setSelectedWorktreeName(null);
        },
      },
      {
        key: "n",
        meta: true,
        action: () => togglePanel("notifications"),
      },
      {
        key: "j",
        meta: true,
        action: () => togglePanel("aiChat"),
      },
      {
        key: "p",
        meta: true,
        action: () => togglePanel("unifiedSearch"),
      },
      {
        key: "e",
        meta: true,
        action: () => togglePanel("fileExplorer"),
      },
      {
        key: "l",
        meta: true,
        action: () => togglePanel("gitLog"),
      },
      {
        key: "o",
        meta: true,
        shift: true,
        action: () => togglePanel("quickSwitcher"),
      },
      {
        key: "d",
        meta: true,
        shift: true,
        action: () => togglePanel("errorDiagnosis"),
      },
    ],
    [
      setShowSettings,
      setSelectedWorktreeId,
      setSelectedWorktreePath,
      setSelectedWorktreeName,
      togglePanel,
    ],
  );
  useGlobalShortcuts(shortcuts);

  const handleClosePalette = useCallback(
    () => closePanel("palette"),
    [closePanel],
  );
  const handleCloseBookmarks = useCallback(
    () => closePanel("bookmarks"),
    [closePanel],
  );

  /* Expose sidebar-toolbar actions to parent via ref */
  sidebarActionsRef.current = {
    openSearch: () => openPanel("unifiedSearch"),
    openAiChat: () => openPanel("aiChat"),
    openNotifications: () => openPanel("notifications"),
    openSettings: () => {
      openPanel("settingsPage");
    },
  };

  // Cmd+Escape returns to the workspace grid when viewing a terminal.
  useEffect(() => {
    if (!selectedWorktreePath) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (!e.metaKey) return;
      if (e.defaultPrevented) return;
      if (showSettings) return;
      if (panels.size > 0) return;
      e.preventDefault();
      e.stopPropagation();
      setSelectedWorktreeId(null);
      setSelectedWorktreePath(null);
      setSelectedWorktreeName(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [
    selectedWorktreePath,
    showSettings,
    panels,
    setSelectedWorktreeId,
    setSelectedWorktreePath,
    setSelectedWorktreeName,
  ]);

  const handleContentTabChange = useCallback(
    (tab: string) => {
      setContentTab(tab);
      switch (tab) {
        case "changes":
          openPanel("gitDiff");
          break;
        case "pr":
          openPanel("createPr");
          break;
      }
    },
    [openPanel],
  );

  return (
    <Suspense fallback={null}>
      {showSettings ? (
        <PanelBoundary name="Settings">
          <SettingsTab />
        </PanelBoundary>
      ) : !selectedWorktreePath ? (
        <PanelBoundary name="WorkspaceGrid">
          <WorkspaceGrid
            projects={allProjects}
            worktrees={allWorktrees}
            onSelectWorktree={(wt: WorktreeInfo) => {
              setSelectedProjectId(wt.project_id);
              setSelectedWorktreeId(wt.id);
              setSelectedWorktreePath(wt.path);
              setSelectedWorktreeName(wt.branch_name);
              setShowSettings(false);
            }}
            onNewWorktree={(projectId: number) => {
              setSelectedProjectId(projectId);
            }}
            shell={terminalShell}
            themeId={terminalThemeId}
          />
        </PanelBoundary>
      ) : null}
      {/* TerminalPanel is rendered outside the ternary so it stays mounted
          (and PTY sessions stay alive) when the user navigates to Home or
          Settings. We hide it via display:none when it isn't the active view. */}
      {lastWorktreePathRef.current && (
        <div
          style={{
            display: !showSettings && selectedWorktreePath ? "flex" : "none",
            width: "100%",
            height: "100%",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
          }}
        >
          <ContentToolbar
            activeTab={contentTab}
            onTabChange={handleContentTabChange}
            worktreeName={
              selectedWorktreeName ?? lastWorktreeNameRef.current ?? "Shell"
            }
            projectName={selectedProjectName ?? undefined}
          />
          <PanelBoundary name="Terminal">
            <TerminalPanel
              cwd={lastWorktreePathRef.current}
              worktreeName={
                selectedWorktreeName ?? lastWorktreeNameRef.current ?? "Shell"
              }
              shell={terminalShell}
              initCommand={terminalInitCommand}
              themeId={terminalThemeId}
              onAgentComplete={handleAgentComplete}
              onAgentNeedsAttention={handleAgentNeedsAttention}
            />
          </PanelBoundary>
        </div>
      )}
      <PanelBoundary name="StatusBar">
        <StatusBar
          projectName={selectedProjectName}
          branchName={selectedWorktreeName}
          isGitHubConnected={isGitHubConnected}
        />
      </PanelBoundary>
      <PanelHost
        panels={panels}
        openPanel={openPanel}
        closePanel={closePanel}
        selectedProjectId={selectedProjectId}
        selectedWorktreeId={selectedWorktreeId}
        selectedWorktreePath={selectedWorktreePath}
        selectedWorktreeName={selectedWorktreeName}
        blameFilePath={blameFilePath}
        setBlameFilePath={setBlameFilePath}
        appThemeId={appThemeId}
        setAppThemeId={setAppThemeId}
        onApplyAppTheme={applyAppTheme}
        terminalThemeId={terminalThemeId}
        setTerminalThemeId={setTerminalThemeId}
        densityMode={densityMode}
        onApplyDensityMode={applyDensityMode}
        execute={execute}
        search={search}
        contentTab={contentTab}
        setContentTab={setContentTab}
        onClosePalette={handleClosePalette}
        onCloseBookmarks={handleCloseBookmarks}
        onSwitchProject={setSelectedProjectId}
      />
      <PanelBoundary name="QuickActions">
        <QuickActions
          worktreeId={selectedWorktreeId}
          worktreePath={selectedWorktreePath}
          projectId={selectedProjectId}
          onAction={(action) => {
            if (action === "commit") execute("git:commit");
            else if (action === "stash") openPanel("stashManager");
            else if (action === "diff") openPanel("blameView");
            else if (action === "blame") {
              setBlameFilePath("");
              openPanel("blameView");
            } else if (action === "record") openPanel("terminalRecording");
            else if (action === "tests") openPanel("testRunnerPanel");
          }}
        />
      </PanelBoundary>
      {agentDoneToast && (
        <div className="fixed bottom-12 right-4 z-[9999] flex max-w-[300px] items-start gap-2.5 rounded-[6px] border border-[var(--accent-muted)] bg-[var(--bg-elevated)] px-3 py-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.4)] [border-left:3px_solid_var(--accent)]">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[12.5px] text-[var(--text-primary)]">
              <span className="mr-2 text-[var(--accent)]">✓</span>
              Agent done in <strong>{agentDoneToast}</strong>
            </span>
            <button
              className="self-start cursor-pointer rounded-[3px] border border-[var(--accent-muted)] bg-transparent px-2 py-0.5 text-[11px] text-[var(--accent)] transition-colors duration-100 hover:bg-[var(--accent-muted)]"
              onClick={() => {
                openPanel("gitDiff");
                setContentTab("changes");
                setAgentDoneToast(null);
              }}
            >
              Review Changes →
            </button>
          </div>
          <button
            className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent p-0 text-[10px] text-[var(--text-muted)] transition-colors duration-100 hover:text-[var(--text-primary)]"
            onClick={() => setAgentDoneToast(null)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
    </Suspense>
  );
}

function App() {
  const sidebarActionsRef = useRef<SidebarActions>({
    openSearch: () => {},
    openAiChat: () => {},
    openNotifications: () => {},
    openSettings: () => {},
  });

  return (
    <ErrorProvider>
      <ErrorBoundary name="App">
        <MainLayout
          onOpenSearch={() => sidebarActionsRef.current.openSearch()}
          onOpenAiChat={() => sidebarActionsRef.current.openAiChat()}
          onOpenNotifications={() =>
            sidebarActionsRef.current.openNotifications()
          }
          onOpenSettings={() => sidebarActionsRef.current.openSettings()}
        >
          <ErrorBoundary name="AppContent">
            <AppContent sidebarActionsRef={sidebarActionsRef} />
          </ErrorBoundary>
        </MainLayout>
        <GlobalErrorToast />
      </ErrorBoundary>
    </ErrorProvider>
  );
}

export default App;
