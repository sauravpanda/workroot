import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/todo-panel.css";

type Priority = "high" | "medium" | "low";
type Status = "todo" | "in_progress" | "done";

interface TodoItem {
  id: number;
  title: string;
  description: string | null;
  priority: Priority;
  status: Status;
  project_id: number | null;
  created_at: string;
}

interface TodoPanelProps {
  projectId: number | null;
  onClose: () => void;
}

const STATUS_LABELS: Record<Status, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
};

const PRIORITY_OPTIONS: Priority[] = ["high", "medium", "low"];
const STATUS_ORDER: Status[] = ["todo", "in_progress", "done"];

function getNextStatus(current: Status): Status | null {
  const idx = STATUS_ORDER.indexOf(current);
  if (idx < STATUS_ORDER.length - 1) return STATUS_ORDER[idx + 1];
  return null;
}

function getPrevStatus(current: Status): Status | null {
  const idx = STATUS_ORDER.indexOf(current);
  if (idx > 0) return STATUS_ORDER[idx - 1];
  return null;
}

export function TodoPanel({ projectId, onClose }: TodoPanelProps) {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPriority, setEditPriority] = useState<Priority>("medium");
  const [editStatus, setEditStatus] = useState<Status>("todo");

  // Add card state
  const [addingCard, setAddingCard] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("medium");

  const loadTodos = useCallback(async () => {
    setLoading(true);
    try {
      const todoItems = await invoke<TodoItem[]>("list_todos", {
        projectId,
        status: null,
      });
      setTodos(todoItems);
    } catch {
      setTodos([]);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadTodos();
  }, [loadTodos]);

  const handleAdd = useCallback(async () => {
    if (!newTitle.trim()) return;
    try {
      await invoke("create_todo", {
        projectId,
        title: newTitle.trim(),
        description: null,
        priority: newPriority,
      });
      setNewTitle("");
      setNewPriority("medium");
      setAddingCard(false);
      await loadTodos();
    } catch {
      // add failed
    }
  }, [projectId, newTitle, newPriority, loadTodos]);

  const handleStatusChange = useCallback(
    async (id: number, newStatus: Status) => {
      try {
        await invoke("update_todo", {
          id,
          status: newStatus,
        });
        await loadTodos();
      } catch {
        // update failed
      }
    },
    [loadTodos],
  );

  const startEdit = useCallback((item: TodoItem) => {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditDesc(item.description ?? "");
    setEditPriority(item.priority);
    setEditStatus(item.status);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (editingId === null || !editTitle.trim()) return;
    try {
      await invoke("update_todo", {
        id: editingId,
        title: editTitle.trim(),
        description: editDesc.trim() || null,
        priority: editPriority,
        status: editStatus,
      });
      setEditingId(null);
      await loadTodos();
    } catch {
      // save failed
    }
  }, [editingId, editTitle, editDesc, editPriority, editStatus, loadTodos]);

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await invoke("delete_todo", { id });
        if (editingId === id) setEditingId(null);
        await loadTodos();
      } catch {
        // delete failed
      }
    },
    [editingId, loadTodos],
  );

  const filteredTodos =
    priorityFilter === "all"
      ? todos
      : todos.filter((t) => t.priority === priorityFilter);

  const columns: Record<Status, TodoItem[]> = {
    todo: filteredTodos.filter((t) => t.status === "todo"),
    in_progress: filteredTodos.filter((t) => t.status === "in_progress"),
    done: filteredTodos.filter((t) => t.status === "done"),
  };

  return (
    <div className="todop-backdrop" onClick={onClose}>
      <div className="todop-panel" onClick={(e) => e.stopPropagation()}>
        <div className="todop-header">
          <h3 className="todop-title">Todos</h3>
          <div className="todop-header-actions">
            <select
              className="todop-priority-filter"
              value={priorityFilter}
              onChange={(e) =>
                setPriorityFilter(e.target.value as Priority | "all")
              }
            >
              <option value="all">All Priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <button className="todop-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        <div className="todop-board">
          {loading ? (
            <div className="todop-empty">Loading todos...</div>
          ) : (
            STATUS_ORDER.map((status) => (
              <div key={status} className="todop-column">
                <div className="todop-column-header">
                  <span className="todop-column-title">
                    {STATUS_LABELS[status]}
                  </span>
                  <span className="todop-column-count">
                    {columns[status].length}
                  </span>
                </div>

                {status === "todo" && (
                  <div className="todop-add-area">
                    {addingCard ? (
                      <div className="todop-add-form">
                        <input
                          className="todop-add-input"
                          type="text"
                          placeholder="Task title..."
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          spellCheck={false}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleAdd();
                            if (e.key === "Escape") setAddingCard(false);
                          }}
                        />
                        <select
                          className="todop-add-priority"
                          value={newPriority}
                          onChange={(e) =>
                            setNewPriority(e.target.value as Priority)
                          }
                        >
                          {PRIORITY_OPTIONS.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                        <div className="todop-add-actions">
                          <button
                            className="todop-add-save"
                            onClick={handleAdd}
                            disabled={!newTitle.trim()}
                          >
                            Add
                          </button>
                          <button
                            className="todop-add-cancel"
                            onClick={() => setAddingCard(false)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="todop-add-btn"
                        onClick={() => setAddingCard(true)}
                      >
                        + Add Card
                      </button>
                    )}
                  </div>
                )}

                <div className="todop-column-cards">
                  {columns[status].map((item) => {
                    const isEditing = editingId === item.id;
                    const prevStatus = getPrevStatus(item.status);
                    const nextStatus = getNextStatus(item.status);
                    return (
                      <div
                        key={item.id}
                        className={`todop-card todop-card-${item.priority}`}
                      >
                        {isEditing ? (
                          <div className="todop-card-edit">
                            <input
                              className="todop-edit-title"
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              spellCheck={false}
                            />
                            <textarea
                              className="todop-edit-desc"
                              placeholder="Description..."
                              value={editDesc}
                              onChange={(e) => setEditDesc(e.target.value)}
                              rows={2}
                              spellCheck={false}
                            />
                            <div className="todop-edit-selects">
                              <select
                                className="todop-edit-select"
                                value={editPriority}
                                onChange={(e) =>
                                  setEditPriority(e.target.value as Priority)
                                }
                              >
                                {PRIORITY_OPTIONS.map((p) => (
                                  <option key={p} value={p}>
                                    {p}
                                  </option>
                                ))}
                              </select>
                              <select
                                className="todop-edit-select"
                                value={editStatus}
                                onChange={(e) =>
                                  setEditStatus(e.target.value as Status)
                                }
                              >
                                {STATUS_ORDER.map((s) => (
                                  <option key={s} value={s}>
                                    {STATUS_LABELS[s]}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="todop-edit-actions">
                              <button
                                className="todop-edit-save"
                                onClick={handleSaveEdit}
                                disabled={!editTitle.trim()}
                              >
                                Save
                              </button>
                              <button
                                className="todop-edit-cancel"
                                onClick={() => setEditingId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div
                              className="todop-card-body"
                              onClick={() => startEdit(item)}
                            >
                              <div className="todop-card-top">
                                <span className="todop-card-title">
                                  {item.title}
                                </span>
                                <span
                                  className={`todop-priority-badge todop-priority-${item.priority}`}
                                >
                                  {item.priority}
                                </span>
                              </div>
                              {item.description && (
                                <p className="todop-card-desc">
                                  {item.description.length > 80
                                    ? item.description.slice(0, 80) + "..."
                                    : item.description}
                                </p>
                              )}
                            </div>
                            <div className="todop-card-footer">
                              <div className="todop-card-arrows">
                                {prevStatus && (
                                  <button
                                    className="todop-arrow-btn"
                                    onClick={() =>
                                      handleStatusChange(item.id, prevStatus)
                                    }
                                    title={`Move to ${STATUS_LABELS[prevStatus]}`}
                                  >
                                    &larr;
                                  </button>
                                )}
                                {nextStatus && (
                                  <button
                                    className="todop-arrow-btn"
                                    onClick={() =>
                                      handleStatusChange(item.id, nextStatus)
                                    }
                                    title={`Move to ${STATUS_LABELS[nextStatus]}`}
                                  >
                                    &rarr;
                                  </button>
                                )}
                              </div>
                              <button
                                className="todop-delete-btn"
                                onClick={() => handleDelete(item.id)}
                              >
                                &times;
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
