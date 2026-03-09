import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/active-badge.css";

interface ActiveProjectInfo {
  worktree_id: number;
  project_name: string;
  branch_name: string;
  port: number;
}

interface ProxyInfo {
  running: boolean;
  proxy_port: number | null;
  active_port: number | null;
  active_worktree_id: number | null;
}

export function ActiveProjectBadge() {
  const [activeProject, setActiveProject] = useState<ActiveProjectInfo | null>(
    null,
  );
  const [proxyInfo, setProxyInfo] = useState<ProxyInfo | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [project, proxy] = await Promise.all([
        invoke<ActiveProjectInfo | null>("get_active_project"),
        invoke<ProxyInfo>("get_proxy_status"),
      ]);
      setActiveProject(project);
      setProxyInfo(proxy);
    } catch (err) {
      console.error("Failed to get proxy status:", err);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleClear = useCallback(async () => {
    try {
      await invoke("clear_active_project");
      setActiveProject(null);
      refresh();
    } catch (err) {
      console.error("Failed to clear active project:", err);
    }
  }, [refresh]);

  if (!proxyInfo?.running) {
    return (
      <div className="active-badge inactive">
        <span className="badge-dot offline" />
        <span className="badge-label">Proxy offline</span>
      </div>
    );
  }

  if (!activeProject) {
    return (
      <div className="active-badge idle">
        <span className="badge-dot idle" />
        <span className="badge-label">:3000 idle</span>
      </div>
    );
  }

  return (
    <div className="active-badge active">
      <span className="badge-dot online" />
      <span className="badge-label">
        :3000 &rarr; {activeProject.project_name}/{activeProject.branch_name}
      </span>
      <span className="badge-port">:{activeProject.port}</span>
      <button
        className="badge-clear"
        onClick={handleClear}
        title="Stop routing"
      >
        &times;
      </button>
    </div>
  );
}
