import { useState, useCallback, useMemo } from "react";
import { MainLayout } from "./layouts/MainLayout";
import { AuthButton } from "./components/AuthButton";
import { RepoList } from "./components/RepoList";
import { EnvPanel } from "./components/EnvPanel";
import { ActiveProjectBadge } from "./components/ActiveProjectBadge";
import { SettingsTab } from "./components/SettingsTab";
import { TerminalPanel } from "./components/TerminalPanel";
import { CommandPalette } from "./components/CommandPalette";
import { useUiStore } from "./stores/uiStore";
import {
  useCommandRegistry,
  useGlobalShortcuts,
} from "./hooks/useCommandRegistry";
import type { Command } from "./hooks/useCommandRegistry";

function AppContent() {
  const {
    selectedProjectId,
    selectedWorktreePath,
    selectedWorktreeName,
    showSettings,
    setShowSettings,
    setSelectedWorktreeId,
    setSelectedWorktreePath,
    setSelectedWorktreeName,
  } = useUiStore();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const { register, execute, search } = useCommandRegistry();

  // Build commands from current app state
  const commands: Command[] = useMemo(
    () => [
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
        id: "palette:toggle",
        label: "Toggle Command Palette",
        category: "General",
        shortcut: "\u2318K",
        icon: "\u2315",
        action: () => setPaletteOpen((prev) => !prev),
      },
    ],
    [
      showSettings,
      selectedWorktreePath,
      setShowSettings,
      setSelectedWorktreeId,
      setSelectedWorktreePath,
      setSelectedWorktreeName,
    ],
  );

  // Register commands whenever they change
  useMemo(() => register(commands), [commands, register]);

  // Global keyboard shortcuts
  const shortcuts = useMemo(
    () => [
      { key: "k", meta: true, action: () => setPaletteOpen((p) => !p) },
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
    ],
    [
      setShowSettings,
      setSelectedWorktreeId,
      setSelectedWorktreePath,
      setSelectedWorktreeName,
    ],
  );
  useGlobalShortcuts(shortcuts);

  const handleClosePalette = useCallback(() => setPaletteOpen(false), []);

  return (
    <>
      {showSettings ? (
        <SettingsTab />
      ) : selectedWorktreePath ? (
        <TerminalPanel
          cwd={selectedWorktreePath}
          worktreeName={selectedWorktreeName ?? "Shell"}
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
