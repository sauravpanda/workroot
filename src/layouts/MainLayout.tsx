import { useState, useCallback, useRef, useEffect } from "react";
import { Sidebar } from "../components/Sidebar";
import { GitHubSidebar } from "../components/GitHubSidebar";
import { UiContext } from "../stores/uiStore";

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 260;
const STORAGE_KEY = "workroot:sidebar-width";

const RIGHT_SIDEBAR_MIN = 200;
const RIGHT_SIDEBAR_MAX = 500;
const RIGHT_SIDEBAR_DEFAULT = 280;
const RIGHT_STORAGE_KEY = "workroot:right-sidebar-width";

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
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
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
      }}
    >
      <div className="main-layout">
        <div className="sidebar-panel" style={{ width: sidebarWidth }}>
          <Sidebar
            onOpenSearch={onOpenSearch}
            onOpenAiChat={onOpenAiChat}
            onOpenNotifications={onOpenNotifications}
            onOpenSettings={onOpenSettings}
          />
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
              <GitHubSidebar projectId={selectedProjectId} />
            </div>
          </>
        )}
      </div>
    </UiContext.Provider>
  );
}
