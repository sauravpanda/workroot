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
import { CustomCSSEditor } from "./components/CustomCSSEditor";
import { DEFAULT_THEME_ID } from "./lib/terminalThemes";
import { getAppThemeById } from "./themes/builtin";
import { applyTheme, loadSavedThemeId } from "./themes/engine";
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
  const [cssEditorOpen, setCssEditorOpen] = useState(false);
  const [appThemeId, setAppThemeId] = useState("midnight");
  const [terminalThemeId, setTerminalThemeId] = useState(DEFAULT_THEME_ID);
  const { register, execute, search } = useCommandRegistry();

  // Load saved app theme, terminal theme, and custom CSS
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
        id: "css:editor",
        label: "Custom CSS",
        category: "Appearance",
        icon: "{ }",
        action: () => setCssEditorOpen(true),
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
      {cssEditorOpen && (
        <CustomCSSEditor onClose={() => setCssEditorOpen(false)} />
      )}
      {shortcutsOpen && (
        <KeyboardShortcuts onClose={() => setShortcutsOpen(false)} />
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
