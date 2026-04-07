import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { ErrorProvider } from "./contexts/ErrorContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { GlobalErrorToast } from "./components/GlobalErrorToast";
import { invoke } from "@tauri-apps/api/core";
import { MainLayout } from "./layouts/MainLayout";
import { AuthButton } from "./components/AuthButton";
import { RepoList } from "./components/RepoList";
import { EnvPanel } from "./components/EnvPanel";
import { ActiveProjectBadge } from "./components/ActiveProjectBadge";
import { SettingsTab } from "./components/SettingsTab";
import { TerminalPanel } from "./components/TerminalPanel";
import { CommandPalette } from "./components/CommandPalette";
import { CommandBookmarks } from "./components/CommandBookmarks";
import { TerminalThemeSelector } from "./components/TerminalThemeSelector";
import { TaskRunner } from "./components/TaskRunner";
import { AppThemePicker } from "./components/AppThemePicker";
import { KeyboardShortcuts } from "./components/KeyboardShortcuts";
import { ThemeEditor } from "./components/ThemeEditor";
import { DensityPicker } from "./components/DensityPicker";
import { CustomCSSEditor } from "./components/CustomCSSEditor";
import { StashManager } from "./components/StashManager";
import { CheckpointPanel } from "./components/CheckpointPanel";
import { MultiAgentPipelinePanel } from "./components/MultiAgentPipelinePanel";
import { BlameView } from "./components/BlameView";
import { BranchCompare } from "./components/BranchCompare";
import { GitHooksManager } from "./components/GitHooksManager";
import { ConflictResolver } from "./components/ConflictResolver";
import { SecurityAudit } from "./components/SecurityAudit";
import { SecretScanner } from "./components/SecretScanner";
import { LicenseReport } from "./components/LicenseReport";
import { SecurityHeaders } from "./components/SecurityHeaders";
import { TestRunnerPanel } from "./components/TestRunnerPanel";
import { CoverageReport } from "./components/CoverageReport";
import { BenchmarkDashboard } from "./components/BenchmarkDashboard";
import { DockerPanel } from "./components/DockerPanel";
import { DockerImages } from "./components/DockerImages";
import { ContainerMonitor } from "./components/ContainerMonitor";
import { FlakyTests } from "./components/FlakyTests";
import { NotificationCenter } from "./components/NotificationCenter";
import { ActivityTimeline } from "./components/ActivityTimeline";
import { PluginManager } from "./components/PluginManager";
import { BackupRestore } from "./components/BackupRestore";
import { AnalyticsDashboard } from "./components/AnalyticsDashboard";
import { AiChatSidebar } from "./components/AiChatSidebar";
import { UnifiedSearch } from "./components/UnifiedSearch";
import { SettingsPage } from "./components/SettingsPage";
import { TerminalRecording } from "./components/TerminalRecording";
import { DoraMetrics } from "./components/DoraMetrics";
import { WebhookEvents } from "./components/WebhookEvents";
import { SshManager } from "./components/SshManager";
import { GitAnalytics } from "./components/GitAnalytics";
import { SnippetManager } from "./components/SnippetManager";
import { EnvProfileDiff } from "./components/EnvProfileDiff";
import { AppPerformance } from "./components/AppPerformance";
import { FileExplorer } from "./components/FileExplorer";
import { QuickActions } from "./components/QuickActions";
import { ProjectOverview } from "./components/ProjectOverview";
import { WebVitals } from "./components/WebVitals";
import { PluginRuntime } from "./components/PluginRuntime";
import { DependencyAnalyzer } from "./components/DependencyAnalyzer";
import { PortScanner } from "./components/PortScanner";
import { DirectoryStats } from "./components/DirectoryStats";
import { TagManager } from "./components/TagManager";
import { GitLogViewer } from "./components/GitLogViewer";
import { WorkspaceManager } from "./components/WorkspaceManager";
import { TaskScheduler } from "./components/TaskScheduler";
import { ClipboardHistory } from "./components/ClipboardHistory";
import { TodoPanel } from "./components/TodoPanel";
import { QuickSwitcher } from "./components/QuickSwitcher";
import { ErrorDiagnosis } from "./components/ErrorDiagnosis";
import { MorningBriefing } from "./components/MorningBriefing";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { NetworkTab } from "./components/NetworkTab";
import { PRStatusPanel } from "./components/PRStatusPanel";
import { GitDiffView } from "./components/GitDiffView";
import { CreatePRPanel } from "./components/CreatePRPanel";
import { MemoryTab } from "./components/MemoryTab";
import { ShellHistoryTab } from "./components/ShellHistoryTab";
import { DeadEndsLog } from "./components/DeadEndsLog";
import { DbSchemaTab } from "./components/DbSchemaTab";
import { BrowserEvents } from "./components/BrowserEvents";
import { DatabaseExplorer } from "./components/DatabaseExplorer";
import { Dashboard } from "./components/Dashboard";
import { StatusBar } from "./components/StatusBar";
import { ContentToolbar } from "./components/ContentToolbar";
import { DEFAULT_THEME_ID } from "./lib/terminalThemes";
import { getAppThemeById } from "./themes/builtin";
import { applyTheme, loadSavedThemeId } from "./themes/engine";
import {
  applyDensity,
  loadSavedDensity,
  type DensityMode,
} from "./themes/density";
import { loadCustomCSS } from "./themes/customCSS";
import { useUiStore } from "./stores/uiStore";
import {
  useCommandRegistry,
  useGlobalShortcuts,
} from "./hooks/useCommandRegistry";
import type { Command } from "./hooks/useCommandRegistry";
import { usePanels } from "./hooks/usePanels";

