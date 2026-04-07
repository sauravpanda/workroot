import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/stash-manager.css";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface StashEntry {
  index: number;
  message: string;
  branch: string;
  timestamp: string;
}

interface StashManagerProps {
  worktreeId: number;
  onClose: () => void;
}

export function StashManager({ worktreeId, onClose }: StashManagerProps) {
  const focusTrapRef = useFocusTrap();
  const [stashes, setStashes] = useState<StashEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmDropIndex, setConfirmDropIndex] = useState<number | null>(null);

  const loadStashes = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<StashEntry[]>("list_stashes", {
        worktreeId,
      });
      setStashes(result);
    } catch {
      setStashes([]);
    }
    setLoading(false);
  }, [worktreeId]);

  useEffect(() => {
    loadStashes();
  }, [loadStashes]);

  const handleCreate = useCallback(async () => {
    if (!message.trim()) return;
    setCreating(true);
    try {
      await invoke("create_stash", {
        worktreeId,
        message: message.trim(),
        includeUntracked,
      });
      setMessage("");
      await loadStashes();
    } catch {
      // stash creation failed
    }
    setCreating(false);
  }, [worktreeId, message, includeUntracked, loadStashes]);

  const handleApply = useCallback(
    async (index: number) => {
      try {
        await invoke("apply_stash", { worktreeId, stashIndex: index });
        await loadStashes();
      } catch {
        // apply failed
      }
    },
    [worktreeId, loadStashes],
  );

  const handlePop = useCallback(
    async (index: number) => {
      try {
        await invoke("pop_stash", { worktreeId, stashIndex: index });
        await loadStashes();
      } catch {
        // pop failed
      }
    },
    [worktreeId, loadStashes],
  );

  const handleDrop = useCallback(
    async (index: number) => {
      try {
        await invoke("drop_stash", { worktreeId, stashIndex: index });
        await loadStashes();
      } catch {
        // drop failed
      } finally {
        setConfirmDropIndex(null);
      }
    },
    [worktreeId, loadStashes],
  );

  return (
    <div className="stash-backdrop" ref={focusTrapRef} onClick={onClose}>
      <div className="stash-panel" onClick={(e) => e.stopPropagation()}>
        <div className="stash-header">
          <h3 className="stash-title">Stash Manager</h3>
          <button className="stash-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="stash-create">
          <input
            className="stash-input"
            type="text"
            placeholder="Stash message..."
            aria-label="Stash message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
          />
          <label className="stash-checkbox-label">
            <input
              type="checkbox"
              checked={includeUntracked}
              onChange={(e) => setIncludeUntracked(e.target.checked)}
            />
            <span>Include untracked</span>
          </label>
          <button
            className="stash-create-btn"
            onClick={handleCreate}
            disabled={creating || !message.trim()}
          >
            {creating ? "Creating..." : "Stash"}
          </button>
        </div>

        <div className="stash-list">
          {loading ? (
            <div className="stash-empty">Loading stashes...</div>
          ) : stashes.length === 0 ? (
            <div className="stash-empty">No stashes found.</div>
          ) : (
            stashes.map((stash) => (
              <div key={stash.index} className="stash-item">
                <div className="stash-item-info">
                  <span className="stash-item-msg">
                    stash@{"{"}
                    {stash.index}
                    {"}"}: {stash.message}
                  </span>
                  <span className="stash-item-meta">
                    {stash.branch} &middot; {stash.timestamp}
                  </span>
                </div>
                <div className="stash-item-actions">
                  <button
                    className="stash-action-btn"
                    aria-label={`Apply stash ${stash.index}`}
                    onClick={() => handleApply(stash.index)}
                  >
                    Apply
                  </button>
                  <button
                    className="stash-action-btn"
                    aria-label={`Pop stash ${stash.index}`}
                    onClick={() => handlePop(stash.index)}
                  >
                    Pop
                  </button>
                  {confirmDropIndex === stash.index ? (
                    <span className="stash-drop-confirm-group">
                      <span className="stash-drop-warning">
                        This will permanently delete this stash.
                      </span>
                      <button
                        className="stash-action-btn stash-action-danger"
                        aria-label={`Confirm drop stash ${stash.index}`}
                        onClick={() => handleDrop(stash.index)}
                        autoFocus
                      >
                        Confirm Drop
                      </button>
                      <button
                        className="stash-action-btn"
                        aria-label="Cancel drop"
                        onClick={() => setConfirmDropIndex(null)}
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      className="stash-action-btn stash-action-danger"
                      aria-label={`Drop stash ${stash.index}`}
                      onClick={() => setConfirmDropIndex(stash.index)}
                    >
                      Drop
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
