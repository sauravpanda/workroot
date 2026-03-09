import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useProjects } from "../hooks/useProjects";
import { useUiStore } from "../stores/uiStore";
import { ProjectGroup } from "./ProjectGroup";

export function Sidebar() {
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
        <span
          className="sidebar-title"
          onClick={handleGoHome}
          role="button"
          tabIndex={0}
        >
          Projects
        </span>
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
    </div>
  );
}
