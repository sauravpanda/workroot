import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/backup-restore.css";

interface BackupEntry {
  path: string;
  filename: string;
  size: string;
  created_at: string;
}

interface BackupRestoreProps {
  onClose: () => void;
}

export function BackupRestore({ onClose }: BackupRestoreProps) {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoringPath, setRestoringPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadBackups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<BackupEntry[]>("list_backups");
      setBackups(result);
    } catch (e) {
      setError(String(e));
      setBackups([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const path = await invoke<string>("export_backup");
      setSuccessMsg(`Backup created: ${path}`);
      await loadBackups();
    } catch (e) {
      setError(String(e));
    }
    setCreating(false);
  }, [loadBackups]);

  const handleRestore = useCallback(
    async (path: string) => {
      setRestoringPath(path);
      setError(null);
      setSuccessMsg(null);
      try {
        await invoke("import_backup", { path });
        setSuccessMsg("Backup restored successfully.");
        await loadBackups();
      } catch (e) {
        setError(String(e));
      }
      setRestoringPath(null);
    },
    [loadBackups],
  );

  return (
    <div className="backup-backdrop" onClick={onClose}>
      <div className="backup-panel" onClick={(e) => e.stopPropagation()}>
        <div className="backup-header">
          <h3 className="backup-title">Backup &amp; Restore</h3>
          <div className="backup-header-actions">
            <button
              className="backup-create-btn"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? "Creating..." : "Create Backup"}
            </button>
            <button className="backup-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        <div className="backup-body">
          {error && <div className="backup-error">{error}</div>}
          {successMsg && <div className="backup-success">{successMsg}</div>}

          {loading ? (
            <div className="backup-empty">Loading backups...</div>
          ) : backups.length === 0 ? (
            <div className="backup-empty">
              No backups found. Click &quot;Create Backup&quot; to get started.
            </div>
          ) : (
            <div className="backup-list">
              {backups.map((b) => (
                <div key={b.path} className="backup-item">
                  <div className="backup-item-info">
                    <span className="backup-item-name">{b.filename}</span>
                    <span className="backup-item-meta">
                      {b.size} &middot; {b.created_at}
                    </span>
                  </div>
                  <button
                    className="backup-restore-btn"
                    onClick={() => handleRestore(b.path)}
                    disabled={restoringPath === b.path}
                  >
                    {restoringPath === b.path ? "Restoring..." : "Restore"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
