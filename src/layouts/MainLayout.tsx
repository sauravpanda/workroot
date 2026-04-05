import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar } from "../components/Sidebar";
import { GitHubSidebar } from "../components/GitHubSidebar";
import { UiContext } from "../stores/uiStore";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ProjectTabBar, type ProjectTab } from "../components/ProjectTabBar";

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 260;
const STORAGE_KEY = "workroot:sidebar-width";

const RIGHT_SIDEBAR_MIN = 200;
const RIGHT_SIDEBAR_MAX = 500;
const RIGHT_SIDEBAR_DEFAULT = 280;
const RIGHT_STORAGE_KEY = "workroot:right-sidebar-width";

const OPEN_TABS_KEY = "workroot:open-project-tabs";
const TAB_BAR_HEIGHT = 32;

function getSavedWidth(): number {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const n = parseInt(saved, 10);
      if (n >= SIDEBAR_MIN && n <= SIDEBAR_MAX) return n;
    }
  } catch {
    // ignore
  }
  return SIDEBAR_DEFAULT;
}

function getSavedRightWidth(): number {
  try {
    const saved = localStorage.getItem(RIGHT_STORAGE_KEY);
    if (saved) {
      const n = parseInt(saved, 10);
      if (n >= RIGHT_SIDEBAR_MIN && n <= RIGHT_SIDEBAR_MAX) return n;
    }
  } catch {
    // ignore
  }
  return RIGHT_SIDEBAR_DEFAULT;
}

function getSavedOpenTabIds(): number[] {
  try {
    const saved = localStorage.getItem(OPEN_TABS_KEY);
    if (saved) return JSON.parse(saved) as number[];
  } catch {
    // ignore
  }
  return [];
}

interface MainLayoutProps {
  children: React.ReactNode;
  onOpenSearch?: () => void;
  onOpenAiChat?: () => void;
  onOpenNotifications?: () => void;
  onOpenSettings?: () => void;
}

