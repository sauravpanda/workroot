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
import { FocusTrapOverlay } from "./components/FocusTrapOverlay";
import { GlobalErrorToast } from "./components/GlobalErrorToast";
import { invoke } from "@tauri-apps/api/core";
import { MainLayout } from "./layouts/MainLayout";
import { QuickActions } from "./components/QuickActions";
import { StatusBar } from "./components/StatusBar";

// ---------------------------------------------------------------------------
// Lazy-loaded components (behind boolean toggles / conditional panels)
// ---------------------------------------------------------------------------
/* eslint-disable @typescript-eslint/no-explicit-any */
const namedLazy = <K extends string>(
  factory: () => Promise<Record<K, React.ComponentType<any>>>,
  name: K,
): React.LazyExoticComponent<React.ComponentType<any>> =>
  lazy(() => factory().then((m) => ({ default: m[name] })));
/* eslint-enable @typescript-eslint/no-explicit-any */

const AuthButton = namedLazy(
  () => import("./components/AuthButton"),
  "AuthButton",
);
const RepoList = namedLazy(() => import("./components/RepoList"), "RepoList");
const ActiveProjectBadge = namedLazy(
  () => import("./components/ActiveProjectBadge"),
  "ActiveProjectBadge",
);
const TerminalPanel = namedLazy(
  () => import("./components/TerminalPanel"),
  "TerminalPanel",
);
const CommandPalette = namedLazy(
  () => import("./components/CommandPalette"),
  "CommandPalette",
);
const ContentToolbar = namedLazy(
  () => import("./components/ContentToolbar"),
  "ContentToolbar",
);
const EnvPanel = namedLazy(() => import("./components/EnvPanel"), "EnvPanel");
const SettingsTab = namedLazy(
  () => import("./components/SettingsTab"),
  "SettingsTab",
);
const Dashboard = namedLazy(
  () => import("./components/Dashboard"),
  "Dashboard",
);
const CommandBookmarks = namedLazy(
  () => import("./components/CommandBookmarks"),
  "CommandBookmarks",
);
const TerminalThemeSelector = namedLazy(
  () => import("./components/TerminalThemeSelector"),
  "TerminalThemeSelector",
);
const TaskRunner = namedLazy(
  () => import("./components/TaskRunner"),
  "TaskRunner",
);
const AppThemePicker = namedLazy(
  () => import("./components/AppThemePicker"),
  "AppThemePicker",
);
const KeyboardShortcuts = namedLazy(
  () => import("./components/KeyboardShortcuts"),
  "KeyboardShortcuts",
);
const ThemeEditor = namedLazy(
  () => import("./components/ThemeEditor"),
  "ThemeEditor",
);
const DensityPicker = namedLazy(
  () => import("./components/DensityPicker"),
  "DensityPicker",
);
const CustomCSSEditor = namedLazy(
  () => import("./components/CustomCSSEditor"),
  "CustomCSSEditor",
);
const StashManager = namedLazy(
  () => import("./components/StashManager"),
  "StashManager",
);
const CheckpointPanel = namedLazy(
  () => import("./components/CheckpointPanel"),
  "CheckpointPanel",
);
const MultiAgentPipelinePanel = namedLazy(
  () => import("./components/MultiAgentPipelinePanel"),
  "MultiAgentPipelinePanel",
);
const BlameView = namedLazy(
  () => import("./components/BlameView"),
  "BlameView",
);
const BranchCompare = namedLazy(
  () => import("./components/BranchCompare"),
  "BranchCompare",
);
const GitHooksManager = namedLazy(
  () => import("./components/GitHooksManager"),
  "GitHooksManager",
);
const ConflictResolver = namedLazy(
  () => import("./components/ConflictResolver"),
  "ConflictResolver",
);
const SecurityAudit = namedLazy(
  () => import("./components/SecurityAudit"),
  "SecurityAudit",
);
const SecretScanner = namedLazy(
  () => import("./components/SecretScanner"),
  "SecretScanner",
);
const LicenseReport = namedLazy(
  () => import("./components/LicenseReport"),
  "LicenseReport",
);
const SecurityHeaders = namedLazy(
  () => import("./components/SecurityHeaders"),
  "SecurityHeaders",
);
const TestRunnerPanel = namedLazy(
  () => import("./components/TestRunnerPanel"),
  "TestRunnerPanel",
);
const CoverageReport = namedLazy(
  () => import("./components/CoverageReport"),
  "CoverageReport",
);
const BenchmarkDashboard = namedLazy(
  () => import("./components/BenchmarkDashboard"),
  "BenchmarkDashboard",
);
const DockerPanel = namedLazy(
  () => import("./components/DockerPanel"),
  "DockerPanel",
);
const DockerImages = namedLazy(
  () => import("./components/DockerImages"),
  "DockerImages",
);
const ContainerMonitor = namedLazy(
  () => import("./components/ContainerMonitor"),
  "ContainerMonitor",
);
const FlakyTests = namedLazy(
  () => import("./components/FlakyTests"),
  "FlakyTests",
);
const NotificationCenter = namedLazy(
  () => import("./components/NotificationCenter"),
  "NotificationCenter",
);
const ActivityTimeline = namedLazy(
  () => import("./components/ActivityTimeline"),
  "ActivityTimeline",
);
const PluginManager = namedLazy(
  () => import("./components/PluginManager"),
  "PluginManager",
);
const BackupRestore = namedLazy(
  () => import("./components/BackupRestore"),
  "BackupRestore",
);
const AnalyticsDashboard = namedLazy(
  () => import("./components/AnalyticsDashboard"),
  "AnalyticsDashboard",
);
const AiChatSidebar = namedLazy(
  () => import("./components/AiChatSidebar"),
  "AiChatSidebar",
);
const UnifiedSearch = namedLazy(
  () => import("./components/UnifiedSearch"),
  "UnifiedSearch",
);
const SettingsPage = namedLazy(
  () => import("./components/SettingsPage"),
  "SettingsPage",
);
const TerminalRecording = namedLazy(
  () => import("./components/TerminalRecording"),
  "TerminalRecording",
);
const DoraMetrics = namedLazy(
  () => import("./components/DoraMetrics"),
  "DoraMetrics",
);
const WebhookEvents = namedLazy(
  () => import("./components/WebhookEvents"),
  "WebhookEvents",
);
const SshManager = namedLazy(
  () => import("./components/SshManager"),
  "SshManager",
);
const GitAnalytics = namedLazy(
  () => import("./components/GitAnalytics"),
  "GitAnalytics",
);
const SnippetManager = namedLazy(
  () => import("./components/SnippetManager"),
  "SnippetManager",
);
const EnvProfileDiff = namedLazy(
  () => import("./components/EnvProfileDiff"),
  "EnvProfileDiff",
);
const AppPerformance = namedLazy(
  () => import("./components/AppPerformance"),
  "AppPerformance",
);
const FileExplorer = namedLazy(
  () => import("./components/FileExplorer"),
  "FileExplorer",
);
const ProjectOverview = namedLazy(
  () => import("./components/ProjectOverview"),
  "ProjectOverview",
);
const WebVitals = namedLazy(
  () => import("./components/WebVitals"),
  "WebVitals",
);
const PluginRuntime = namedLazy(
  () => import("./components/PluginRuntime"),
  "PluginRuntime",
);
const DependencyAnalyzer = namedLazy(
  () => import("./components/DependencyAnalyzer"),
  "DependencyAnalyzer",
);
const PortScanner = namedLazy(
  () => import("./components/PortScanner"),
  "PortScanner",
);
const DirectoryStats = namedLazy(
  () => import("./components/DirectoryStats"),
  "DirectoryStats",
);
const TagManager = namedLazy(
  () => import("./components/TagManager"),
  "TagManager",
);
const GitLogViewer = namedLazy(
  () => import("./components/GitLogViewer"),
  "GitLogViewer",
);
const WorkspaceManager = namedLazy(
  () => import("./components/WorkspaceManager"),
  "WorkspaceManager",
);
const TaskScheduler = namedLazy(
  () => import("./components/TaskScheduler"),
  "TaskScheduler",
);
const ClipboardHistory = namedLazy(
  () => import("./components/ClipboardHistory"),
  "ClipboardHistory",
);
const TodoPanel = namedLazy(
  () => import("./components/TodoPanel"),
  "TodoPanel",
);
const QuickSwitcher = namedLazy(
  () => import("./components/QuickSwitcher"),
  "QuickSwitcher",
);
const ErrorDiagnosis = namedLazy(
  () => import("./components/ErrorDiagnosis"),
  "ErrorDiagnosis",
);
const MorningBriefing = namedLazy(
  () => import("./components/MorningBriefing"),
  "MorningBriefing",
);
const OnboardingWizard = namedLazy(
  () => import("./components/OnboardingWizard"),
  "OnboardingWizard",
);
const NetworkTab = namedLazy(
  () => import("./components/NetworkTab"),
  "NetworkTab",
);
const PRStatusPanel = namedLazy(
  () => import("./components/PRStatusPanel"),
  "PRStatusPanel",
);
const GitDiffView = namedLazy(
  () => import("./components/GitDiffView"),
  "GitDiffView",
);
const CreatePRPanel = namedLazy(
  () => import("./components/CreatePRPanel"),
  "CreatePRPanel",
);
const MemoryTab = namedLazy(
  () => import("./components/MemoryTab"),
  "MemoryTab",
);
const ShellHistoryTab = namedLazy(
  () => import("./components/ShellHistoryTab"),
  "ShellHistoryTab",
);
const DeadEndsLog = namedLazy(
  () => import("./components/DeadEndsLog"),
  "DeadEndsLog",
);
const DbSchemaTab = namedLazy(
  () => import("./components/DbSchemaTab"),
  "DbSchemaTab",
);
const BrowserEvents = namedLazy(
  () => import("./components/BrowserEvents"),
  "BrowserEvents",
);
const DatabaseExplorer = namedLazy(
  () => import("./components/DatabaseExplorer"),
  "DatabaseExplorer",
);
import { DEFAULT_THEME_ID } from "./lib/terminalThemes";
import { getAppThemeById } from "./themes/builtin";
import { applyTheme, loadSavedThemeId, type AppTheme } from "./themes/engine";
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
    markAgentNeedsAttention,
  } = useUiStore();

  const [isGitHubConnected, setIsGitHubConnected] = useState(false);
  useEffect(() => {
    const check = () =>
      invoke<boolean>("github_check_auth")
        .then(setIsGitHubConnected)
        .catch((err: unknown) => {
          // Only mark as disconnected for auth failures, not network errors
          const msg = String(err).toLowerCase();
          if (
            msg.includes("network") ||
            msg.includes("fetch") ||
            msg.includes("timeout")
          ) {
            // Network error — keep the previous auth state
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
    <Suspense fallback={null}>
      {showSettings ? (
        <PanelBoundary name="Settings">
          <SettingsTab />
        </PanelBoundary>
      ) : !selectedWorktreePath ? (
        <div className="content-scroll">
          <div className="content-inner">
            <PanelBoundary name="Dashboard">
              <Dashboard
                projectId={selectedProjectId}
                onAction={handleDashboardAction}
              />
            </PanelBoundary>
            <ActiveProjectBadge />
            <AuthButton />
            <PanelBoundary name="RepoList">
              <RepoList />
            </PanelBoundary>
            {selectedProjectId !== null && (
              <PanelBoundary name="EnvPanel">
                <EnvPanel projectId={selectedProjectId} />
              </PanelBoundary>
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
          <PanelBoundary name="Terminal">
            <TerminalPanel
              cwd={lastWorktreePathRef.current}
              worktreeName={
                selectedWorktreeName ?? lastWorktreeNameRef.current ?? "Shell"
              }
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
      <PanelBoundary name="CommandPalette">
        <CommandPalette
          open={panels.palette}
          onClose={handleClosePalette}
          onExecute={execute}
          search={search}
        />
      </PanelBoundary>
      {panels.bookmarks && (
        <PanelBoundary name="CommandBookmarks">
          <CommandBookmarks
            projectId={selectedProjectId}
            onClose={handleCloseBookmarks}
          />
        </PanelBoundary>
      )}
      {panels.themeSelector && (
        <PanelBoundary name="TerminalThemeSelector">
          <TerminalThemeSelector
            currentThemeId={terminalThemeId}
            onThemeChange={setTerminalThemeId}
            onClose={() => closePanel("themeSelector")}
          />
        </PanelBoundary>
      )}
      {panels.taskRunner && selectedWorktreePath && (
        <PanelBoundary name="TaskRunner">
          <TaskRunner
            cwd={selectedWorktreePath}
            onClose={() => closePanel("taskRunner")}
          />
        </PanelBoundary>
      )}
      {panels.appThemePicker && (
        <PanelBoundary name="AppThemePicker">
          <AppThemePicker
            currentThemeId={appThemeId}
            onThemeChange={setAppThemeId}
            onClose={() => closePanel("appThemePicker")}
          />
        </PanelBoundary>
      )}
      {panels.themeEditor && (
        <PanelBoundary name="ThemeEditor">
          <ThemeEditor
            currentThemeId={appThemeId}
            onClose={() => closePanel("themeEditor")}
            onThemeSave={(theme: AppTheme) => {
              applyTheme(theme);
              setAppThemeId(theme.id);
            }}
          />
        </PanelBoundary>
      )}
      {panels.densityPicker && (
        <PanelBoundary name="DensityPicker">
          <DensityPicker
            currentMode={densityMode}
            onModeChange={setDensityMode}
            onClose={() => closePanel("densityPicker")}
          />
        </PanelBoundary>
      )}
      {panels.shortcuts && (
        <PanelBoundary name="KeyboardShortcuts">
          <KeyboardShortcuts onClose={() => closePanel("shortcuts")} />
        </PanelBoundary>
      )}
      {panels.cssEditor && (
        <PanelBoundary name="CustomCSSEditor">
          <CustomCSSEditor onClose={() => closePanel("cssEditor")} />
        </PanelBoundary>
      )}
      {panels.stashManager && selectedWorktreeId !== null && (
        <PanelBoundary name="StashManager">
          <StashManager
            worktreeId={selectedWorktreeId}
            onClose={() => closePanel("stashManager")}
          />
        </PanelBoundary>
      )}
      {panels.checkpointManager && selectedWorktreeId !== null && (
        <PanelBoundary name="CheckpointPanel">
          <CheckpointPanel
            worktreeId={selectedWorktreeId}
            onClose={() => closePanel("checkpointManager")}
          />
        </PanelBoundary>
      )}
      {panels.multiAgentPipeline && selectedWorktreeId !== null && (
        <PanelBoundary name="MultiAgentPipeline">
          <MultiAgentPipelinePanel
            worktreeId={selectedWorktreeId}
            onClose={() => closePanel("multiAgentPipeline")}
          />
        </PanelBoundary>
      )}
      {panels.blameView && selectedWorktreeId !== null && (
        <PanelBoundary name="BlameView">
          <BlameView
            worktreeId={selectedWorktreeId}
            filePath={blameFilePath}
            onClose={() => closePanel("blameView")}
          />
        </PanelBoundary>
      )}
      {panels.branchCompare && selectedWorktreeId !== null && (
        <PanelBoundary name="BranchCompare">
          <BranchCompare
            worktreeId={selectedWorktreeId}
            onClose={() => closePanel("branchCompare")}
          />
        </PanelBoundary>
      )}
      {panels.gitHooks && selectedWorktreeId !== null && (
        <PanelBoundary name="GitHooksManager">
          <GitHooksManager
            worktreeId={selectedWorktreeId}
            onClose={() => closePanel("gitHooks")}
          />
        </PanelBoundary>
      )}
      {panels.conflictResolver && selectedWorktreeId !== null && (
        <PanelBoundary name="ConflictResolver">
          <ConflictResolver
            worktreeId={selectedWorktreeId}
            onClose={() => closePanel("conflictResolver")}
          />
        </PanelBoundary>
      )}
      {panels.securityAudit && selectedWorktreePath && (
        <PanelBoundary name="SecurityAudit">
          <SecurityAudit
            cwd={selectedWorktreePath}
            onClose={() => {
              closePanel("securityAudit");
              setContentTab("terminal");
            }}
          />
        </PanelBoundary>
      )}
      {panels.secretScanner && selectedWorktreePath && (
        <PanelBoundary name="SecretScanner">
          <SecretScanner
            cwd={selectedWorktreePath}
            onClose={() => closePanel("secretScanner")}
          />
        </PanelBoundary>
      )}
      {panels.licenseReport && selectedWorktreePath && (
        <PanelBoundary name="LicenseReport">
          <LicenseReport
            cwd={selectedWorktreePath}
            onClose={() => closePanel("licenseReport")}
          />
        </PanelBoundary>
      )}
      {panels.securityHeaders && (
        <PanelBoundary name="SecurityHeaders">
          <SecurityHeaders onClose={() => closePanel("securityHeaders")} />
        </PanelBoundary>
      )}
      {panels.testRunnerPanel && selectedWorktreePath && (
        <PanelBoundary name="TestRunner">
          <TestRunnerPanel
            cwd={selectedWorktreePath}
            onClose={() => {
              closePanel("testRunnerPanel");
              setContentTab("terminal");
            }}
          />
        </PanelBoundary>
      )}
      {panels.coverageReport && selectedWorktreePath && (
        <PanelBoundary name="CoverageReport">
          <CoverageReport
            cwd={selectedWorktreePath}
            onClose={() => closePanel("coverageReport")}
          />
        </PanelBoundary>
      )}
      {panels.benchmark && selectedWorktreePath && (
        <PanelBoundary name="Benchmark">
          <BenchmarkDashboard
            cwd={selectedWorktreePath}
            onClose={() => closePanel("benchmark")}
          />
        </PanelBoundary>
      )}
      {panels.docker && selectedWorktreePath && (
        <PanelBoundary name="Docker">
          <DockerPanel
            cwd={selectedWorktreePath}
            onClose={() => {
              closePanel("docker");
              setContentTab("terminal");
            }}
          />
        </PanelBoundary>
      )}
      {panels.dockerImages && (
        <PanelBoundary name="DockerImages">
          <DockerImages onClose={() => closePanel("dockerImages")} />
        </PanelBoundary>
      )}
      {panels.containerMonitor && (
        <PanelBoundary name="ContainerMonitor">
          <ContainerMonitor onClose={() => closePanel("containerMonitor")} />
        </PanelBoundary>
      )}
      {panels.flakyTests && selectedWorktreePath && (
        <PanelBoundary name="FlakyTests">
          <FlakyTests
            cwd={selectedWorktreePath}
            onClose={() => closePanel("flakyTests")}
          />
        </PanelBoundary>
      )}
      <PanelBoundary name="NotificationCenter">
        <NotificationCenter
          open={panels.notifications}
          onClose={() => closePanel("notifications")}
        />
      </PanelBoundary>
      {panels.activityTimeline && (
        <PanelBoundary name="ActivityTimeline">
          <ActivityTimeline onClose={() => closePanel("activityTimeline")} />
        </PanelBoundary>
      )}
      {panels.pluginManager && (
        <PanelBoundary name="PluginManager">
          <PluginManager onClose={() => closePanel("pluginManager")} />
        </PanelBoundary>
      )}
      {panels.backupRestore && (
        <PanelBoundary name="BackupRestore">
          <BackupRestore onClose={() => closePanel("backupRestore")} />
        </PanelBoundary>
      )}
      {panels.analyticsDashboard && selectedWorktreePath && (
        <PanelBoundary name="AnalyticsDashboard">
          <AnalyticsDashboard
            cwd={selectedWorktreePath}
            onClose={() => closePanel("analyticsDashboard")}
          />
        </PanelBoundary>
      )}
      <PanelBoundary name="AiChat">
        <AiChatSidebar
          open={panels.aiChat}
          onClose={() => closePanel("aiChat")}
        />
      </PanelBoundary>
      <PanelBoundary name="UnifiedSearch">
        <UnifiedSearch
          open={panels.unifiedSearch}
          onClose={() => closePanel("unifiedSearch")}
          onNavigate={(type: string, _data: string) => {
            closePanel("unifiedSearch");
            if (type === "bookmark") openPanel("bookmarks");
            else if (type === "setting") openPanel("settingsPage");
          }}
        />
      </PanelBoundary>
      {panels.settingsPage && (
        <PanelBoundary name="SettingsPage">
          <SettingsPage onClose={() => closePanel("settingsPage")} />
        </PanelBoundary>
      )}
      {panels.terminalRecording && selectedWorktreeId !== null && (
        <PanelBoundary name="TerminalRecording">
          <TerminalRecording
            worktreeId={selectedWorktreeId}
            onClose={() => closePanel("terminalRecording")}
          />
        </PanelBoundary>
      )}
      {panels.doraMetrics && selectedProjectId !== null && (
        <PanelBoundary name="DoraMetrics">
          <DoraMetrics
            projectId={selectedProjectId}
            onClose={() => closePanel("doraMetrics")}
          />
        </PanelBoundary>
      )}
      {panels.webhookEvents && (
        <PanelBoundary name="WebhookEvents">
          <WebhookEvents onClose={() => closePanel("webhookEvents")} />
        </PanelBoundary>
      )}
      {panels.sshManager && (
        <PanelBoundary name="SshManager">
          <SshManager
            onClose={() => closePanel("sshManager")}
            onConnect={() => closePanel("sshManager")}
          />
        </PanelBoundary>
      )}
      {panels.gitAnalytics && selectedWorktreeId !== null && (
        <PanelBoundary name="GitAnalytics">
          <GitAnalytics
            worktreeId={selectedWorktreeId}
            onClose={() => closePanel("gitAnalytics")}
          />
        </PanelBoundary>
      )}
      {panels.snippetManager && (
        <PanelBoundary name="SnippetManager">
          <SnippetManager
            projectId={selectedProjectId}
            onClose={() => closePanel("snippetManager")}
          />
        </PanelBoundary>
      )}
      {panels.envDiff && selectedProjectId !== null && (
        <PanelBoundary name="EnvProfileDiff">
          <EnvProfileDiff
            projectId={selectedProjectId}
            onClose={() => closePanel("envDiff")}
          />
        </PanelBoundary>
      )}
      {panels.appPerformance && (
        <PanelBoundary name="AppPerformance">
          <AppPerformance onClose={() => closePanel("appPerformance")} />
        </PanelBoundary>
      )}
      {panels.fileExplorer && selectedWorktreePath && (
        <PanelBoundary name="FileExplorer">
          <FileExplorer
            cwd={selectedWorktreePath}
            onClose={() => closePanel("fileExplorer")}
            onFileSelect={(path: string) => {
              closePanel("fileExplorer");
              setBlameFilePath(path);
              openPanel("blameView");
            }}
          />
        </PanelBoundary>
      )}
      {panels.projectOverview && selectedProjectId !== null && (
        <PanelBoundary name="ProjectOverview">
          <ProjectOverview
            projectId={selectedProjectId}
            onClose={() => closePanel("projectOverview")}
          />
        </PanelBoundary>
      )}
      {panels.webVitals && (
        <PanelBoundary name="WebVitals">
          <WebVitals onClose={() => closePanel("webVitals")} />
        </PanelBoundary>
      )}
      {panels.pluginRuntime && selectedWorktreePath && (
        <PanelBoundary name="PluginRuntime">
          <PluginRuntime
            cwd={selectedWorktreePath}
            onClose={() => closePanel("pluginRuntime")}
          />
        </PanelBoundary>
      )}
      {panels.depAnalyzer && selectedWorktreePath && (
        <PanelBoundary name="DependencyAnalyzer">
          <DependencyAnalyzer
            cwd={selectedWorktreePath}
            onClose={() => closePanel("depAnalyzer")}
          />
        </PanelBoundary>
      )}
      {panels.portScanner && (
        <PanelBoundary name="PortScanner">
          <PortScanner onClose={() => closePanel("portScanner")} />
        </PanelBoundary>
      )}
      {panels.dirStats && selectedWorktreePath && (
        <PanelBoundary name="DirectoryStats">
          <DirectoryStats
            cwd={selectedWorktreePath}
            onClose={() => closePanel("dirStats")}
          />
        </PanelBoundary>
      )}
      {panels.tagManager && selectedWorktreeId !== null && (
        <PanelBoundary name="TagManager">
          <TagManager
            worktreeId={selectedWorktreeId}
            onClose={() => closePanel("tagManager")}
          />
        </PanelBoundary>
      )}
      {panels.gitLog && selectedWorktreeId !== null && (
        <PanelBoundary name="GitLogViewer">
          <GitLogViewer
            worktreeId={selectedWorktreeId}
            onClose={() => closePanel("gitLog")}
          />
        </PanelBoundary>
      )}
      {panels.workspaceManager && (
        <PanelBoundary name="WorkspaceManager">
          <WorkspaceManager
            onClose={() => closePanel("workspaceManager")}
            onLoad={() => closePanel("workspaceManager")}
          />
        </PanelBoundary>
      )}
      {panels.taskScheduler && (
        <PanelBoundary name="TaskScheduler">
          <TaskScheduler onClose={() => closePanel("taskScheduler")} />
        </PanelBoundary>
      )}
      {panels.clipboardHistory && (
        <PanelBoundary name="ClipboardHistory">
          <ClipboardHistory onClose={() => closePanel("clipboardHistory")} />
        </PanelBoundary>
      )}
      {panels.todoPanel && (
        <PanelBoundary name="TodoPanel">
          <TodoPanel
            projectId={selectedProjectId}
            onClose={() => closePanel("todoPanel")}
          />
        </PanelBoundary>
      )}
      {panels.morningBriefing && selectedProjectId && (
        <PanelBoundary name="MorningBriefing">
          <FocusTrapOverlay onClick={() => closePanel("morningBriefing")}>
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
          </FocusTrapOverlay>
        </PanelBoundary>
      )}
      {panels.onboarding && (
        <PanelBoundary name="Onboarding">
          <FocusTrapOverlay onClick={() => closePanel("onboarding")}>
            <div
              className="panel-dialog panel-dialog--wide"
              onClick={(e) => e.stopPropagation()}
            >
              <OnboardingWizard
                onComplete={() => closePanel("onboarding")}
                onClose={() => closePanel("onboarding")}
              />
            </div>
          </FocusTrapOverlay>
        </PanelBoundary>
      )}
      {panels.networkTab && (
        <PanelBoundary name="NetworkTab">
          <FocusTrapOverlay onClick={() => closePanel("networkTab")}>
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
          </FocusTrapOverlay>
        </PanelBoundary>
      )}
      {panels.prStatus && selectedWorktreeId && (
        <PanelBoundary name="PRStatus">
          <FocusTrapOverlay onClick={() => closePanel("prStatus")}>
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
          </FocusTrapOverlay>
        </PanelBoundary>
      )}
      {panels.gitDiff && selectedWorktreeId && (
        <PanelBoundary name="GitDiff">
          <FocusTrapOverlay
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
          </FocusTrapOverlay>
        </PanelBoundary>
      )}
      {panels.createPr && selectedWorktreeId && selectedWorktreeName && (
        <PanelBoundary name="CreatePR">
          <FocusTrapOverlay
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
          </FocusTrapOverlay>
        </PanelBoundary>
      )}
      {panels.memoryTab && selectedWorktreeId && (
        <PanelBoundary name="MemoryTab">
          <FocusTrapOverlay onClick={() => closePanel("memoryTab")}>
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
          </FocusTrapOverlay>
        </PanelBoundary>
      )}
      {panels.shellHistory && selectedProjectId && (
        <PanelBoundary name="ShellHistory">
          <FocusTrapOverlay onClick={() => closePanel("shellHistory")}>
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
          </FocusTrapOverlay>
        </PanelBoundary>
      )}
      {panels.deadEnds && selectedWorktreeId && (
        <PanelBoundary name="DeadEnds">
          <FocusTrapOverlay onClick={() => closePanel("deadEnds")}>
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
          </FocusTrapOverlay>
        </PanelBoundary>
      )}
      {panels.dbSchema && selectedWorktreeId && (
        <PanelBoundary name="DbSchema">
          <FocusTrapOverlay onClick={() => closePanel("dbSchema")}>
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
          </FocusTrapOverlay>
        </PanelBoundary>
      )}
      {panels.browserEvents && selectedWorktreeId && (
        <PanelBoundary name="BrowserEvents">
          <FocusTrapOverlay onClick={() => closePanel("browserEvents")}>
            <div
              className="panel-dialog panel-dialog--wide"
              onClick={(e) => e.stopPropagation()}
            >
              <BrowserEvents
                worktreeId={selectedWorktreeId}
                onClose={() => closePanel("browserEvents")}
              />
            </div>
          </FocusTrapOverlay>
        </PanelBoundary>
      )}
      {panels.dbExplorer && selectedWorktreeId && (
        <PanelBoundary name="DatabaseExplorer">
          <FocusTrapOverlay onClick={() => closePanel("dbExplorer")}>
            <div
              className="panel-dialog panel-dialog--wide"
              onClick={(e) => e.stopPropagation()}
            >
              <DatabaseExplorer
                worktreeId={selectedWorktreeId}
                onClose={() => closePanel("dbExplorer")}
              />
            </div>
          </FocusTrapOverlay>
        </PanelBoundary>
      )}
      <PanelBoundary name="QuickSwitcher">
        <QuickSwitcher
          open={panels.quickSwitcher}
          onClose={() => closePanel("quickSwitcher")}
          selectedProjectId={selectedProjectId}
          onSwitchProject={(id: number) => {
            setSelectedProjectId(id);
            closePanel("quickSwitcher");
          }}
          onSwitchBranch={() => {
            closePanel("quickSwitcher");
          }}
        />
      </PanelBoundary>
      <PanelBoundary name="ErrorDiagnosis">
        <ErrorDiagnosis
          open={panels.errorDiagnosis}
          onClose={() => closePanel("errorDiagnosis")}
        />
      </PanelBoundary>
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
