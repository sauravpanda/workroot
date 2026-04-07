import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/command-bookmarks.css";
import { Dialog, DialogContent } from "./ui/dialog";

interface Bookmark {
  id: number;
  project_id: number | null;
  label: string;
  command: string;
  tags: string;
  created_at: string;
}

interface CommandBookmarksProps {
  projectId: number | null;
  onInsertCommand?: (command: string) => void;
  onClose: () => void;
}

export function CommandBookmarks({
  projectId,
  onInsertCommand,
  onClose,
}: CommandBookmarksProps) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [filter, setFilter] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formLabel, setFormLabel] = useState("");
  const [formCommand, setFormCommand] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formGlobal, setFormGlobal] = useState(true);

  const loadBookmarks = useCallback(async () => {
    try {
      const list = await invoke<Bookmark[]>("list_bookmarks", {
        projectId,
      });
      setBookmarks(list);
    } catch {
      // ignore
    }
  }, [projectId]);

  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  const handleSave = useCallback(async () => {
    const label = formLabel.trim();
    const command = formCommand.trim();
    if (!label || !command) return;

    const tags = formTags.trim();
    const pid = formGlobal ? null : projectId;

    try {
      if (editingId !== null) {
        await invoke("update_bookmark", {
          id: editingId,
          label,
          command,
          tags,
        });
      } else {
        await invoke("create_bookmark", {
          projectId: pid,
          label,
          command,
          tags,
        });
      }
      setShowForm(false);
      setEditingId(null);
      setFormLabel("");
      setFormCommand("");
      setFormTags("");
      setFormGlobal(true);
      await loadBookmarks();
    } catch {
      // ignore
    }
  }, [
    formLabel,
    formCommand,
    formTags,
    formGlobal,
    projectId,
    editingId,
    loadBookmarks,
  ]);

  const handleEdit = useCallback((b: Bookmark) => {
    setEditingId(b.id);
    setFormLabel(b.label);
    setFormCommand(b.command);
    setFormTags(b.tags);
    setFormGlobal(b.project_id === null);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await invoke("delete_bookmark", { id });
        await loadBookmarks();
      } catch {
        // ignore
      }
    },
    [loadBookmarks],
  );

  const handleInsert = useCallback(
    (command: string) => {
      onInsertCommand?.(command);
      onClose();
    },
    [onInsertCommand, onClose],
  );

  const handleExport = useCallback(() => {
    const data = JSON.stringify(bookmarks, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "workroot-bookmarks.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [bookmarks]);

  const handleImport = useCallback(async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text) as Bookmark[];
        for (const b of imported) {
          await invoke("create_bookmark", {
            projectId: b.project_id,
            label: b.label,
            command: b.command,
            tags: b.tags || "",
          });
        }
        await loadBookmarks();
      } catch {
        // ignore invalid JSON
      }
    };
    input.click();
  }, [loadBookmarks]);

  const filtered = filter.trim()
    ? bookmarks.filter((b) => {
        const q = filter.toLowerCase();
        return (
          b.label.toLowerCase().includes(q) ||
          b.command.toLowerCase().includes(q) ||
          b.tags.toLowerCase().includes(q)
        );
      })
    : bookmarks;

  const globalBookmarks = filtered.filter((b) => b.project_id === null);
  const projectBookmarks = filtered.filter((b) => b.project_id !== null);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="bookmarks-panel" aria-label="Command Bookmarks">
        <div className="bookmarks-header">
          <h3 className="bookmarks-title">Command Bookmarks</h3>
          <div className="bookmarks-header-actions">
            <button
              className="bookmarks-action-btn"
              onClick={handleImport}
              title="Import bookmarks"
            >
              Import
            </button>
            <button
              className="bookmarks-action-btn"
              onClick={handleExport}
              title="Export bookmarks"
            >
              Export
            </button>
            <button
              className="bookmarks-action-btn bookmarks-action-primary"
              onClick={() => {
                setEditingId(null);
                setFormLabel("");
                setFormCommand("");
                setFormTags("");
                setFormGlobal(true);
                setShowForm(true);
              }}
            >
              + New
            </button>
            <button className="bookmarks-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        {showForm && (
          <div className="bookmarks-form">
            <input
              className="bookmarks-form-input"
              type="text"
              placeholder="Label"
              value={formLabel}
              onChange={(e) => setFormLabel(e.target.value)}
              autoFocus
            />
            <textarea
              className="bookmarks-form-textarea"
              placeholder="Command (e.g., npm run dev)"
              value={formCommand}
              onChange={(e) => setFormCommand(e.target.value)}
              rows={2}
            />
            <input
              className="bookmarks-form-input"
              type="text"
              placeholder="Tags (comma-separated)"
              value={formTags}
              onChange={(e) => setFormTags(e.target.value)}
            />
            <div className="bookmarks-form-row">
              <label className="bookmarks-form-label">
                <input
                  type="checkbox"
                  checked={formGlobal}
                  onChange={(e) => setFormGlobal(e.target.checked)}
                />
                <span>Global (available in all projects)</span>
              </label>
              <div className="bookmarks-form-actions">
                <button
                  className="bookmarks-action-btn"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  className="bookmarks-action-btn bookmarks-action-primary"
                  onClick={handleSave}
                >
                  {editingId !== null ? "Update" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bookmarks-search-wrap">
          <input
            className="bookmarks-search"
            type="text"
            placeholder="Filter bookmarks..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="bookmarks-list">
          {filtered.length === 0 ? (
            <div className="bookmarks-empty">
              {bookmarks.length === 0
                ? "No bookmarks yet. Click + New to add one."
                : "No matching bookmarks."}
            </div>
          ) : (
            <>
              {globalBookmarks.length > 0 && (
                <div className="bookmarks-group">
                  <div className="bookmarks-group-label">Global</div>
                  {globalBookmarks.map((b) => (
                    <BookmarkItem
                      key={b.id}
                      bookmark={b}
                      onInsert={handleInsert}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
              {projectBookmarks.length > 0 && (
                <div className="bookmarks-group">
                  <div className="bookmarks-group-label">Project</div>
                  {projectBookmarks.map((b) => (
                    <BookmarkItem
                      key={b.id}
                      bookmark={b}
                      onInsert={handleInsert}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BookmarkItem({
  bookmark,
  onInsert,
  onEdit,
  onDelete,
}: {
  bookmark: Bookmark;
  onInsert: (cmd: string) => void;
  onEdit: (b: Bookmark) => void;
  onDelete: (id: number) => void;
}) {
  const tags = bookmark.tags
    ? bookmark.tags.split(",").filter((t) => t.trim())
    : [];

  return (
    <div className="bookmark-item">
      <div
        className="bookmark-item-main"
        onClick={() => onInsert(bookmark.command)}
        title="Click to insert into terminal"
      >
        <div className="bookmark-item-label">{bookmark.label}</div>
        <code className="bookmark-item-command">{bookmark.command}</code>
        {tags.length > 0 && (
          <div className="bookmark-item-tags">
            {tags.map((t) => (
              <span key={t.trim()} className="bookmark-tag">
                {t.trim()}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="bookmark-item-actions">
        <button
          className="bookmark-btn-icon"
          onClick={() => onEdit(bookmark)}
          title="Edit"
        >
          <EditIcon />
        </button>
        <button
          className="bookmark-btn-icon bookmark-btn-danger"
          onClick={() => onDelete(bookmark.id)}
          title="Delete"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M10 2L12 4L5 11H3V9L10 2Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M3 4H11L10.2 12H3.8L3 4Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M2 4H12" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 4V2.5H9V4" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
