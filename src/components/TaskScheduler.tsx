import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Dialog, DialogContent } from "./ui/dialog";

interface ScheduledTask {
  id: number;
  name: string;
  command: string;
  cron_expression: string;
  cwd: string | null;
  enabled: boolean;
  last_run: string | null;
}

interface TaskSchedulerProps {
  onClose: () => void;
}

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
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

const CRON_EXAMPLES = [
  { expr: "*/5 * * * *", desc: "Every 5 minutes" },
  { expr: "0 * * * *", desc: "Every hour" },
  { expr: "0 9 * * *", desc: "Daily at 9am" },
  { expr: "0 9 * * 1-5", desc: "Weekdays at 9am" },
  { expr: "0 0 * * 0", desc: "Weekly (Sunday midnight)" },
];

export function TaskScheduler({ onClose }: TaskSchedulerProps) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [cronExpr, setCronExpr] = useState("");
  const [cwd, setCwd] = useState("");
  const [creating, setCreating] = useState(false);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<ScheduledTask[]>("list_scheduled_tasks");
      setTasks(result);
    } catch {
      setTasks([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleCreate = useCallback(async () => {
    if (!name.trim() || !command.trim() || !cronExpr.trim()) return;
    setCreating(true);
    try {
      await invoke("create_scheduled_task", {
        name: name.trim(),
        command: command.trim(),
        cronExpression: cronExpr.trim(),
        cwd: cwd.trim() || null,
      });
      setName("");
      setCommand("");
      setCronExpr("");
      setCwd("");
      setShowForm(false);
      await loadTasks();
    } catch {
      // creation failed
    }
    setCreating(false);
  }, [name, command, cronExpr, cwd, loadTasks]);

  const handleToggle = useCallback(
    async (id: number) => {
      try {
        await invoke("toggle_scheduled_task", { id });
        await loadTasks();
      } catch {
        // toggle failed
      }
    },
    [loadTasks],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await invoke("delete_scheduled_task", { id });
        await loadTasks();
      } catch {
        // delete failed
      }
    },
    [loadTasks],
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="tasksched-panel">
        <div className="tasksched-header">
          <h3 className="tasksched-title">Task Scheduler</h3>
          <button className="tasksched-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="tasksched-toolbar">
          {showForm ? (
            <div className="tasksched-form">
              <input
                className="tasksched-input"
                type="text"
                placeholder="Task name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                spellCheck={false}
              />
              <input
                className="tasksched-input tasksched-input-mono"
                type="text"
                placeholder="Command (e.g. npm run build)"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                spellCheck={false}
              />
              <div className="tasksched-cron-row">
                <input
                  className="tasksched-input tasksched-input-mono"
                  type="text"
                  placeholder="Cron expression (e.g. */5 * * * *)"
                  value={cronExpr}
                  onChange={(e) => setCronExpr(e.target.value)}
                  spellCheck={false}
                />
                <input
                  className="tasksched-input"
                  type="text"
                  placeholder="Working directory (optional)"
                  value={cwd}
                  onChange={(e) => setCwd(e.target.value)}
                  spellCheck={false}
                />
              </div>
              <div className="tasksched-cron-help">
                <span className="tasksched-cron-help-label">Examples:</span>
                {CRON_EXAMPLES.map((ex) => (
                  <button
                    key={ex.expr}
                    className="tasksched-cron-example"
                    onClick={() => setCronExpr(ex.expr)}
                    title={ex.desc}
                  >
                    <span className="tasksched-cron-expr">{ex.expr}</span>
                    <span className="tasksched-cron-desc">{ex.desc}</span>
                  </button>
                ))}
              </div>
              <div className="tasksched-form-actions">
                <button
                  className="tasksched-create-btn"
                  onClick={handleCreate}
                  disabled={
                    creating ||
                    !name.trim() ||
                    !command.trim() ||
                    !cronExpr.trim()
                  }
                >
                  {creating ? "Creating..." : "Create Task"}
                </button>
                <button
                  className="tasksched-cancel-btn"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              className="tasksched-add-btn"
              onClick={() => setShowForm(true)}
            >
              + New Scheduled Task
            </button>
          )}
        </div>

        <div className="tasksched-list">
          {loading ? (
            <div className="tasksched-empty">Loading tasks...</div>
          ) : tasks.length === 0 ? (
            <div className="tasksched-empty">No scheduled tasks.</div>
          ) : (
            tasks.map((task) => (
              <div
                key={task.id}
                className={`tasksched-item ${!task.enabled ? "tasksched-item-disabled" : ""}`}
              >
                <div className="tasksched-item-toggle">
                  <button
                    className={`tasksched-toggle ${task.enabled ? "tasksched-toggle-on" : ""}`}
                    onClick={() => handleToggle(task.id)}
                    title={task.enabled ? "Disable" : "Enable"}
                  >
                    <span className="tasksched-toggle-knob" />
                  </button>
                </div>
                <div className="tasksched-item-info">
                  <div className="tasksched-item-top">
                    <span className="tasksched-item-name">{task.name}</span>
                    <span className="tasksched-item-cron">
                      {task.cron_expression}
                    </span>
                  </div>
                  <div className="tasksched-item-cmd">{task.command}</div>
                  <div className="tasksched-item-meta">
                    {task.cwd && (
                      <span className="tasksched-item-cwd">{task.cwd}</span>
                    )}
                    <span className="tasksched-item-lastrun">
                      Last run: {formatRelativeDate(task.last_run)}
                    </span>
                  </div>
                </div>
                <button
                  className="tasksched-delete-btn"
                  onClick={() => handleDelete(task.id)}
                  title="Delete task"
                >
                  &times;
                </button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
