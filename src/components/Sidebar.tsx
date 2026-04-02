import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useProjects } from "../hooks/useProjects";
import { useUiStore } from "../stores/uiStore";
import { ProjectGroup } from "./ProjectGroup";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SidebarProps {
  onOpenSearch?: () => void;
  onOpenAiChat?: () => void;
  onOpenNotifications?: () => void;
  onOpenSettings?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Sidebar({
  onOpenSearch,
  onOpenAiChat,
  onOpenNotifications,
  onOpenSettings,
}: SidebarProps) {
  const { projects, registerLocal, error } = useProjects();
  const {
    showSettings,
    setShowSettings,
    setSelectedWorktreeId,
    setSelectedWorktreePath,
    setSelectedWorktreeName,
  } = useUiStore();

  const handleAddProject = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      await registerLocal(selected);
    }
  }, [registerLocal]);

  const handleGoHome = useCallback(() => {
    setShowSettings(false);
    setSelectedWorktreeId(null);
    setSelectedWorktreePath(null);
    setSelectedWorktreeName(null);
  }, [
    setShowSettings,
    setSelectedWorktreeId,
    setSelectedWorktreePath,
    setSelectedWorktreeName,
  ]);

  const handleToggleSettings = useCallback(() => {
    const next = !showSettings;
    setShowSettings(next);
    if (next) {
      setSelectedWorktreeId(null);
      setSelectedWorktreePath(null);
      setSelectedWorktreeName(null);
    }
  }, [
    showSettings,
    setShowSettings,
    setSelectedWorktreeId,
    setSelectedWorktreePath,
    setSelectedWorktreeName,
  ]);

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div
          className="sidebar-brand"
          onClick={handleGoHome}
          role="button"
          tabIndex={0}
        >
          <span className="sidebar-logo">
            <svg
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              {/* Root node */}
              <circle cx="10" cy="3.5" r="2" fill="currentColor" />
              {/* Trunk */}
              <line
                x1="10"
                y1="5.5"
                x2="10"
                y2="11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              {/* Left branch */}
              <line
                x1="10"
                y1="11"
                x2="4"
                y2="16.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              {/* Right branch */}
              <line
                x1="10"
                y1="11"
                x2="16"
                y2="16.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              {/* Left leaf */}
              <circle
                cx="4"
                cy="16.5"
                r="2"
                fill="currentColor"
                opacity="0.75"
              />
              {/* Right leaf */}
              <circle
                cx="16"
                cy="16.5"
                r="2"
                fill="currentColor"
                opacity="0.75"
              />
            </svg>
          </span>
          <span className="sidebar-title">Workroot</span>
        </div>
        <div className="sidebar-header-actions">
          <button
            className="sidebar-add-btn"
            onClick={handleAddProject}
            title="Add local project"
          >
            +
          </button>
          <button
            className={`sidebar-settings-btn ${showSettings ? "active" : ""}`}
            onClick={handleToggleSettings}
            title="Settings"
          >
            &#9881;
          </button>
        </div>
      </div>

      {error && <div className="sidebar-error">{error}</div>}

      <div className="sidebar-content" role="tree">
        {projects.length === 0 ? (
          <div className="sidebar-empty">
            <p>No projects yet.</p>
            <button className="sidebar-empty-btn" onClick={handleAddProject}>
              Add a project
            </button>
          </div>
        ) : (
          projects.map((project) => (
            <ProjectGroup key={project.id} project={project} />
          ))
        )}
      </div>

      {/* Bottom toolbar */}
      <div className="sidebar-toolbar">
        <button
          className="sidebar-toolbar-btn"
          onClick={onOpenSearch}
          title="Search"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="6.5"
              cy="6.5"
              r="4.75"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <line
              x1="10.06"
              y1="10.06"
              x2="14.25"
              y2="14.25"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <button
          className="sidebar-toolbar-btn"
          onClick={onOpenAiChat}
          title="AI Chat"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M2 3.5C2 2.67 2.67 2 3.5 2h9c.83 0 1.5.67 1.5 1.5v7c0 .83-.67 1.5-1.5 1.5H5.5L2 14.5V3.5Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <circle cx="5.5" cy="7" r="0.75" fill="currentColor" />
            <circle cx="8" cy="7" r="0.75" fill="currentColor" />
            <circle cx="10.5" cy="7" r="0.75" fill="currentColor" />
          </svg>
        </button>

        <div className="sidebar-toolbar-divider" />

        <button
          className="sidebar-toolbar-btn"
          onClick={onOpenNotifications}
          title="Notifications"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5v2.5L2 10.5v1h12v-1L12.5 8.5V6A4.5 4.5 0 0 0 8 1.5Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M6.5 12.5a1.5 1.5 0 0 0 3 0"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <button
          className="sidebar-toolbar-btn"
          onClick={onOpenSettings}
          title="Settings"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="8"
              cy="8"
              r="2"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M2.87 2.87l1.06 1.06M12.07 12.07l1.06 1.06M13.13 2.87l-1.06 1.06M3.93 12.07l-1.06 1.06"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="sidebar-toolbar-divider" />

        <span className="sidebar-toolbar-hint" title="Command palette">
          &#8984;K
        </span>
      </div>
    </div>
  );
}