interface ProjectInfo {
  id: number;
  name: string;
  local_path: string;
  framework: string | null;
}

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
    showRightSidebar,
    setShowRightSidebar,
    markAgentDone,
  } = useUiStore();

  const [isGitHubConnected, setIsGitHubConnected] = useState(false);
  useEffect(() => {
    const check = () =>
      invoke<boolean>("github_check_auth")
        .then(setIsGitHubConnected)
        .catch(() => setIsGitHubConnected(false));
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

  // Stable refs so the callback doesn't need to be in dependency arrays.
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
      // Only show toast if the user isn't already viewing the terminal —
      // if they're watching the agent's output, the notification is redundant.
      setAgentDoneToast(name);
    }
  }, [markAgentDone]);

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

  const [densityMode, setDensityMode] = useState<DensityMode>("comfortable");
  const [appThemeId, setAppThemeId] = useState("midnight");
  const [terminalThemeId, setTerminalThemeId] = useState(DEFAULT_THEME_ID);
  const { register, execute, search } = useCommandRegistry();

  // Load saved app theme, terminal theme, density mode, and custom CSS
  useEffect(() => {
    loadSavedThemeId().then((id) => {
      setAppThemeId(id);
      applyTheme(getAppThemeById(id));
    });
    invoke<string | null>("get_setting", { key: "terminal_theme" }).then(
      (val) => {
        if (val?.trim()) setTerminalThemeId(val.trim());
      },
      () => {},
    );
    loadSavedDensity().then((m) => {
      setDensityMode(m);
      applyDensity(m);
    });
    loadCustomCSS();
  }, []);

  // Fetch projects and worktrees for quick switcher commands
  const [allProjects, setAllProjects] = useState<ProjectInfo[]>([]);
  const [allWorktrees, setAllWorktrees] = useState<
    Array<WorktreeInfo & { projectName: string }>
  >([]);

  const selectedProjectName = useMemo(
    () => allProjects.find((p) => p.id === selectedProjectId)?.name ?? null,
    [allProjects, selectedProjectId],
  );

  useEffect(() => {
    async function loadSwitcherData() {
      try {
        const projects = await invoke<ProjectInfo[]>("list_projects");
        setAllProjects(projects);

        // Fetch worktrees for each project
        const wtResults = await Promise.all(
          projects.map(async (p) => {
            try {
              const wts = await invoke<WorktreeInfo[]>(
                "list_project_worktrees",
                { projectId: p.id },
              );
              return wts.map((wt) => ({ ...wt, projectName: p.name }));
            } catch {
              return [];
            }
          }),
        );
        setAllWorktrees(wtResults.flat());
      } catch {
        // ignore — commands just won't have project/worktree entries
      }
    }
    loadSwitcherData();
  }, [selectedProjectId, selectedWorktreeId]);

  // Stable refs for worktree selection actions
  const selectWorktree = useCallback(
    (wt: WorktreeInfo & { projectName: string }) => {
      setSelectedProjectId(wt.project_id);
      setSelectedWorktreeId(wt.id);
      setSelectedWorktreePath(wt.path);
      setSelectedWorktreeName(wt.branch_name);
      setShowSettings(false);
    },
    [
      setSelectedProjectId,
      setSelectedWorktreeId,
      setSelectedWorktreePath,
      setSelectedWorktreeName,
      setShowSettings,
    ],
  );

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
      {
        id: "github:toggle",
        label: showRightSidebar ? "Hide GitHub Sidebar" : "Show GitHub Sidebar",
        category: "Panels",
        shortcut: "\u2318G",
        icon: "\uD83D\uDC19",
        action: () => setShowRightSidebar(!showRightSidebar),
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
    showRightSidebar,
    allProjects,
    allWorktrees,
    selectWorktree,
    setShowSettings,
    setSelectedProjectId,
    setSelectedWorktreeId,
    setSelectedWorktreePath,
    setSelectedWorktreeName,
    setShowRightSidebar,
  ]);

  // Register commands whenever they change
  useMemo(() => register(commands), [commands, register]);

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
        key: "g",
        meta: true,
        action: () => setShowRightSidebar(!showRightSidebar),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      showRightSidebar,
      setShowSettings,
      setSelectedWorktreeId,
      setSelectedWorktreePath,
      setSelectedWorktreeName,
      setShowRightSidebar,
    ],
  );
  useGlobalShortcuts(shortcuts);

  const handleClosePalette = useCallback(() => closePanel("palette"), []);
  const handleCloseBookmarks = useCallback(() => closePanel("bookmarks"), []);

  /* Expose sidebar-toolbar actions to parent via ref */
  sidebarActionsRef.current = {
    openSearch: () => openPanel("unifiedSearch"),
    openAiChat: () => openPanel("aiChat"),
    openNotifications: () => openPanel("notifications"),
    openSettings: () => {
      openPanel("settingsPage");
    },
  };

  const handleDashboardAction = useCallback((action: string) => {
    switch (action) {
      case "terminal":
        break;
      case "git":
        openPanel("gitDiff");
        break;
      case "ai":
        openPanel("aiChat");
        break;
      case "search":
        openPanel("unifiedSearch");
        break;
      case "security":
        openPanel("securityAudit");
        break;
      case "docker":
        openPanel("docker");
        break;
    }
  }, []);

  const handleContentTabChange = useCallback((tab: string) => {
    setContentTab(tab);
    switch (tab) {
      case "changes":
        openPanel("gitDiff");
        break;
      case "pr":
        openPanel("createPr");
        break;
      case "tests":
        openPanel("testRunnerPanel");
        break;
      case "security":
        openPanel("securityAudit");
        break;
      case "docker":
        openPanel("docker");
        break;
    }
  }, []);

  return (
    <>
      {showSettings ? (
        <SettingsTab />
      ) : !selectedWorktreePath ? (
        <div className="content-scroll">
          <div className="content-inner">
            <Dashboard
              projectId={selectedProjectId}
              onAction={handleDashboardAction}
            />
            <ActiveProjectBadge />
            <AuthButton />
            <RepoList />
            {selectedProjectId !== null && (
              <EnvPanel projectId={selectedProjectId} />
            )}
          </div>
        </div>
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
          <TerminalPanel
            cwd={lastWorktreePathRef.current}
            worktreeName={
              selectedWorktreeName ?? lastWorktreeNameRef.current ?? "Shell"
            }
            themeId={terminalThemeId}
            onAgentComplete={handleAgentComplete}
          />
        </div>
      )}
      <StatusBar
        projectName={selectedProjectName}
        branchName={selectedWorktreeName}
        isGitHubConnected={isGitHubConnected}
      />
      <CommandPalette
        open={panels.palette}
        onClose={handleClosePalette}
        onExecute={execute}
        search={search}
      />
      {panels.bookmarks && (
        <CommandBookmarks
          projectId={selectedProjectId}
          onClose={handleCloseBookmarks}
        />
      )}
      {panels.themeSelector && (
        <TerminalThemeSelector
          currentThemeId={terminalThemeId}
          onThemeChange={setTerminalThemeId}
          onClose={() => closePanel("themeSelector")}
        />
      )}
      {panels.taskRunner && selectedWorktreePath && (
        <TaskRunner
          cwd={selectedWorktreePath}
          onClose={() => closePanel("taskRunner")}
        />
      )}
      {panels.appThemePicker && (
        <AppThemePicker
          currentThemeId={appThemeId}
          onThemeChange={setAppThemeId}
          onClose={() => closePanel("appThemePicker")}
        />
      )}
      {panels.themeEditor && (
        <ThemeEditor
          currentThemeId={appThemeId}
          onClose={() => closePanel("themeEditor")}
          onThemeSave={(theme) => {
            applyTheme(theme);
            setAppThemeId(theme.id);
          }}
        />
      )}
      {panels.densityPicker && (
        <DensityPicker
          currentMode={densityMode}
          onModeChange={setDensityMode}
          onClose={() => closePanel("densityPicker")}
        />
      )}
      {panels.shortcuts && (
        <KeyboardShortcuts onClose={() => closePanel("shortcuts")} />
      )}
      {panels.cssEditor && (
        <CustomCSSEditor onClose={() => closePanel("cssEditor")} />
      )}
      {panels.stashManager && selectedWorktreeId !== null && (
        <StashManager
          worktreeId={selectedWorktreeId}
          onClose={() => closePanel("stashManager")}
        />
      )}
      {panels.checkpointManager && selectedWorktreeId !== null && (
        <CheckpointPanel
          worktreeId={selectedWorktreeId}
          onClose={() => closePanel("checkpointManager")}
        />
      )}
      {panels.multiAgentPipeline && selectedWorktreeId !== null && (
        <MultiAgentPipelinePanel
          worktreeId={selectedWorktreeId}
          onClose={() => closePanel("multiAgentPipeline")}
        />
      )}
      {panels.blameView && selectedWorktreeId !== null && (
        <BlameView
          worktreeId={selectedWorktreeId}
          filePath={blameFilePath}
          onClose={() => closePanel("blameView")}
        />
      )}
      {panels.branchCompare && selectedWorktreeId !== null && (
        <BranchCompare
          worktreeId={selectedWorktreeId}
          onClose={() => closePanel("branchCompare")}
        />
      )}
      {panels.gitHooks && selectedWorktreeId !== null && (
        <GitHooksManager
          worktreeId={selectedWorktreeId}
          onClose={() => closePanel("gitHooks")}
        />
      )}
      {panels.conflictResolver && selectedWorktreeId !== null && (
        <ConflictResolver
          worktreeId={selectedWorktreeId}
          onClose={() => closePanel("conflictResolver")}
        />
      )}
      {panels.securityAudit && selectedWorktreePath && (
        <SecurityAudit
          cwd={selectedWorktreePath}
          onClose={() => {
            closePanel("securityAudit");
            setContentTab("terminal");
          }}
        />
      )}
      {panels.secretScanner && selectedWorktreePath && (
        <SecretScanner
          cwd={selectedWorktreePath}
          onClose={() => closePanel("secretScanner")}
        />
      )}
      {panels.licenseReport && selectedWorktreePath && (
        <LicenseReport
          cwd={selectedWorktreePath}
          onClose={() => closePanel("licenseReport")}
        />
      )}
      {panels.securityHeaders && (
        <SecurityHeaders onClose={() => closePanel("securityHeaders")} />
      )}
      {panels.testRunnerPanel && selectedWorktreePath && (
        <TestRunnerPanel
          cwd={selectedWorktreePath}
          onClose={() => {
            closePanel("testRunnerPanel");
            setContentTab("terminal");
          }}
        />
      )}
      {panels.coverageReport && selectedWorktreePath && (
        <CoverageReport
          cwd={selectedWorktreePath}
          onClose={() => closePanel("coverageReport")}
        />
      )}
      {panels.benchmark && selectedWorktreePath && (
        <BenchmarkDashboard
          cwd={selectedWorktreePath}
          onClose={() => closePanel("benchmark")}
        />
      )}
      {panels.docker && selectedWorktreePath && (
        <DockerPanel
          cwd={selectedWorktreePath}
          onClose={() => {
            closePanel("docker");
            setContentTab("terminal");
          }}
        />
      )}
      {panels.dockerImages && (
        <DockerImages onClose={() => closePanel("dockerImages")} />
      )}
      {panels.containerMonitor && (
        <ContainerMonitor onClose={() => closePanel("containerMonitor")} />
      )}
      {panels.flakyTests && selectedWorktreePath && (
        <FlakyTests
          cwd={selectedWorktreePath}
          onClose={() => closePanel("flakyTests")}
        />
      )}
      <NotificationCenter
        open={panels.notifications}
        onClose={() => closePanel("notifications")}
      />
      {panels.activityTimeline && (
        <ActivityTimeline onClose={() => closePanel("activityTimeline")} />
      )}
      {panels.pluginManager && (
        <PluginManager onClose={() => closePanel("pluginManager")} />
      )}
      {panels.backupRestore && (
        <BackupRestore onClose={() => closePanel("backupRestore")} />
      )}
      {panels.analyticsDashboard && selectedWorktreePath && (
        <AnalyticsDashboard
          cwd={selectedWorktreePath}
          onClose={() => closePanel("analyticsDashboard")}
        />
      )}
      <AiChatSidebar
        open={panels.aiChat}
        onClose={() => closePanel("aiChat")}
      />
      <UnifiedSearch
        open={panels.unifiedSearch}
        onClose={() => closePanel("unifiedSearch")}
        onNavigate={(type, _data) => {
          closePanel("unifiedSearch");
          if (type === "bookmark") openPanel("bookmarks");
          else if (type === "setting") openPanel("settingsPage");
        }}
      />
      {panels.settingsPage && (
        <SettingsPage onClose={() => closePanel("settingsPage")} />
      )}
      {panels.terminalRecording && selectedWorktreeId !== null && (
        <TerminalRecording
          worktreeId={selectedWorktreeId}
          onClose={() => closePanel("terminalRecording")}
        />
      )}
      {panels.doraMetrics && selectedProjectId !== null && (
        <DoraMetrics
          projectId={selectedProjectId}
          onClose={() => closePanel("doraMetrics")}
        />
      )}
      {panels.webhookEvents && (
        <WebhookEvents onClose={() => closePanel("webhookEvents")} />
      )}
      {panels.sshManager && (
        <SshManager
          onClose={() => closePanel("sshManager")}
          onConnect={() => closePanel("sshManager")}
        />
      )}
      {panels.gitAnalytics && selectedWorktreeId !== null && (
        <GitAnalytics
          worktreeId={selectedWorktreeId}
          onClose={() => closePanel("gitAnalytics")}
        />
      )}
      {panels.snippetManager && (
        <SnippetManager
          projectId={selectedProjectId}
          onClose={() => closePanel("snippetManager")}
        />
      )}
      {panels.envDiff && selectedProjectId !== null && (
        <EnvProfileDiff
          projectId={selectedProjectId}
          onClose={() => closePanel("envDiff")}
        />
      )}
      {panels.appPerformance && (
        <AppPerformance onClose={() => closePanel("appPerformance")} />
      )}
      {panels.fileExplorer && selectedWorktreePath && (
        <FileExplorer
          cwd={selectedWorktreePath}
          onClose={() => closePanel("fileExplorer")}
          onFileSelect={(path) => {
            closePanel("fileExplorer");
            setBlameFilePath(path);
            openPanel("blameView");
          }}
        />
      )}
      {panels.projectOverview && selectedProjectId !== null && (
        <ProjectOverview
          projectId={selectedProjectId}
          onClose={() => closePanel("projectOverview")}
        />
      )}
      {panels.webVitals && (
        <WebVitals onClose={() => closePanel("webVitals")} />
      )}
      {panels.pluginRuntime && selectedWorktreePath && (
        <PluginRuntime
          cwd={selectedWorktreePath}
          onClose={() => closePanel("pluginRuntime")}
        />
      )}
      {panels.depAnalyzer && selectedWorktreePath && (
        <DependencyAnalyzer
          cwd={selectedWorktreePath}
          onClose={() => closePanel("depAnalyzer")}
        />
      )}
      {panels.portScanner && (
        <PortScanner onClose={() => closePanel("portScanner")} />
      )}
      {panels.dirStats && selectedWorktreePath && (
        <DirectoryStats
          cwd={selectedWorktreePath}
          onClose={() => closePanel("dirStats")}
        />
      )}
      {panels.tagManager && selectedWorktreeId !== null && (
        <TagManager
          worktreeId={selectedWorktreeId}
          onClose={() => closePanel("tagManager")}
        />
      )}
      {panels.gitLog && selectedWorktreeId !== null && (
        <GitLogViewer
          worktreeId={selectedWorktreeId}
          onClose={() => closePanel("gitLog")}
        />
      )}
      {panels.workspaceManager && (
        <WorkspaceManager
          onClose={() => closePanel("workspaceManager")}
          onLoad={() => closePanel("workspaceManager")}
        />
      )}
      {panels.taskScheduler && (
        <TaskScheduler onClose={() => closePanel("taskScheduler")} />
      )}
      {panels.clipboardHistory && (
        <ClipboardHistory onClose={() => closePanel("clipboardHistory")} />
      )}
      {panels.todoPanel && (
        <TodoPanel
          projectId={selectedProjectId}
          onClose={() => closePanel("todoPanel")}
        />
      )}
      {panels.morningBriefing && selectedProjectId && (
        <div
          className="panel-overlay"
          onClick={() => closePanel("morningBriefing")}
        >
          <div className="panel-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="panel-dialog-header">
              <span>Morning Briefing</span>
              <button
                className="panel-dialog-close"
                onClick={() => closePanel("morningBriefing")}
              >
                &times;
              </button>
            </div>
            <MorningBriefing projectId={selectedProjectId} />
          </div>
        </div>
      )}
      {panels.onboarding && (
        <div className="panel-overlay" onClick={() => closePanel("onboarding")}>
          <div
            className="panel-dialog panel-dialog--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <OnboardingWizard
              onComplete={() => closePanel("onboarding")}
              onClose={() => closePanel("onboarding")}
            />
          </div>
        </div>
      )}
      {panels.networkTab && (
        <div className="panel-overlay" onClick={() => closePanel("networkTab")}>
          <div
            className="panel-dialog panel-dialog--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-dialog-header">
              <span>Network Traffic</span>
              <button
                className="panel-dialog-close"
                onClick={() => closePanel("networkTab")}
              >
                &times;
              </button>
            </div>
            <NetworkTab />
          </div>
        </div>
      )}
      {panels.prStatus && selectedWorktreeId && (
        <div className="panel-overlay" onClick={() => closePanel("prStatus")}>
          <div
            className="panel-dialog panel-dialog--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-dialog-header">
              <span>PR Status</span>
              <button
                className="panel-dialog-close"
                onClick={() => closePanel("prStatus")}
              >
                &times;
              </button>
            </div>
            <PRStatusPanel worktreeId={selectedWorktreeId} />
          </div>
        </div>
      )}
      {panels.gitDiff && selectedWorktreeId && (
        <div
          className="panel-overlay"
          onClick={() => {
            closePanel("gitDiff");
            setContentTab("terminal");
          }}
        >
          <div
            className="panel-dialog panel-dialog--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-dialog-header">
              <span>Git Changes</span>
              <button
                className="panel-dialog-close"
                onClick={() => {
                  closePanel("gitDiff");
                  setContentTab("terminal");
                }}
              >
                &times;
              </button>
            </div>
            <GitDiffView
              worktreeId={selectedWorktreeId}
              onCreatePR={() => {
                closePanel("gitDiff");
                openPanel("createPr");
                setContentTab("pr");
              }}
            />
          </div>
        </div>
      )}
      {panels.createPr && selectedWorktreeId && selectedWorktreeName && (
        <div
          className="panel-overlay"
          onClick={() => {
            closePanel("createPr");
            setContentTab("terminal");
          }}
        >
          <div className="panel-dialog" onClick={(e) => e.stopPropagation()}>
            <CreatePRPanel
              worktreeId={selectedWorktreeId}
              branch={selectedWorktreeName}
              onClose={() => {
                closePanel("createPr");
                setContentTab("terminal");
              }}
            />
          </div>
        </div>
      )}
      {panels.memoryTab && selectedWorktreeId && (
        <div className="panel-overlay" onClick={() => closePanel("memoryTab")}>
          <div
            className="panel-dialog panel-dialog--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-dialog-header">
              <span>Memory Notes</span>
              <button
                className="panel-dialog-close"
                onClick={() => closePanel("memoryTab")}
              >
                &times;
              </button>
            </div>
            <MemoryTab worktreeId={selectedWorktreeId} />
          </div>
        </div>
      )}
      {panels.shellHistory && selectedProjectId && (
        <div
          className="panel-overlay"
          onClick={() => closePanel("shellHistory")}
        >
          <div
            className="panel-dialog panel-dialog--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-dialog-header">
              <span>Shell History</span>
              <button
                className="panel-dialog-close"
                onClick={() => closePanel("shellHistory")}
              >
                &times;
              </button>
            </div>
            <ShellHistoryTab
              projectId={selectedProjectId}
              branch={selectedWorktreeName ?? ""}
            />
          </div>
        </div>
      )}
      {panels.deadEnds && selectedWorktreeId && (
        <div className="panel-overlay" onClick={() => closePanel("deadEnds")}>
          <div className="panel-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="panel-dialog-header">
              <span>Dead Ends Log</span>
              <button
                className="panel-dialog-close"
                onClick={() => closePanel("deadEnds")}
              >
                &times;
              </button>
            </div>
            <DeadEndsLog worktreeId={selectedWorktreeId} />
          </div>
        </div>
      )}
      {panels.dbSchema && selectedWorktreeId && (
        <div className="panel-overlay" onClick={() => closePanel("dbSchema")}>
          <div
            className="panel-dialog panel-dialog--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-dialog-header">
              <span>Database Schema</span>
              <button
                className="panel-dialog-close"
                onClick={() => closePanel("dbSchema")}
              >
                &times;
              </button>
            </div>
            <DbSchemaTab worktreeId={selectedWorktreeId} />
          </div>
        </div>
      )}
      {panels.browserEvents && selectedWorktreeId && (
        <div
          className="panel-overlay"
          onClick={() => closePanel("browserEvents")}
        >
          <div
            className="panel-dialog panel-dialog--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <BrowserEvents
              worktreeId={selectedWorktreeId}
              onClose={() => closePanel("browserEvents")}
            />
          </div>
        </div>
      )}
      {panels.dbExplorer && selectedWorktreeId && (
        <div className="panel-overlay" onClick={() => closePanel("dbExplorer")}>
          <div
            className="panel-dialog panel-dialog--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <DatabaseExplorer
              worktreeId={selectedWorktreeId}
              onClose={() => closePanel("dbExplorer")}
            />
          </div>
        </div>
      )}
      <QuickSwitcher
        open={panels.quickSwitcher}
        onClose={() => closePanel("quickSwitcher")}
        selectedProjectId={selectedProjectId}
        onSwitchProject={(id) => {
          setSelectedProjectId(id);
          closePanel("quickSwitcher");
        }}
        onSwitchBranch={() => {
          closePanel("quickSwitcher");
        }}
      />
      <ErrorDiagnosis
        open={panels.errorDiagnosis}
        onClose={() => closePanel("errorDiagnosis")}
      />
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
    </>
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
