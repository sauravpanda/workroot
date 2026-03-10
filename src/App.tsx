import { useState, useCallback, useMemo, useEffect } from "react";
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

function AppContent() {
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
  const [blameFilePath, setBlameFilePath] = useState("");
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

  return (
    <>
      {showSettings ? (
        <SettingsTab />
      ) : selectedWorktreePath ? (
        <TerminalPanel
          cwd={selectedWorktreePath}
          worktreeName={selectedWorktreeName ?? "Shell"}
          themeId={terminalThemeId}
        />
      ) : (
        <div className="content-scroll">
          <div className="content-inner">
            <h1>Workroot</h1>
            <p>Local Intelligence Platform for AI-Native Development</p>
            <ActiveProjectBadge />
            <AuthButton />
            <RepoList />
            {selectedProjectId !== null && (
              <EnvPanel projectId={selectedProjectId} />
            )}
          </div>
        </div>
      )}
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
          onClose={() => setSecurityAuditOpen(false)}
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
          onClose={() => setTestRunnerPanelOpen(false)}
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
          onClose={() => setDockerOpen(false)}
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
    </>
  );
}

function App() {
  return (
    <MainLayout>
      <AppContent />
    </MainLayout>
  );
}

export default App;
