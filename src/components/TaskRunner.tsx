import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/task-runner.css";

interface TaskDefinition {
  name: string;
  command: string;
  source: string;
  description: string | null;
}

interface TaskRunnerProps {
  cwd: string;
  onRunCommand?: (command: string) => void;
  onClose: () => void;
}

const SOURCE_ICONS: Record<string, string> = {
  "package.json": "\u{1F4E6}",
  Makefile: "\u{1F6E0}",
  "Cargo.toml": "\u{1F980}",
};

export function TaskRunner({ cwd, onRunCommand, onClose }: TaskRunnerProps) {
  const [tasks, setTasks] = useState<TaskDefinition[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<TaskDefinition[]>("discover_tasks", {
        path: cwd,
      });
      setTasks(result);
    } catch {
      setTasks([]);
    }
    setLoading(false);
  }, [cwd]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleRun = useCallback(
    (command: string) => {
      onRunCommand?.(command);
      onClose();
    },
    [onRunCommand, onClose],
  );

  const filtered = useMemo(() => {
    if (!filter.trim()) return tasks;
    const q = filter.toLowerCase();
    return tasks.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.command.toLowerCase().includes(q) ||
        t.source.toLowerCase().includes(q) ||
        (t.description?.toLowerCase().includes(q) ?? false),
    );
  }, [tasks, filter]);

  // Group by source
  const groups = useMemo(() => {
    const map = new Map<string, TaskDefinition[]>();
    for (const task of filtered) {
      const existing = map.get(task.source) ?? [];
      existing.push(task);
      map.set(task.source, existing);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="taskrunner-backdrop" onClick={onClose}>
      <div className="taskrunner-panel" onClick={(e) => e.stopPropagation()}>
        <div className="taskrunner-header">
          <h3 className="taskrunner-title">Task Runner</h3>
          <div className="taskrunner-header-actions">
            <button
              className="taskrunner-action-btn"
              onClick={loadTasks}
              title="Rescan"
            >
              Rescan
            </button>
            <button className="taskrunner-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        <div className="taskrunner-search-wrap">
          <input
            className="taskrunner-search"
            type="text"
            placeholder="Filter tasks..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            spellCheck={false}
            autoFocus
          />
        </div>

        <div className="taskrunner-list">
          {loading ? (
            <div className="taskrunner-empty">Scanning for tasks...</div>
          ) : groups.length === 0 ? (
            <div className="taskrunner-empty">
              {tasks.length === 0
                ? "No tasks found in this directory."
                : "No matching tasks."}
            </div>
          ) : (
            groups.map(([source, sourceTasks]) => (
              <div key={source} className="taskrunner-group">
                <div className="taskrunner-group-label">
                  <span className="taskrunner-group-icon">
                    {SOURCE_ICONS[source] ?? "\u{1F4CB}"}
                  </span>
                  {source}
                </div>
                {sourceTasks.map((task) => (
                  <button
                    key={`${source}:${task.name}`}
                    className="taskrunner-item"
                    onClick={() => handleRun(task.command)}
                    title={`Run: ${task.command}`}
                  >
                    <div className="taskrunner-item-info">
                      <span className="taskrunner-item-name">{task.name}</span>
                      {task.description && (
                        <span className="taskrunner-item-desc">
                          {task.description}
                        </span>
                      )}
                    </div>
                    <code className="taskrunner-item-cmd">{task.command}</code>
                    <span className="taskrunner-item-run">Run</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
