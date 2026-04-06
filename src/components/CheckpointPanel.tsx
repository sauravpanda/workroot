import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/checkpoint-panel.css";

interface CheckpointEntry {
  id: number;
  label: string;
  head_sha: string;
  has_stash: boolean;
  created_at: string;
}

interface CheckpointPanelProps {
  worktreeId: number;
  onClose: () => void;
}

export function CheckpointPanel({ worktreeId, onClose }: CheckpointPanelProps) {
  const [checkpoints, setCheckpoints] = useState<CheckpointEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [rollingBack, setRollingBack] = useState<number | null>(null);
  const [confirmRollback, setConfirmRollback] =
    useState<CheckpointEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<CheckpointEntry[]>("list_checkpoints", {
        worktreeId,
      });
      setCheckpoints(result);
    } catch {
      setCheckpoints([]);
    }
    setLoading(false);
  }, [worktreeId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = useCallback(async () => {
    if (!label.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await invoke("create_checkpoint", {
        worktreeId,
        label: label.trim(),
      });
      setLabel("");
      await load();
    } catch (e) {
      setError(String(e));
    }
    setCreating(false);
  }, [worktreeId, label, load]);

  const handleRollback = useCallback(async (checkpoint: CheckpointEntry) => {
    setConfirmRollback(checkpoint);
  }, []);

  const confirmDoRollback = useCallback(async () => {
    if (!confirmRollback) return;
    setRollingBack(confirmRollback.id);
    setConfirmRollback(null);
    setError(null);
    try {
      await invoke("rollback_to_checkpoint", {
        worktreeId,
        checkpointId: confirmRollback.id,
      });
      await load();
    } catch (e) {
      setError(String(e));
    }
    setRollingBack(null);
  }, [worktreeId, confirmRollback, load]);

  const handleDelete = useCallback(
    async (id: number) => {
      setError(null);
      try {
        await invoke("delete_checkpoint", {
          worktreeId,
          checkpointId: id,
        });
        await load();
      } catch (e) {
        setError(String(e));
      }
    },
    [worktreeId, load],
  );

  function formatDate(iso: string): string {
    try {
      return new Date(iso + "Z").toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="cp-backdrop" onClick={onClose}>
      <div className="cp-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cp-header">
          <div className="cp-header-left">
            <svg
              className="cp-header-icon"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="8" cy="8" r="6.5" />
              <polyline points="8 5 8 8 10 10" />
            </svg>
            <h3 className="cp-title">Checkpoints</h3>
          </div>
          <button className="cp-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {/* Create new checkpoint */}
        <div className="cp-create">
          <input
            className="cp-input"
            type="text"
            placeholder="Label (e.g. before agent run)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
          />
          <button
            className="cp-create-btn"
            onClick={handleCreate}
            disabled={creating || !label.trim()}
          >
            {creating ? "Saving…" : "Save Checkpoint"}
          </button>
        </div>

        {error && <div className="cp-error">{error}</div>}

        {/* Checkpoint list */}
        <div className="cp-list">
          {loading ? (
            <div className="cp-empty">Loading…</div>
          ) : checkpoints.length === 0 ? (
            <div className="cp-empty">No checkpoints yet.</div>
          ) : (
            checkpoints.map((cp) => (
              <div key={cp.id} className="cp-item">
                <div className="cp-item-info">
                  <span className="cp-item-label">{cp.label}</span>
                  <span className="cp-item-meta">
                    <span className="cp-item-sha">
                      {cp.head_sha.slice(0, 7)}
                    </span>
                    {cp.has_stash && (
                      <span
                        className="cp-item-badge"
                        title="Includes uncommitted changes"
                      >
                        +changes
                      </span>
                    )}
                    <span className="cp-item-date">
                      {formatDate(cp.created_at)}
                    </span>
                  </span>
                </div>
                <div className="cp-item-actions">
                  <button
                    className="cp-action-btn cp-action-rollback"
                    onClick={() => handleRollback(cp)}
                    disabled={rollingBack === cp.id}
                    title="Roll back to this checkpoint"
                  >
                    {rollingBack === cp.id ? "Rolling back…" : "Rollback"}
                  </button>
                  <button
                    className="cp-action-btn cp-action-danger"
                    onClick={() => handleDelete(cp.id)}
                    disabled={rollingBack === cp.id}
                    title="Delete this checkpoint"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Confirm rollback dialog */}
        {confirmRollback && (
          <div className="cp-confirm-overlay">
            <div className="cp-confirm">
              <p className="cp-confirm-msg">
                Roll back to <strong>{confirmRollback.label}</strong>?
                <br />
                <span className="cp-confirm-warn">
                  This will hard-reset the working tree. Unsaved work will be
                  lost.
                </span>
              </p>
              <div className="cp-confirm-actions">
                <button
                  className="cp-confirm-btn cp-confirm-cancel"
                  onClick={() => setConfirmRollback(null)}
                >
                  Cancel
                </button>
                <button
                  className="cp-confirm-btn cp-confirm-ok"
                  onClick={confirmDoRollback}
                >
                  Roll Back
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
