import { useState, useCallback, useMemo, useEffect, useRef } from "react";
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

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [themeSelectorOpen, setThemeSelectorOpen] = useState(false);
  const [taskRunnerOpen, setTaskRunnerOpen] = useState(false);
  const [appThemePickerOpen, setAppThemePickerOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [themeEditorOpen, setThemeEditorOpen] = useState(false);
  const [densityPickerOpen, setDensityPickerOpen] = useState(false);
  const [cssEditorOpen, setCssEditorOpen] = useState(false);
  const [stashManagerOpen, setStashManagerOpen] = useState(false);
  const [blameViewOpen, setBlameViewOpen] = useState(false);
  const [branchCompareOpen, setBranchCompareOpen] = useState(false);
  const [gitHooksOpen, setGitHooksOpen] = useState(false);
  const [conflictResolverOpen, setConflictResolverOpen] = useState(false);
  const [securityAuditOpen, setSecurityAuditOpen] = useState(false);
  const [secretScannerOpen, setSecretScannerOpen] = useState(false);
  const [licenseReportOpen, setLicenseReportOpen] = useState(false);
  const [securityHeadersOpen, setSecurityHeadersOpen] = useState(false);
  const [testRunnerPanelOpen, setTestRunnerPanelOpen] = useState(false);
  const [coverageReportOpen, setCoverageReportOpen] = useState(false);
  const [benchmarkOpen, setBenchmarkOpen] = useState(false);
  const [dockerOpen, setDockerOpen] = useState(false);
  const [dockerImagesOpen, setDockerImagesOpen] = useState(false);
  const [containerMonitorOpen, setContainerMonitorOpen] = useState(false);
  const [flakyTestsOpen, setFlakyTestsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [activityTimelineOpen, setActivityTimelineOpen] = useState(false);
  const [pluginManagerOpen, setPluginManagerOpen] = useState(false);
  const [backupRestoreOpen, setBackupRestoreOpen] = useState(false);
  const [analyticsDashboardOpen, setAnalyticsDashboardOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [unifiedSearchOpen, setUnifiedSearchOpen] = useState(false);
  const [settingsPageOpen, setSettingsPageOpen] = useState(false);
  const [terminalRecordingOpen, setTerminalRecordingOpen] = useState(false);
  const [doraMetricsOpen, setDoraMetricsOpen] = useState(false);
  const [webhookEventsOpen, setWebhookEventsOpen] = useState(false);
  const [sshManagerOpen, setSshManagerOpen] = useState(false);
  const [gitAnalyticsOpen, setGitAnalyticsOpen] = useState(false);
  const [snippetManagerOpen, setSnippetManagerOpen] = useState(false);
  const [envDiffOpen, setEnvDiffOpen] = useState(false);
  const [appPerformanceOpen, setAppPerformanceOpen] = useState(false);
  const [fileExplorerOpen, setFileExplorerOpen] = useState(false);
  const [projectOverviewOpen, setProjectOverviewOpen] = useState(false);
  const [webVitalsOpen, setWebVitalsOpen] = useState(false);
  const [pluginRuntimeOpen, setPluginRuntimeOpen] = useState(false);
  const [depAnalyzerOpen, setDepAnalyzerOpen] = useState(false);
  const [portScannerOpen, setPortScannerOpen] = useState(false);
  const [dirStatsOpen, setDirStatsOpen] = useState(false);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [gitLogOpen, setGitLogOpen] = useState(false);
  const [workspaceManagerOpen, setWorkspaceManagerOpen] = useState(false);
  const [taskSchedulerOpen, setTaskSchedulerOpen] = useState(false);
  const [clipboardHistoryOpen, setClipboardHistoryOpen] = useState(false);
  const [todoPanelOpen, setTodoPanelOpen] = useState(false);
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [errorDiagnosisOpen, setErrorDiagnosisOpen] = useState(false);
  const [morningBriefingOpen, setMorningBriefingOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [networkTabOpen, setNetworkTabOpen] = useState(false);
  const [prStatusOpen, setPrStatusOpen] = useState(false);
  const [gitDiffOpen, setGitDiffOpen] = useState(false);
  const [createPrOpen, setCreatePrOpen] = useState(false);
  const [memoryTabOpen, setMemoryTabOpen] = useState(false);
  const [shellHistoryOpen, setShellHistoryOpen] = useState(false);
  const [deadEndsOpen, setDeadEndsOpen] = useState(false);
  const [dbSchemaOpen, setDbSchemaOpen] = useState(false);
  const [browserEventsOpen, setBrowserEventsOpen] = useState(false);
  const [dbExplorerOpen, setDbExplorerOpen] = useState(false);
  const [blameFilePath, setBlameFilePath] = useState("");
  const [contentTab, setContentTab] = useState("terminal");

  // Reset content tab and close tab-launched panels when switching worktrees
  useEffect(() => {
    setContentTab("terminal");
    setGitDiffOpen(false);
    setCreatePrOpen(false);
    setSecurityAuditOpen(false);
    setTestRunnerPanelOpen(false);
    setDockerOpen(false);
  }, [selectedWorktreeId]);

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
        action: () => setBookmarksOpen(true),
      },
      {
        id: "theme:app",
        label: "App Theme",
        category: "Appearance",
        icon: "\u25D1",
        action: () => setAppThemePickerOpen(true),
      },
      {
        id: "theme:editor",
        label: "Theme Editor",
        category: "Appearance",
        icon: "\uD83C\uDFA8",
        action: () => setThemeEditorOpen(true),
      },
      {
        id: "theme:custom-css",
        label: "Custom CSS Editor",
        category: "Appearance",
        icon: "\u270E",
        action: () => setCssEditorOpen(true),
      },
      {
        id: "density:picker",
        label: "Layout Density",
        category: "Appearance",
        icon: "\u25A4",
        action: () => setDensityPickerOpen(true),
      },
      {
        id: "theme:terminal",
        label: "Terminal Theme",
        category: "Appearance",
        shortcut: "\u2318T",
        icon: "\u25D0",
        action: () => setThemeSelectorOpen(true),
      },
      {
        id: "shortcuts:open",
        label: "Keyboard Shortcuts",
        category: "Help",
        shortcut: "\u2318?",
        icon: "\u2328",
        action: () => setShortcutsOpen(true),
      },
      {
        id: "tasks:open",
        label: "Task Runner",
        category: "Tools",
        shortcut: "\u2318R",
        icon: "\u25B6",
        enabled: () => selectedWorktreePath !== null,
        action: () => setTaskRunnerOpen(true),
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
        action: () => setStashManagerOpen(true),
      },
      {
        id: "git:blame",
        label: "Blame View",
        category: "Git",
        icon: "\u2261",
        enabled: () => selectedWorktreeId !== null,
        action: () => {
          setBlameFilePath("");
          setBlameViewOpen(true);
        },
      },
      {
        id: "git:compare",
        label: "Branch Compare",
        category: "Git",
        icon: "\u21C4",
        enabled: () => selectedWorktreeId !== null,
        action: () => setBranchCompareOpen(true),
      },
      {
        id: "git:hooks",
        label: "Git Hooks",
        category: "Git",
        icon: "\u2693",
        enabled: () => selectedWorktreeId !== null,
        action: () => setGitHooksOpen(true),
      },
      {
        id: "git:conflicts",
        label: "Conflict Resolver",
        category: "Git",
        icon: "!",
        enabled: () => selectedWorktreeId !== null,
        action: () => setConflictResolverOpen(true),
      },
      // Security tools
      {
        id: "security:audit",
        label: "Security Audit",
        category: "Security",
        icon: "\u26A0",
        enabled: () => selectedWorktreePath !== null,
        action: () => setSecurityAuditOpen(true),
      },
      {
        id: "security:secrets",
        label: "Secret Scanner",
        category: "Security",
        icon: "\uD83D\uDD12",
        enabled: () => selectedWorktreePath !== null,
        action: () => setSecretScannerOpen(true),
      },
      {
        id: "security:licenses",
        label: "License Report",
        category: "Security",
        icon: "\u00A9",
        enabled: () => selectedWorktreePath !== null,
        action: () => setLicenseReportOpen(true),
      },
      {
        id: "security:headers",
        label: "Security Headers",
        category: "Security",
        icon: "\u26D4",
        action: () => setSecurityHeadersOpen(true),
      },
      // Testing tools
      {
        id: "testing:runner",
        label: "Test Runner",
        category: "Testing",
        icon: "\u2714",
        enabled: () => selectedWorktreePath !== null,
        action: () => setTestRunnerPanelOpen(true),
      },
      {
        id: "testing:coverage",
        label: "Coverage Report",
        category: "Testing",
        icon: "\u25A3",
        enabled: () => selectedWorktreePath !== null,
        action: () => setCoverageReportOpen(true),
      },
      {
        id: "testing:benchmark",
        label: "Benchmark Dashboard",
        category: "Testing",
        icon: "\u23F1",
        enabled: () => selectedWorktreePath !== null,
        action: () => setBenchmarkOpen(true),
      },
      // Infrastructure
      {
        id: "infra:docker",
        label: "Docker",
        category: "Infrastructure",
        icon: "\uD83D\uDC33",
        enabled: () => selectedWorktreePath !== null,
        action: () => setDockerOpen(true),
      },
      {
        id: "infra:docker-images",
        label: "Docker Images",
        category: "Infrastructure",
        icon: "\uD83D\uDCE6",
        action: () => setDockerImagesOpen(true),
      },
      {
        id: "infra:container-monitor",
        label: "Container Monitor",
        category: "Infrastructure",
        icon: "\uD83D\uDCCA",
        action: () => setContainerMonitorOpen(true),
      },
      {
        id: "testing:flaky",
        label: "Flaky Tests",
        category: "Testing",
        icon: "\u26A0",
        enabled: () => selectedWorktreePath !== null,
        action: () => setFlakyTestsOpen(true),
      },
      {
        id: "collab:notifications",
        label: "Notifications",
        category: "Collaboration",
        shortcut: "\u2318N",
        icon: "\uD83D\uDD14",
        action: () => setNotificationsOpen(true),
      },
      {
        id: "collab:activity-timeline",
        label: "Activity Timeline",
        category: "Collaboration",
        icon: "\uD83D\uDCC5",
        action: () => setActivityTimelineOpen(true),
      },
      {
        id: "tools:plugins",
        label: "Plugins",
        category: "Tools",
        icon: "\uD83E\uDDE9",
        action: () => setPluginManagerOpen(true),
      },
      {
        id: "tools:backup",
        label: "Backup & Restore",
        category: "Tools",
        icon: "\uD83D\uDCBE",
        action: () => setBackupRestoreOpen(true),
      },
      {
        id: "tools:analytics",
        label: "Analytics",
        category: "Tools",
        icon: "\uD83D\uDCC8",
        enabled: () => selectedWorktreePath !== null,
        action: () => setAnalyticsDashboardOpen(true),
      },
      {
        id: "ai:chat",
        label: "AI Chat",
        category: "AI",
        shortcut: "\u2318J",
        icon: "\u2728",
        action: () => setAiChatOpen((p) => !p),
      },
      {
        id: "search:unified",
        label: "Search Everything",
        category: "Navigation",
        shortcut: "\u2318P",
        icon: "\u2315",
        action: () => setUnifiedSearchOpen(true),
      },
      {
        id: "nav:settings-page",
        label: "All Settings",
        category: "Navigation",
        icon: "\u2699",
        action: () => setSettingsPageOpen(true),
      },
      {
        id: "terminal:recording",
        label: "Terminal Recording",
        category: "Tools",
        icon: "\u25CF",
        enabled: () => selectedWorktreeId !== null,
        action: () => setTerminalRecordingOpen(true),
      },
      {
        id: "metrics:dora",
        label: "DORA Metrics",
        category: "Metrics",
        icon: "\u2261",
        enabled: () => selectedProjectId !== null,
        action: () => setDoraMetricsOpen(true),
      },
      {
        id: "tools:webhooks",
        label: "Webhook Events",
        category: "Tools",
        icon: "\u21AF",
        action: () => setWebhookEventsOpen(true),
      },
      {
        id: "tools:ssh",
        label: "SSH Connections",
        category: "Tools",
        icon: "\u2192",
        action: () => setSshManagerOpen(true),
      },
      {
        id: "git:analytics",
        label: "Git Analytics",
        category: "Git",
        icon: "\u2593",
        enabled: () => selectedWorktreeId !== null,
        action: () => setGitAnalyticsOpen(true),
      },
      {
        id: "tools:snippets",
        label: "Code Snippets",
        category: "Tools",
        icon: "\u2702",
        action: () => setSnippetManagerOpen(true),
      },
      {
        id: "env:diff",
        label: "Compare Env Profiles",
        category: "Environment",
        icon: "\u2194",
        enabled: () => selectedProjectId !== null,
        action: () => setEnvDiffOpen(true),
      },
      {
        id: "tools:performance",
        label: "App Performance",
        category: "Tools",
        icon: "\u2261",
        action: () => setAppPerformanceOpen(true),
      },
      {
        id: "nav:files",
        label: "File Explorer",
        category: "Navigation",
        shortcut: "\u2318E",
        icon: "\u2630",
        enabled: () => selectedWorktreePath !== null,
        action: () => setFileExplorerOpen(true),
      },
      {
        id: "nav:project-overview",
        label: "Project Overview",
        category: "Navigation",
        icon: "\u25A3",
        enabled: () => selectedProjectId !== null,
        action: () => setProjectOverviewOpen(true),
      },
      {
        id: "perf:vitals",
        label: "Web Vitals",
        category: "Performance",
        icon: "\u26A1",
        action: () => setWebVitalsOpen(true),
      },
      {
        id: "tools:plugin-runtime",
        label: "Plugin Runtime",
        category: "Tools",
        icon: "\u25B7",
        enabled: () => selectedWorktreePath !== null,
        action: () => setPluginRuntimeOpen(true),
      },
      {
        id: "tools:deps",
        label: "Dependency Analyzer",
        category: "Tools",
        icon: "\u2B21",
        enabled: () => selectedWorktreePath !== null,
        action: () => setDepAnalyzerOpen(true),
      },
      {
        id: "network:ports",
        label: "Port Scanner",
        category: "Network",
        icon: "\u2299",
        action: () => setPortScannerOpen(true),
      },
      {
        id: "tools:dir-stats",
        label: "Directory Stats",
        category: "Tools",
        icon: "\u25A7",
        enabled: () => selectedWorktreePath !== null,
        action: () => setDirStatsOpen(true),
      },
      {
        id: "git:tags",
        label: "Tag Manager",
        category: "Git",
        icon: "\u2691",
        enabled: () => selectedWorktreeId !== null,
        action: () => setTagManagerOpen(true),
      },
      {
        id: "git:log",
        label: "Git Log",
        category: "Git",
        shortcut: "\u2318L",
        icon: "\u2630",
        enabled: () => selectedWorktreeId !== null,
        action: () => setGitLogOpen(true),
      },
      {
        id: "tools:workspaces",
        label: "Workspaces",
        category: "Tools",
        icon: "\u25A1",
        action: () => setWorkspaceManagerOpen(true),
      },
      {
        id: "tools:scheduler",
        label: "Task Scheduler",
        category: "Tools",
        icon: "\u23F0",
        action: () => setTaskSchedulerOpen(true),
      },
      {
        id: "tools:clipboard",
        label: "Clipboard History",
        category: "Tools",
        icon: "\u2398",
        action: () => setClipboardHistoryOpen(true),
      },
      {
        id: "tools:todos",
        label: "Todos",
        category: "Tools",
        icon: "\u2611",
        action: () => setTodoPanelOpen(true),
      },
      {
        id: "nav:quick-switcher",
        label: "Quick Switcher",
        category: "Navigation",
        icon: "\u21C4",
        shortcut: "Cmd+Shift+O",
        action: () => setQuickSwitcherOpen(true),
      },
      {
        id: "ai:error-diagnosis",
        label: "Error Diagnosis",
        category: "AI",
        icon: "\u26A0",
        shortcut: "Cmd+Shift+D",
        action: () => setErrorDiagnosisOpen(true),
      },
      {
        id: "view:morning-briefing",
        label: "Morning Briefing",
        category: "View",
        icon: "\u2600",
        action: () => setMorningBriefingOpen(true),
      },
      {
        id: "view:network-traffic",
        label: "Network Traffic",
        category: "View",
        icon: "\u21C6",
        action: () => setNetworkTabOpen(true),
      },
      {
        id: "git:pr-status",
        label: "PR Status",
        category: "Git",
        icon: "\u2117",
        action: () => setPrStatusOpen(true),
      },
      {
        id: "git:diff-view",
        label: "Git Changes",
        category: "Git",
        icon: "\u00B1",
        action: () => setGitDiffOpen(true),
      },
      {
        id: "git:create-pr",
        label: "Create Pull Request",
        category: "Git",
        icon: "\u2197",
        action: () => setCreatePrOpen(true),
      },
      {
        id: "view:memory-notes",
        label: "Memory Notes",
        category: "View",
        icon: "\u2709",
        action: () => setMemoryTabOpen(true),
      },
      {
        id: "view:shell-history",
        label: "Shell History",
        category: "View",
        icon: "\u2328",
        action: () => setShellHistoryOpen(true),
      },
      {
        id: "view:dead-ends",
        label: "Dead Ends Log",
        category: "View",
        icon: "\u26D4",
        action: () => setDeadEndsOpen(true),
      },
      {
        id: "view:db-schema",
        label: "Database Schema",
        category: "View",
        icon: "\u2637",
        action: () => setDbSchemaOpen(true),
      },
      {
        id: "help:onboarding",
        label: "Setup Wizard",
        category: "Help",
        icon: "\u2699",
        action: () => setOnboardingOpen(true),
      },
      {
        id: "view:browser-events",
        label: "Browser Events",
        category: "View",
        icon: "\u2301",
        action: () => setBrowserEventsOpen(true),
      },
      {
        id: "view:db-explorer",
        label: "Database Explorer",
        category: "View",
        icon: "\u2338",
        action: () => setDbExplorerOpen(true),
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
      { key: "k", meta: true, action: () => setPaletteOpen((p) => !p) },
      { key: "b", meta: true, action: () => setBookmarksOpen((p) => !p) },
      {
        key: "t",
        meta: true,
        action: () => setThemeSelectorOpen((p) => !p),
      },
      {
        key: "/",
        meta: true,
        shift: true,
        action: () => setShortcutsOpen((p) => !p),
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
        action: () => setNotificationsOpen((p) => !p),
      },
      {
        key: "j",
        meta: true,
        action: () => setAiChatOpen((p) => !p),
      },
      {
        key: "p",
        meta: true,
        action: () => setUnifiedSearchOpen((p) => !p),
      },
      {
        key: "e",
        meta: true,
        action: () => setFileExplorerOpen((p) => !p),
      },
      {
        key: "l",
        meta: true,
        action: () => setGitLogOpen((p) => !p),
      },
      {
        key: "o",
        meta: true,
        shift: true,
        action: () => setQuickSwitcherOpen((p) => !p),
      },
      {
        key: "d",
        meta: true,
        shift: true,
        action: () => setErrorDiagnosisOpen((p) => !p),
      },
    ],
    [
      setShowSettings,
      setSelectedWorktreeId,
      setSelectedWorktreePath,
      setSelectedWorktreeName,
      showRightSidebar,
      setShowRightSidebar,
    ],
  );
  useGlobalShortcuts(shortcuts);

  const handleClosePalette = useCallback(() => setPaletteOpen(false), []);
  const handleCloseBookmarks = useCallback(() => setBookmarksOpen(false), []);

  /* Expose sidebar-toolbar actions to parent via ref */
  sidebarActionsRef.current = {
    openSearch: () => setUnifiedSearchOpen(true),
    openAiChat: () => setAiChatOpen(true),
    openNotifications: () => setNotificationsOpen(true),
    openSettings: () => {
      setShowSettings(true);
      setSelectedWorktreeId(null);
      setSelectedWorktreePath(null);
      setSelectedWorktreeName(null);
    },
  };

  const handleDashboardAction = useCallback((action: string) => {
    switch (action) {
      case "terminal":
        break;
      case "git":
        setGitDiffOpen(true);
        break;
      case "ai":
        setAiChatOpen(true);
        break;
      case "search":
        setUnifiedSearchOpen(true);
        break;
      case "security":
        setSecurityAuditOpen(true);
        break;
      case "docker":
        setDockerOpen(true);
        break;
    }
  }, []);

  const handleContentTabChange = useCallback((tab: string) => {
    setContentTab(tab);
    switch (tab) {
      case "changes":
        setGitDiffOpen(true);
        break;
      case "pr":
        setCreatePrOpen(true);
        break;
      case "tests":
        setTestRunnerPanelOpen(true);
        break;
      case "security":
        setSecurityAuditOpen(true);
        break;
      case "docker":
        setDockerOpen(true);
        break;
    }
  }, []);

  return (
    <>
      {showSettings ? (
        <SettingsTab />
      ) : selectedWorktreePath ? (
        <>
          <ContentToolbar
            activeTab={contentTab}
            onTabChange={handleContentTabChange}
            worktreeName={selectedWorktreeName ?? "Shell"}
            projectName={selectedProjectName ?? undefined}
          />
          <TerminalPanel
            cwd={selectedWorktreePath}
            worktreeName={selectedWorktreeName ?? "Shell"}
            themeId={terminalThemeId}
          />
        </>
      ) : (
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
      )}
      <StatusBar
        projectName={selectedProjectName}
        branchName={selectedWorktreeName}
        isGitHubConnected={isGitHubConnected}
      />
      <CommandPalette
        open={paletteOpen}
        onClose={handleClosePalette}
        onExecute={execute}
        search={search}
      />
      {bookmarksOpen && (
        <CommandBookmarks
          projectId={selectedProjectId}
          onClose={handleCloseBookmarks}
        />
      )}
      {themeSelectorOpen && (
        <TerminalThemeSelector
          currentThemeId={terminalThemeId}
          onThemeChange={setTerminalThemeId}
          onClose={() => setThemeSelectorOpen(false)}
        />
      )}
      {taskRunnerOpen && selectedWorktreePath && (
        <TaskRunner
          cwd={selectedWorktreePath}
          onClose={() => setTaskRunnerOpen(false)}
        />
      )}
      {appThemePickerOpen && (
        <AppThemePicker
          currentThemeId={appThemeId}
          onThemeChange={setAppThemeId}
          onClose={() => setAppThemePickerOpen(false)}
        />
      )}
      {themeEditorOpen && (
        <ThemeEditor
          currentThemeId={appThemeId}
          onClose={() => setThemeEditorOpen(false)}
          onThemeSave={(theme) => {
            applyTheme(theme);
            setAppThemeId(theme.id);
          }}
        />
      )}
      {densityPickerOpen && (
        <DensityPicker
          currentMode={densityMode}
          onModeChange={setDensityMode}
          onClose={() => setDensityPickerOpen(false)}
        />
      )}
      {shortcutsOpen && (
        <KeyboardShortcuts onClose={() => setShortcutsOpen(false)} />
      )}
      {cssEditorOpen && (
        <CustomCSSEditor onClose={() => setCssEditorOpen(false)} />
      )}
      {stashManagerOpen && selectedWorktreeId !== null && (
        <StashManager
          worktreeId={selectedWorktreeId}
          onClose={() => setStashManagerOpen(false)}
        />
      )}
      {blameViewOpen && selectedWorktreeId !== null && (
        <BlameView
          worktreeId={selectedWorktreeId}
          filePath={blameFilePath}
          onClose={() => setBlameViewOpen(false)}
        />
      )}
      {branchCompareOpen && selectedWorktreeId !== null && (
        <BranchCompare
          worktreeId={selectedWorktreeId}
          onClose={() => setBranchCompareOpen(false)}
        />
      )}
      {gitHooksOpen && selectedWorktreeId !== null && (
        <GitHooksManager
          worktreeId={selectedWorktreeId}
          onClose={() => setGitHooksOpen(false)}
        />
      )}
      {conflictResolverOpen && selectedWorktreeId !== null && (
        <ConflictResolver
          worktreeId={selectedWorktreeId}
          onClose={() => setConflictResolverOpen(false)}
        />
      )}
      {securityAuditOpen && selectedWorktreePath && (
        <SecurityAudit
          cwd={selectedWorktreePath}
          onClose={() => {
            setSecurityAuditOpen(false);
            setContentTab("terminal");
          }}
        />
      )}
      {secretScannerOpen && selectedWorktreePath && (
        <SecretScanner
          cwd={selectedWorktreePath}
          onClose={() => setSecretScannerOpen(false)}
        />
      )}
      {licenseReportOpen && selectedWorktreePath && (
        <LicenseReport
          cwd={selectedWorktreePath}
          onClose={() => setLicenseReportOpen(false)}
        />
      )}
      {securityHeadersOpen && (
        <SecurityHeaders onClose={() => setSecurityHeadersOpen(false)} />
      )}
      {testRunnerPanelOpen && selectedWorktreePath && (
        <TestRunnerPanel
          cwd={selectedWorktreePath}
          onClose={() => {
            setTestRunnerPanelOpen(false);
            setContentTab("terminal");
          }}
        />
      )}
      {coverageReportOpen && selectedWorktreePath && (
        <CoverageReport
          cwd={selectedWorktreePath}
          onClose={() => setCoverageReportOpen(false)}
        />
      )}
      {benchmarkOpen && selectedWorktreePath && (
        <BenchmarkDashboard
          cwd={selectedWorktreePath}
          onClose={() => setBenchmarkOpen(false)}
        />
      )}
      {dockerOpen && selectedWorktreePath && (
        <DockerPanel
          cwd={selectedWorktreePath}
          onClose={() => {
            setDockerOpen(false);
            setContentTab("terminal");
          }}
        />
      )}
      {dockerImagesOpen && (
        <DockerImages onClose={() => setDockerImagesOpen(false)} />
      )}
      {containerMonitorOpen && (
        <ContainerMonitor onClose={() => setContainerMonitorOpen(false)} />
      )}
      {flakyTestsOpen && selectedWorktreePath && (
        <FlakyTests
          cwd={selectedWorktreePath}
          onClose={() => setFlakyTestsOpen(false)}
        />
      )}
      <NotificationCenter
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />
      {activityTimelineOpen && (
        <ActivityTimeline onClose={() => setActivityTimelineOpen(false)} />
      )}
      {pluginManagerOpen && (
        <PluginManager onClose={() => setPluginManagerOpen(false)} />
      )}
      {backupRestoreOpen && (
        <BackupRestore onClose={() => setBackupRestoreOpen(false)} />
      )}
      {analyticsDashboardOpen && selectedWorktreePath && (
        <AnalyticsDashboard
          cwd={selectedWorktreePath}
          onClose={() => setAnalyticsDashboardOpen(false)}
        />
      )}
      <AiChatSidebar open={aiChatOpen} onClose={() => setAiChatOpen(false)} />
      <UnifiedSearch
        open={unifiedSearchOpen}
        onClose={() => setUnifiedSearchOpen(false)}
        onNavigate={(type, _data) => {
          setUnifiedSearchOpen(false);
          if (type === "bookmark") setBookmarksOpen(true);
          else if (type === "setting") setSettingsPageOpen(true);
        }}
      />
      {settingsPageOpen && (
        <SettingsPage onClose={() => setSettingsPageOpen(false)} />
      )}
      {terminalRecordingOpen && selectedWorktreeId !== null && (
        <TerminalRecording
          worktreeId={selectedWorktreeId}
          onClose={() => setTerminalRecordingOpen(false)}
        />
      )}
      {doraMetricsOpen && selectedProjectId !== null && (
        <DoraMetrics
          projectId={selectedProjectId}
          onClose={() => setDoraMetricsOpen(false)}
        />
      )}
      {webhookEventsOpen && (
        <WebhookEvents onClose={() => setWebhookEventsOpen(false)} />
      )}
      {sshManagerOpen && (
        <SshManager
          onClose={() => setSshManagerOpen(false)}
          onConnect={() => setSshManagerOpen(false)}
        />
      )}
      {gitAnalyticsOpen && selectedWorktreeId !== null && (
        <GitAnalytics
          worktreeId={selectedWorktreeId}
          onClose={() => setGitAnalyticsOpen(false)}
        />
      )}
      {snippetManagerOpen && (
        <SnippetManager
          projectId={selectedProjectId}
          onClose={() => setSnippetManagerOpen(false)}
        />
      )}
      {envDiffOpen && selectedProjectId !== null && (
        <EnvProfileDiff
          projectId={selectedProjectId}
          onClose={() => setEnvDiffOpen(false)}
        />
      )}
      {appPerformanceOpen && (
        <AppPerformance onClose={() => setAppPerformanceOpen(false)} />
      )}
      {fileExplorerOpen && selectedWorktreePath && (
        <FileExplorer
          cwd={selectedWorktreePath}
          onClose={() => setFileExplorerOpen(false)}
          onFileSelect={(path) => {
            setFileExplorerOpen(false);
            setBlameFilePath(path);
            setBlameViewOpen(true);
          }}
        />
      )}
      {projectOverviewOpen && selectedProjectId !== null && (
        <ProjectOverview
          projectId={selectedProjectId}
          onClose={() => setProjectOverviewOpen(false)}
        />
      )}
      {webVitalsOpen && <WebVitals onClose={() => setWebVitalsOpen(false)} />}
      {pluginRuntimeOpen && selectedWorktreePath && (
        <PluginRuntime
          cwd={selectedWorktreePath}
          onClose={() => setPluginRuntimeOpen(false)}
        />
      )}
      {depAnalyzerOpen && selectedWorktreePath && (
        <DependencyAnalyzer
          cwd={selectedWorktreePath}
          onClose={() => setDepAnalyzerOpen(false)}
        />
      )}
      {portScannerOpen && (
        <PortScanner onClose={() => setPortScannerOpen(false)} />
      )}
      {dirStatsOpen && selectedWorktreePath && (
        <DirectoryStats
          cwd={selectedWorktreePath}
          onClose={() => setDirStatsOpen(false)}
        />
      )}
      {tagManagerOpen && selectedWorktreeId !== null && (
        <TagManager
          worktreeId={selectedWorktreeId}
          onClose={() => setTagManagerOpen(false)}
        />
      )}
      {gitLogOpen && selectedWorktreeId !== null && (
        <GitLogViewer
          worktreeId={selectedWorktreeId}
          onClose={() => setGitLogOpen(false)}
        />
      )}
      {workspaceManagerOpen && (
        <WorkspaceManager
          onClose={() => setWorkspaceManagerOpen(false)}
          onLoad={() => setWorkspaceManagerOpen(false)}
        />
      )}
      {taskSchedulerOpen && (
        <TaskScheduler onClose={() => setTaskSchedulerOpen(false)} />
      )}
      {clipboardHistoryOpen && (
        <ClipboardHistory onClose={() => setClipboardHistoryOpen(false)} />
      )}
      {todoPanelOpen && (
        <TodoPanel
          projectId={selectedProjectId}
          onClose={() => setTodoPanelOpen(false)}
        />
      )}
      {morningBriefingOpen && selectedProjectId && (
        <div
          className="panel-overlay"
          onClick={() => setMorningBriefingOpen(false)}
        >
          <div className="panel-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="panel-dialog-header">
              <span>Morning Briefing</span>
              <button
                className="panel-dialog-close"
                onClick={() => setMorningBriefingOpen(false)}
              >
                &times;
              </button>
            </div>
            <MorningBriefing projectId={selectedProjectId} />
          </div>
        </div>
      )}
      {onboardingOpen && (
        <div className="panel-overlay">
          <div className="panel-dialog panel-dialog--wide">
            <OnboardingWizard onComplete={() => setOnboardingOpen(false)} />
          </div>
        </div>
      )}
      {networkTabOpen && (
        <div className="panel-overlay" onClick={() => setNetworkTabOpen(false)}>
          <div
            className="panel-dialog panel-dialog--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-dialog-header">
              <span>Network Traffic</span>
              <button
                className="panel-dialog-close"
                onClick={() => setNetworkTabOpen(false)}
              >
                &times;
              </button>
            </div>
            <NetworkTab />
          </div>
        </div>
      )}
      {prStatusOpen && selectedWorktreeId && (
        <div className="panel-overlay" onClick={() => setPrStatusOpen(false)}>
          <div
            className="panel-dialog panel-dialog--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-dialog-header">
              <span>PR Status</span>
              <button
                className="panel-dialog-close"
                onClick={() => setPrStatusOpen(false)}
              >
                &times;
              </button>
            </div>
            <PRStatusPanel worktreeId={selectedWorktreeId} />
          </div>
        </div>
      )}
      {gitDiffOpen && selectedWorktreeId && (
        <div
          className="panel-overlay"
          onClick={() => {
            setGitDiffOpen(false);
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
                  setGitDiffOpen(false);
                  setContentTab("terminal");
                }}
              >
                &times;
              </button>
            </div>
            <GitDiffView worktreeId={selectedWorktreeId} />
          </div>
        </div>
      )}
      {createPrOpen && selectedWorktreeId && selectedWorktreeName && (
        <div
          className="panel-overlay"
          onClick={() => {
            setCreatePrOpen(false);
            setContentTab("terminal");
          }}
        >
          <div className="panel-dialog" onClick={(e) => e.stopPropagation()}>
            <CreatePRPanel
              worktreeId={selectedWorktreeId}
              branch={selectedWorktreeName}
            />
          </div>
        </div>
      )}
      {memoryTabOpen && selectedWorktreeId && (
        <div className="panel-overlay" onClick={() => setMemoryTabOpen(false)}>
          <div
            className="panel-dialog panel-dialog--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-dialog-header">
              <span>Memory Notes</span>
              <button
                className="panel-dialog-close"
                onClick={() => setMemoryTabOpen(false)}
              >
                &times;
              </button>
            </div>
            <MemoryTab worktreeId={selectedWorktreeId} />
          </div>
        </div>
      )}
      {shellHistoryOpen && selectedProjectId && (
        <div
          className="panel-overlay"
          onClick={() => setShellHistoryOpen(false)}
        >
          <div
            className="panel-dialog panel-dialog--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-dialog-header">
              <span>Shell History</span>
              <button
                className="panel-dialog-close"
                onClick={() => setShellHistoryOpen(false)}
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
      {deadEndsOpen && selectedWorktreeId && (
        <div className="panel-overlay" onClick={() => setDeadEndsOpen(false)}>
          <div className="panel-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="panel-dialog-header">
              <span>Dead Ends Log</span>
              <button
                className="panel-dialog-close"
                onClick={() => setDeadEndsOpen(false)}
              >
                &times;
              </button>
            </div>
            <DeadEndsLog worktreeId={selectedWorktreeId} />
          </div>
        </div>
      )}
      {dbSchemaOpen && selectedWorktreeId && (
        <div className="panel-overlay" onClick={() => setDbSchemaOpen(false)}>
          <div
            className="panel-dialog panel-dialog--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-dialog-header">
              <span>Database Schema</span>
              <button
                className="panel-dialog-close"
                onClick={() => setDbSchemaOpen(false)}
              >
                &times;
              </button>
            </div>
            <DbSchemaTab worktreeId={selectedWorktreeId} />
          </div>
        </div>
      )}
      {browserEventsOpen && selectedWorktreeId && (
        <div
          className="panel-overlay"
          onClick={() => setBrowserEventsOpen(false)}
        >
          <div
            className="panel-dialog panel-dialog--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <BrowserEvents
              worktreeId={selectedWorktreeId}
              onClose={() => setBrowserEventsOpen(false)}
            />
          </div>
        </div>
      )}
      {dbExplorerOpen && selectedWorktreeId && (
        <div className="panel-overlay" onClick={() => setDbExplorerOpen(false)}>
          <div
            className="panel-dialog panel-dialog--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <DatabaseExplorer
              worktreeId={selectedWorktreeId}
              onClose={() => setDbExplorerOpen(false)}
            />
          </div>
        </div>
      )}
      <QuickSwitcher
        open={quickSwitcherOpen}
        onClose={() => setQuickSwitcherOpen(false)}
        selectedProjectId={selectedProjectId}
        onSwitchProject={(id) => {
          setSelectedProjectId(id);
          setQuickSwitcherOpen(false);
        }}
        onSwitchBranch={() => {
          setQuickSwitcherOpen(false);
        }}
      />
      <ErrorDiagnosis
        open={errorDiagnosisOpen}
        onClose={() => setErrorDiagnosisOpen(false)}
      />
      <QuickActions
        worktreeId={selectedWorktreeId}
        worktreePath={selectedWorktreePath}
        projectId={selectedProjectId}
        onAction={(action) => {
          if (action === "commit") execute("git:commit");
          else if (action === "stash") setStashManagerOpen(true);
          else if (action === "diff") setBlameViewOpen(true);
          else if (action === "blame") {
            setBlameFilePath("");
            setBlameViewOpen(true);
          } else if (action === "record") setTerminalRecordingOpen(true);
          else if (action === "tests") setTestRunnerPanelOpen(true);
        }}
      />
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
    <MainLayout
      onOpenSearch={() => sidebarActionsRef.current.openSearch()}
      onOpenAiChat={() => sidebarActionsRef.current.openAiChat()}
      onOpenNotifications={() => sidebarActionsRef.current.openNotifications()}
      onOpenSettings={() => sidebarActionsRef.current.openSettings()}
    >
      <AppContent sidebarActionsRef={sidebarActionsRef} />
    </MainLayout>
  );
}

export default App;
