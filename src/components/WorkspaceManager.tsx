import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface WorkspaceEntry {
  id: number;
  name: string;
  config: string;
  created_at: string;
}

interface WorkspaceManagerProps {
  onClose: () => void;
  onLoad: (config: string) => void;
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function parseConfigPreview(config: string): string {
  try {
    const parsed = JSON.parse(config) as Record<string, unknown>;
    const keys = Object.keys(parsed);
    if (keys.length === 0) return "Empty configuration";
    return keys.slice(0, 4).join(", ") + (keys.length > 4 ? "..." : "");
  } catch {
    return "Custom layout";
  }
}

export function WorkspaceManager({ onClose, onLoad }: WorkspaceManagerProps) {
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const loadWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<WorkspaceEntry[]>("list_workspaces");
      setWorkspaces(result);
    } catch {
      setWorkspaces([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const handleSave = useCallback(async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      const config = JSON.stringify({
        name: saveName.trim(),
        savedAt: new Date().toISOString(),
        layout: "default",
      });
      await invoke("save_workspace", {
        name: saveName.trim(),
        config,
      });
      setSaveName("");
      setShowSaveForm(false);
      await loadWorkspaces();
    } catch {
      // save failed
    }
    setSaving(false);
  }, [saveName, loadWorkspaces]);

  const handleLoad = useCallback(
    async (workspace: WorkspaceEntry) => {
      try {
        const config = await invoke<string>("load_workspace", {
          id: workspace.id,
        });
        onLoad(config);
      } catch {
        // load failed
      }
    },
    [onLoad],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await invoke("delete_workspace", { id });
        setConfirmDelete(null);
        await loadWorkspaces();
      } catch {
        // delete failed
      }
    },
    [loadWorkspaces],
  );

  return (
    <div className="wspmgr-backdrop" onClick={onClose}>
      <div className="wspmgr-panel" onClick={(e) => e.stopPropagation()}>
        <div className="wspmgr-header">
          <h3 className="wspmgr-title">Workspaces</h3>
          <button className="wspmgr-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="wspmgr-toolbar">
          {showSaveForm ? (
            <div className="wspmgr-save-form">
              <input
                className="wspmgr-save-input"
                type="text"
                placeholder="Workspace name..."
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                spellCheck={false}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") setShowSaveForm(false);
                }}
              />
              <button
                className="wspmgr-save-btn"
                onClick={handleSave}
                disabled={saving || !saveName.trim()}
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                className="wspmgr-cancel-btn"
                onClick={() => setShowSaveForm(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="wspmgr-save-current"
              onClick={() => setShowSaveForm(true)}
            >
              + Save Current
            </button>
          )}
        </div>

        <div className="wspmgr-list">
          {loading ? (
            <div className="wspmgr-empty">Loading workspaces...</div>
          ) : workspaces.length === 0 ? (
            <div className="wspmgr-empty">No saved workspaces yet.</div>
          ) : (
            workspaces.map((ws) => (
              <div key={ws.id} className="wspmgr-card">
                <div className="wspmgr-card-info">
                  <span className="wspmgr-card-name">{ws.name}</span>
                  <span className="wspmgr-card-date">
                    {formatDate(ws.created_at)}
                  </span>
                  <span className="wspmgr-card-preview">
                    {parseConfigPreview(ws.config)}
                  </span>
                </div>
                <div className="wspmgr-card-actions">
                  <button
                    className="wspmgr-action-btn wspmgr-action-load"
                    onClick={() => handleLoad(ws)}
                  >
                    Load
                  </button>
                  {confirmDelete === ws.id ? (
                    <>
                      <button
                        className="wspmgr-action-btn wspmgr-action-danger"
                        onClick={() => handleDelete(ws.id)}
                      >
                        Confirm
                      </button>
                      <button
                        className="wspmgr-action-btn"
                        onClick={() => setConfirmDelete(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      className="wspmgr-action-btn wspmgr-action-danger"
                      onClick={() => setConfirmDelete(ws.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
