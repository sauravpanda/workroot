import { useState, useCallback, useRef, useEffect } from "react";
import { Sidebar } from "../components/Sidebar";
import { UiContext } from "../stores/uiStore";

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
}

export function MainLayout({ children }: MainLayoutProps) {
  const [sidebarWidth, setSidebarWidth] = useState(getSavedWidth);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    null,
  );
  const [selectedWorktreeId, setSelectedWorktreeId] = useState<number | null>(
    null,
  );
  const dragging = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const width = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, e.clientX));
      setSidebarWidth(width);
    };

    const handleMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
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
      value={{
        selectedProjectId,
        setSelectedProjectId,
        selectedWorktreeId,
        setSelectedWorktreeId,
      }}
    >
      <div className="main-layout">
        <div className="sidebar-panel" style={{ width: sidebarWidth }}>
          <Sidebar />
        </div>
        <div className="resize-handle" onMouseDown={handleMouseDown} />
        <div className="content-area">{children}</div>
      </div>
    </UiContext.Provider>
  );
}
