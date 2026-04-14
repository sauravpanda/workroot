import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Sidebar } from "../components/Sidebar";

import { UiContext } from "../stores/uiStore";
import { ErrorBoundary } from "../components/ErrorBoundary";

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 260;
const STORAGE_KEY = "workroot:sidebar-width";

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
  const [agentDoneWorktreeIds, setAgentDoneWorktreeIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [agentNeedsAttentionIds, setAgentNeedsAttentionIds] = useState<
    Set<number>
  >(() => new Set());

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

  const markAgentNeedsAttention = useCallback((id: number) => {
    setAgentNeedsAttentionIds((prev) => new Set(prev).add(id));
  }, []);

  const clearAgentNeedsAttention = useCallback((id: number) => {
    setAgentNeedsAttentionIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const dragging = useRef(false);
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragging.current) {
        const width = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, e.clientX));
        setSidebarWidth(width);
      }
    };

    const handleMouseUp = () => {
      if (dragging.current) {
        dragging.current = false;
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

  return (
    <UiContext.Provider
      value={useMemo(
        () => ({
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
          agentDoneWorktreeIds,
          markAgentDone,
          clearAgentDone,
          agentNeedsAttentionIds,
          markAgentNeedsAttention,
          clearAgentNeedsAttention,
        }),
        [
          selectedProjectId,
          setSelectedProjectId,
          selectedWorktreeId,
          selectedWorktreePath,
          selectedWorktreeName,
          showSettings,
          agentDoneWorktreeIds,
          markAgentDone,
          clearAgentDone,
          agentNeedsAttentionIds,
          markAgentNeedsAttention,
          clearAgentNeedsAttention,
        ],
      )}
    >
      <div className="main-layout">
        {selectedWorktreePath && (
          <>
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
          </>
        )}
        <div className="content-area">{children}</div>
      </div>
    </UiContext.Provider>
  );
}
