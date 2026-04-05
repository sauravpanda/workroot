import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

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
      <div className="inline-flex select-none items-center gap-1.5 rounded-[var(--radius)] border border-[rgba(239,68,68,0.2)] bg-[var(--danger-muted)] px-2.5 py-1 font-mono text-[0.78em] text-[#fca5a5]">
        <span className="size-1.5 shrink-0 rounded-full bg-[var(--danger)]" />
        <span className="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">
          Proxy offline
        </span>
      </div>
    );
  }

  if (!activeProject) {
    return (
      <div className="inline-flex select-none items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 font-mono text-[0.78em] text-[var(--text-muted)]">
        <span className="size-1.5 shrink-0 rounded-full bg-[var(--text-muted)]" />
        <span className="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">
          :3000 idle
        </span>
      </div>
    );
  }

  return (
    <div className="inline-flex select-none items-center gap-1.5 rounded-[var(--radius)] border border-[rgba(16,185,129,0.25)] bg-[var(--accent-muted)] px-2.5 py-1 font-mono text-[0.78em] text-[var(--accent-hover)]">
      <span className="size-1.5 shrink-0 rounded-full bg-[var(--success)] shadow-[0_0_4px_rgba(34,197,94,0.4)]" />
      <span className="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">
        :3000 &rarr; {activeProject.project_name}/{activeProject.branch_name}
      </span>
      <span className="text-[0.9em] text-[var(--text-muted)]">
        :{activeProject.port}
      </span>
      <button
        className="cursor-pointer border-none bg-transparent px-0.5 py-0 text-[13px] leading-none text-[var(--text-muted)] transition-colors duration-150 hover:text-[var(--danger)]"
        onClick={handleClear}
        title="Stop routing"
      >
        &times;
      </button>
    </div>
  );
}
