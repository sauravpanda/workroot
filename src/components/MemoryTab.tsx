import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { NoteEditor } from "./NoteEditor";
import "../styles/memory-tab.css";

interface MemoryEntry {
  id: number;
  worktree_id: number;
  content: string;
  category: string;
  created_at: string;
  score: number | null;
}

const CATEGORIES = ["note", "dead_end", "decision"] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_LABELS: Record<Category, string> = {
  note: "Note",
  dead_end: "Dead End",
  decision: "Decision",
};

const CATEGORY_COLORS: Record<Category, string> = {
  note: "#60a5fa",
  dead_end: "#f87171",
  decision: "#a78bfa",
};

function relativeTime(timestamp: string): string {
  const date = new Date(timestamp + "Z");
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

interface MemoryTabProps {
  worktreeId: number;
}

export function MemoryTab({ worktreeId }: MemoryTabProps) {
  const [notes, setNotes] = useState<MemoryEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");
  const [showEditor, setShowEditor] = useState(false);
  const [editingNote, setEditingNote] = useState<MemoryEntry | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const loadNotes = useCallback(async () => {
    try {
      if (searchQuery.trim()) {
        const results = await invoke<MemoryEntry[]>("search_memory_notes", {
          worktreeId,
          query: searchQuery.trim(),
        });
        setNotes(results);
      } else {
        const category = categoryFilter !== "all" ? categoryFilter : null;
        const results = await invoke<MemoryEntry[]>("get_memory_notes", {
          worktreeId,
          category,
        });
        setNotes(results);
      }
    } catch (err) {
      console.error("Failed to load notes:", err);
    }
  }, [worktreeId, searchQuery, categoryFilter]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      loadNotes();
    }, 300);
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [searchQuery, loadNotes]);

  const handleSave = async (content: string, category: string) => {
    try {
      if (editingNote) {
        await invoke("update_memory_note", {
          noteId: editingNote.id,
          content,
        });
      } else {
        await invoke("add_memory_note", {
          worktreeId,
          content,
          category,
        });
      }
      setShowEditor(false);
      setEditingNote(null);
      loadNotes();
    } catch (err) {
      console.error("Failed to save note:", err);
    }
  };

  const handleDelete = async (noteId: number) => {
    try {
      await invoke("delete_memory_note", { noteId });
      setDeleteConfirm(null);
      loadNotes();
    } catch (err) {
      console.error("Failed to delete note:", err);
    }
  };

  const filteredNotes =
    searchQuery.trim() || categoryFilter === "all"
      ? notes
      : notes.filter((n) => n.category === categoryFilter);

  return (
    <div className="memory-tab">
      <div className="memory-toolbar">
        <input
          type="text"
          className="memory-search"
          placeholder="Search notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="memory-filters">
          <button
            className={`memory-filter ${categoryFilter === "all" ? "active" : ""}`}
            onClick={() => setCategoryFilter("all")}
          >
            All
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`memory-filter ${categoryFilter === cat ? "active" : ""}`}
              style={
                categoryFilter === cat
                  ? { borderColor: CATEGORY_COLORS[cat] }
                  : undefined
              }
              onClick={() => setCategoryFilter(cat)}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
        <button
          className="memory-add-btn"
          onClick={() => {
            setEditingNote(null);
            setShowEditor(true);
          }}
        >
          + Add Note
        </button>
      </div>

      {showEditor && (
        <NoteEditor
          initialContent={editingNote?.content || ""}
          initialCategory={editingNote?.category || "note"}
          onSave={handleSave}
          onCancel={() => {
            setShowEditor(false);
            setEditingNote(null);
          }}
        />
      )}

      <div className="memory-list">
        {filteredNotes.length === 0 && !showEditor && (
          <div className="memory-empty">
            <p>No notes yet</p>
            <p className="memory-empty-hint">
              Add notes to capture context, decisions, and dead ends
            </p>
          </div>
        )}

        {filteredNotes.map((note) => (
          <div key={note.id} className="memory-note">
            <div className="memory-note-header">
              <span
                className="memory-category-badge"
                style={{ color: CATEGORY_COLORS[note.category as Category] }}
              >
                {CATEGORY_LABELS[note.category as Category] || note.category}
              </span>
              <span className="memory-note-time" title={note.created_at}>
                {relativeTime(note.created_at)}
              </span>
              {note.score !== null && note.score !== undefined && (
                <span className="memory-note-score">
                  {(note.score * 100).toFixed(0)}% match
                </span>
              )}
              <div className="memory-note-actions">
                <button
                  className="memory-action-btn"
                  onClick={() => {
                    setEditingNote(note);
                    setShowEditor(true);
                  }}
                >
                  Edit
                </button>
                {deleteConfirm === note.id ? (
                  <>
                    <button
                      className="memory-action-btn danger"
                      onClick={() => handleDelete(note.id)}
                    >
                      Confirm
                    </button>
                    <button
                      className="memory-action-btn"
                      onClick={() => setDeleteConfirm(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    className="memory-action-btn"
                    onClick={() => setDeleteConfirm(note.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
            <div className="memory-note-content">{note.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
