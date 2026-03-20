import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface TagInfo {
  name: string;
  tag_type: string;
  tagger: string | null;
  date: string | null;
  commit_id: string;
  message: string | null;
}

interface TagManagerProps {
  worktreeId: number;
  onClose: () => void;
}

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return `${diffDay}d ago`;
    const diffMon = Math.floor(diffDay / 30);
    if (diffMon < 12) return `${diffMon}mo ago`;
    return `${Math.floor(diffMon / 12)}y ago`;
  } catch {
    return dateStr;
  }
}

export function TagManager({ worktreeId, onClose }: TagManagerProps) {
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [newName, setNewName] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const loadTags = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<TagInfo[]>("list_tags", { worktreeId });
      const sorted = [...result].sort((a, b) => {
        if (a.date && b.date) return b.date.localeCompare(a.date);
        if (a.date) return -1;
        if (b.date) return 1;
        return a.name.localeCompare(b.name);
      });
      setTags(sorted);
    } catch {
      setTags([]);
    }
    setLoading(false);
  }, [worktreeId]);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await invoke("create_tag", {
        worktreeId,
        name: newName.trim(),
        message: newMessage.trim() || null,
      });
      setNewName("");
      setNewMessage("");
      await loadTags();
    } catch {
      // creation failed
    }
    setCreating(false);
  }, [worktreeId, newName, newMessage, loadTags]);

  const handleDelete = useCallback(
    async (name: string) => {
      try {
        await invoke("delete_tag", { worktreeId, name });
        setConfirmDelete(null);
        await loadTags();
      } catch {
        // deletion failed
      }
    },
    [worktreeId, loadTags],
  );

  const filtered = filter.trim()
    ? tags.filter((t) =>
        t.name.toLowerCase().includes(filter.toLowerCase().trim()),
      )
    : tags;

  return (
    <div className="tagmgr-backdrop" onClick={onClose}>
      <div className="tagmgr-panel" onClick={(e) => e.stopPropagation()}>
        <div className="tagmgr-header">
          <h3 className="tagmgr-title">Tag Manager</h3>
          <button className="tagmgr-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="tagmgr-create">
          <div className="tagmgr-create-row">
            <input
              className="tagmgr-input"
              type="text"
              placeholder="Tag name (e.g. v1.0.0)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              spellCheck={false}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) handleCreate();
              }}
            />
            <button
              className="tagmgr-create-btn"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
            >
              {creating ? "Creating..." : "Create Tag"}
            </button>
          </div>
          <textarea
            className="tagmgr-message"
            placeholder="Optional message (makes it an annotated tag)"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            rows={2}
            spellCheck={false}
          />
        </div>

        <div className="tagmgr-filter-row">
          <input
            className="tagmgr-filter"
            type="text"
            placeholder="Filter tags..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            spellCheck={false}
          />
          <span className="tagmgr-count">
            {filtered.length} tag{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="tagmgr-list">
          {loading ? (
            <div className="tagmgr-empty">Loading tags...</div>
          ) : filtered.length === 0 ? (
            <div className="tagmgr-empty">
              {filter.trim() ? "No tags match filter." : "No tags found."}
            </div>
          ) : (
            filtered.map((tag) => (
              <div key={tag.name} className="tagmgr-item">
                <div className="tagmgr-item-left">
                  <div className="tagmgr-item-top">
                    <span className="tagmgr-tag-name">{tag.name}</span>
                    <span
                      className={`tagmgr-type-badge ${tag.tag_type === "annotated" ? "tagmgr-type-annotated" : "tagmgr-type-lightweight"}`}
                    >
                      {tag.tag_type}
                    </span>
                  </div>
                  <div className="tagmgr-item-meta">
                    {tag.tagger && (
                      <span className="tagmgr-tagger">{tag.tagger}</span>
                    )}
                    {tag.date && (
                      <span className="tagmgr-date">
                        {formatRelativeDate(tag.date)}
                      </span>
                    )}
                    <span className="tagmgr-commit">
                      {tag.commit_id.slice(0, 8)}
                    </span>
                  </div>
                </div>
                <div className="tagmgr-item-actions">
                  {confirmDelete === tag.name ? (
                    <>
                      <button
                        className="tagmgr-action-btn tagmgr-action-danger"
                        onClick={() => handleDelete(tag.name)}
                      >
                        Confirm
                      </button>
                      <button
                        className="tagmgr-action-btn"
                        onClick={() => setConfirmDelete(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      className="tagmgr-action-btn tagmgr-action-danger"
                      onClick={() => setConfirmDelete(tag.name)}
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
