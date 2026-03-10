import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/stash-manager.css";

interface StashEntry {
  index: number;
  message: string;
}

interface StashManagerProps {
  worktreeId: number;
  onClose: () => void;
}

export function StashManager({ worktreeId, onClose }: StashManagerProps) {
  const [stashes, setStashes] = useState<StashEntry[]>([]);
  const [message, setMessage] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDrop, setConfirmDrop] = useState<number | null>(null);

  const loadStashes = useCallback(async () => {
    try {
      const entries = await invoke<StashEntry[]>("list_stashes", {
        worktreeId,
      });
      setStashes(entries);
    } catch (err) {
      setError(String(err));
    }
  }, [worktreeId]);

  useEffect(() => {
    loadStashes();
  }, [loadStashes]);

  const handleCreate = async () => {
    if (!message.trim()) return;
    setError(null);
    setLoading(true);
    try {
      await invoke("create_stash", {
        worktreeId,
        message: message.trim(),
        includeUntracked,
      });
      setMessage("");
      setIncludeUntracked(false);
      await loadStashes();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async (stashIndex: number) => {
    setError(null);
    setLoading(true);
    try {
      await invoke("apply_stash", { worktreeId, stashIndex });
      await loadStashes();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handlePop = async (stashIndex: number) => {
    setError(null);
    setLoading(true);
    try {
      await invoke("pop_stash", { worktreeId, stashIndex });
      await loadStashes();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = async (stashIndex: number) => {
    setError(null);
    setLoading(true);
    try {
      await invoke("drop_stash", { worktreeId, stashIndex });
      setConfirmDrop(null);
      await loadStashes();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="stash-overlay" onClick={handleOverlayClick}>
      <div className="stash-modal">
        <div className="stash-header">
          <h3>Stash Manager</h3>
          <button className="stash-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="stash-create-form">
          <input
            type="text"
            className="stash-message-input"
            placeholder="Stash message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && message.trim()) handleCreate();
            }}
          />
          <label className="stash-untracked-label">
            <input
              type="checkbox"
              checked={includeUntracked}
              onChange={(e) => setIncludeUntracked(e.target.checked)}
            />
            Include untracked
          </label>
          <button
            className="stash-create-btn"
            disabled={!message.trim() || loading}
            onClick={handleCreate}
          >
            {loading ? "Creating..." : "Create"}
          </button>
        </div>

        {error && <div className="stash-error">{error}</div>}

        <div className="stash-list">
          {stashes.length === 0 ? (
            <div className="stash-empty">No stashes</div>
          ) : (
            stashes.map((stash) => (
              <div key={stash.index} className="stash-item">
                <div className="stash-item-info">
                  <span className="stash-item-index">
                    stash@{"{"}
                    {stash.index}
                    {"}"}
                  </span>
                  <span className="stash-item-message">{stash.message}</span>
                </div>
                <div className="stash-item-actions">
                  <button
                    className="stash-action-btn"
                    disabled={loading}
                    onClick={() => handleApply(stash.index)}
                  >
                    Apply
                  </button>
                  <button
                    className="stash-action-btn"
                    disabled={loading}
                    onClick={() => handlePop(stash.index)}
                  >
                    Pop
                  </button>
                  {confirmDrop === stash.index ? (
                    <>
                      <button
                        className="stash-action-btn danger"
                        disabled={loading}
                        onClick={() => handleDrop(stash.index)}
                      >
                        Confirm
                      </button>
                      <button
                        className="stash-action-btn"
                        onClick={() => setConfirmDrop(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      className="stash-action-btn danger"
                      disabled={loading}
                      onClick={() => setConfirmDrop(stash.index)}
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