export function MainLayout({
  children,
  onOpenSearch,
  onOpenAiChat,
  onOpenNotifications,
  onOpenSettings,
}: MainLayoutProps) {
  const [sidebarWidth, setSidebarWidth] = useState(getSavedWidth);
  const [rightSidebarWidth, setRightSidebarWidth] =
    useState(getSavedRightWidth);
  const [selectedProjectId, setSelectedProjectIdRaw] = useState<number | null>(
    null,
  );
  const [selectedWorktreeId, setSelectedWorktreeId] = useState<number | null>(
    null,
  );
  const [selectedWorktreePath, setSelectedWorktreePath] = useState<
    string | null
  >(null);
  const [selectedWorktreeName, setSelectedWorktreeName] = useState<
    string | null
  >(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [agentDoneWorktreeIds, setAgentDoneWorktreeIds] = useState<Set<number>>(
    () => new Set(),
  );

  // Project tabs state
  const [allProjects, setAllProjects] = useState<ProjectTab[]>([]);
  const [openTabIds, setOpenTabIds] = useState<number[]>(getSavedOpenTabIds);

  // Fetch project list on mount
  useEffect(() => {
    invoke<{ id: number; name: string }[]>("list_projects")
      .then((projects) =>
        setAllProjects(projects.map((p) => ({ id: p.id, name: p.name }))),
      )
      .catch(() => {});
  }, []);

  // Persist open tab IDs
  useEffect(() => {
    try {
      localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(openTabIds));
    } catch {
      // ignore
    }
  }, [openTabIds]);

  // Auto-add project to open tabs when selected
  const setSelectedProjectId = useCallback((id: number | null) => {
    setSelectedProjectIdRaw(id);
    if (id !== null) {
      setOpenTabIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }
  }, []);

  // The tabs to display: open IDs that still exist in allProjects
  const visibleTabs = openTabIds
    .map((id) => allProjects.find((p) => p.id === id))
    .filter((p): p is ProjectTab => p !== undefined);

  const handleTabSelect = useCallback((id: number) => {
    setSelectedProjectIdRaw(id);
    // Reset worktree selection when switching projects
    setSelectedWorktreeId(null);
    setSelectedWorktreePath(null);
    setSelectedWorktreeName(null);
    setShowSettings(false);
  }, []);

  const handleTabClose = useCallback(
    (id: number) => {
      setOpenTabIds((prev) => prev.filter((tid) => tid !== id));
      // If closing the active project, switch to the nearest remaining tab
      setSelectedProjectIdRaw((current) => {
        if (current !== id) return current;
        const remaining = openTabIds.filter((tid) => tid !== id);
        const next = remaining[remaining.length - 1] ?? null;
        if (next !== current) {
          setSelectedWorktreeId(null);
          setSelectedWorktreePath(null);
          setSelectedWorktreeName(null);
        }
        return next;
      });
    },
    [openTabIds],
  );

  // Keyboard shortcuts: Cmd+1..9 to switch tabs
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9) {
        const tab = visibleTabs[num - 1];
        if (tab) {
          e.preventDefault();
          handleTabSelect(tab.id);
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [visibleTabs, handleTabSelect]);

  const markAgentDone = useCallback((id: number) => {
    setAgentDoneWorktreeIds((prev) => new Set(prev).add(id));
  }, []);

  const clearAgentDone = useCallback((id: number) => {
    setAgentDoneWorktreeIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const dragging = useRef(false);
  const draggingRight = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const handleRightMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRight.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragging.current) {
        const width = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, e.clientX));
        setSidebarWidth(width);
      }
      if (draggingRight.current) {
        const width = Math.min(
          RIGHT_SIDEBAR_MAX,
          Math.max(RIGHT_SIDEBAR_MIN, window.innerWidth - e.clientX),
        );
        setRightSidebarWidth(width);
      }
    };

    const handleMouseUp = () => {
      if (dragging.current) {
        dragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
      if (draggingRight.current) {
        draggingRight.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(sidebarWidth));
    } catch {
      // ignore
    }
  }, [sidebarWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(RIGHT_STORAGE_KEY, String(rightSidebarWidth));
    } catch {
      // ignore
    }
  }, [rightSidebarWidth]);

  const showTabBar = visibleTabs.length > 0;

  return (
    <UiContext.Provider
      value={{
        selectedProjectId,
        setSelectedProjectId,
        selectedWorktreeId,
        setSelectedWorktreeId,
        selectedWorktreePath,
        setSelectedWorktreePath,
        selectedWorktreeName,
        setSelectedWorktreeName,
        showSettings,
        setShowSettings,
        showRightSidebar,
        setShowRightSidebar,
        agentDoneWorktreeIds,
        markAgentDone,
        clearAgentDone,
      }}
    >
      {showTabBar && (
        <ProjectTabBar
          tabs={visibleTabs}
          activeId={selectedProjectId}
          onSelect={handleTabSelect}
          onClose={handleTabClose}
        />
      )}
      <div
        className="main-layout"
        style={
          showTabBar
            ? {
                marginTop: TAB_BAR_HEIGHT,
                height: `calc(100vh - 24px - ${TAB_BAR_HEIGHT}px)`,
              }
            : undefined
        }
      >
        <div className="sidebar-panel" style={{ width: sidebarWidth }}>
          <ErrorBoundary name="Sidebar">
            <Sidebar
              onOpenSearch={onOpenSearch}
              onOpenAiChat={onOpenAiChat}
              onOpenNotifications={onOpenNotifications}
              onOpenSettings={onOpenSettings}
            />
          </ErrorBoundary>
        </div>
        <div className="resize-handle" onMouseDown={handleMouseDown} />
        <div className="content-area">{children}</div>
        {showRightSidebar && (
          <>
            <div
              className="resize-handle resize-handle--right"
              onMouseDown={handleRightMouseDown}
            />
            <div style={{ width: rightSidebarWidth, flexShrink: 0 }}>
              <ErrorBoundary name="GitHub Sidebar">
                <GitHubSidebar projectId={selectedProjectId} />
              </ErrorBoundary>
            </div>
          </>
        )}
      </div>
    </UiContext.Provider>
  );
}
