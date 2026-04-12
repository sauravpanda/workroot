import { useCallback, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Plus,
  Settings,
  Search,
  MessageCircle,
  Bell,
  Sun,
  X,
} from "lucide-react";
import { useProjects } from "../hooks/useProjects";
import { useUiStore } from "../stores/uiStore";
import { ProjectGroup } from "./ProjectGroup";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";

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
  const [filter, setFilter] = useState("");
  const {
    showSettings,
    setShowSettings,
    setSelectedWorktreeId,
    setSelectedWorktreePath,
    setSelectedWorktreeName,
    agentNeedsAttentionIds,
    agentDoneWorktreeIds,
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
              <circle cx="10" cy="3.5" r="2" fill="currentColor" />
              <line
                x1="10"
                y1="5.5"
                x2="10"
                y2="11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <line
                x1="10"
                y1="11"
                x2="4"
                y2="16.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <line
                x1="10"
                y1="11"
                x2="16"
                y2="16.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle
                cx="4"
                cy="16.5"
                r="2"
                fill="currentColor"
                opacity="0.75"
              />
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
        <div className="flex gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleAddProject}
            title="Add local project"
            aria-label="Add local project"
            className="text-text-muted hover:bg-accent-muted hover:text-accent hover:border-accent/20 border border-transparent"
          >
            <Plus className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleToggleSettings}
            title="Settings"
            aria-label="Settings"
            className={
              showSettings
                ? "bg-accent text-bg-base border-accent shadow-[0_0_8px_var(--color-accent-muted)]"
                : "text-text-muted hover:bg-accent-muted hover:text-accent hover:border-accent/20 border border-transparent"
            }
          >
            <Settings className="size-3.5" />
          </Button>
        </div>
      </div>

      {error && <div className="sidebar-error">{error}</div>}

      {/* Search / filter input */}
      <div className="sidebar-search">
        <Search className="sidebar-search-icon" />
        <input
          className="sidebar-search-input"
          type="text"
          placeholder="Filter worktrees…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setFilter("")}
          spellCheck={false}
          aria-label="Filter worktrees"
        />
        {filter && (
          <button
            className="sidebar-search-clear"
            onClick={() => setFilter("")}
            aria-label="Clear filter"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="py-1" role="tree">
          {projects.length === 0 ? (
            <div className="sidebar-empty">
              <p>No projects yet.</p>
              <Button size="sm" onClick={handleAddProject}>
                Add a project
              </Button>
            </div>
          ) : (
            projects.map((project) => (
              <ProjectGroup
                key={project.id}
                project={project}
                filter={filter}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Agent status strip — always visible when any agent has state */}
      {(agentNeedsAttentionIds.size > 0 || agentDoneWorktreeIds.size > 0) && (
        <div className="sidebar-agent-status">
          {agentNeedsAttentionIds.size > 0 && (
            <button
              className="sidebar-agent-badge sidebar-agent-badge--attention"
              onClick={handleGoHome}
              title="Go to Mission Control — agents need your input"
            >
              <span className="sidebar-agent-dot sidebar-agent-dot--attention" />
              {agentNeedsAttentionIds.size === 1
                ? "1 needs you"
                : `${agentNeedsAttentionIds.size} need you`}
            </button>
          )}
          {agentDoneWorktreeIds.size > 0 && (
            <button
              className="sidebar-agent-badge sidebar-agent-badge--done"
              onClick={handleGoHome}
              title="Go to Mission Control — agents finished"
            >
              <span className="sidebar-agent-dot sidebar-agent-dot--done" />
              {agentDoneWorktreeIds.size === 1
                ? "1 done"
                : `${agentDoneWorktreeIds.size} done`}
            </button>
          )}
        </div>
      )}

      {/* Bottom toolbar */}
      <div className="sidebar-toolbar">
        <Button
          variant="ghost"
          size="icon-sm"
          className="sidebar-toolbar-btn"
          onClick={onOpenSearch}
          title="Search"
          aria-label="Search files"
        >
          <Search className="size-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          className="sidebar-toolbar-btn"
          onClick={onOpenAiChat}
          title="AI Chat"
          aria-label="Open AI chat"
        >
          <MessageCircle className="size-4" />
        </Button>

        <div className="sidebar-toolbar-divider" />

        <Button
          variant="ghost"
          size="icon-sm"
          className="sidebar-toolbar-btn"
          onClick={onOpenNotifications}
          title="Notifications"
          aria-label="View notifications"
        >
          <Bell className="size-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          className="sidebar-toolbar-btn"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Open settings"
        >
          <Sun className="size-4" />
        </Button>

        <div className="sidebar-toolbar-divider" />

        <span className="sidebar-toolbar-hint" title="Command palette">
          &#8984;K
        </span>
      </div>
    </div>
  );
}
