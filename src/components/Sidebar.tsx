import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useProjects } from "../hooks/useProjects";
import { ProjectGroup } from "./ProjectGroup";

export function Sidebar() {
  const { projects, registerLocal, error } = useProjects();

  const handleAddProject = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      await registerLocal(selected);
    }
  }, [registerLocal]);

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Projects</span>
        <button
          className="sidebar-add-btn"
          onClick={handleAddProject}
          title="Add local project"
        >
          +
        </button>
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
