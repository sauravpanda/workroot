import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/dead-ends.css";

interface DeadEndEntry {
  id: number;
  worktree_id: number;
  approach: string;
  failure_reason: string;
  error_message: string | null;
  created_at: string;
}

function relativeTime(timestamp: string): string {
  const date = new Date(timestamp + "Z");
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

interface DeadEndsLogProps {
  worktreeId: number;
}

export function DeadEndsLog({ worktreeId }: DeadEndsLogProps) {
  const [entries, setEntries] = useState<DeadEndEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [formApproach, setFormApproach] = useState("");
  const [formReason, setFormReason] = useState("");
  const [formError, setFormError] = useState("");

  const loadEntries = useCallback(async () => {
    try {
      if (searchQuery.trim()) {
        const results = await invoke<DeadEndEntry[]>("search_dead_ends", {
          worktreeId,
          query: searchQuery.trim(),
        });
        setEntries(results);
      } else {
        const results = await invoke<DeadEndEntry[]>("get_dead_ends", {
          worktreeId,
        });
        setEntries(results);
      }
    } catch (err) {
      console.error("Failed to load dead ends:", err);
    }
  }, [worktreeId, searchQuery]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!formApproach.trim() || !formReason.trim()) return;
    try {
      await invoke("add_dead_end", {
        worktreeId,
        approach: formApproach.trim(),
        failureReason: formReason.trim(),
        errorMessage: formError.trim() || null,
      });
      setFormApproach("");
      setFormReason("");
      setFormError("");
      setShowForm(false);
      loadEntries();
    } catch (err) {
      console.error("Failed to add dead end:", err);
    }
  };

  return (
    <div className="dead-ends">
      <div className="dead-ends-toolbar">
        <input
          type="text"
          className="dead-ends-search"
          placeholder="Search dead ends..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button
          className="dead-ends-add-btn"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "Cancel" : "+ Add Dead End"}
        </button>
      </div>

      {showForm && (
        <div className="dead-ends-form">
          <input
            type="text"
            className="dead-ends-input"
            placeholder="What was tried?"
            value={formApproach}
            onChange={(e) => setFormApproach(e.target.value)}
          />
          <input
            type="text"
            className="dead-ends-input"
            placeholder="Why did it fail?"
            value={formReason}
            onChange={(e) => setFormReason(e.target.value)}
          />
          <textarea
            className="dead-ends-textarea"
            placeholder="Error message (optional)"
            value={formError}
            onChange={(e) => setFormError(e.target.value)}
            rows={3}
          />
          <button
            className="dead-ends-submit"
            onClick={handleSubmit}
            disabled={!formApproach.trim() || !formReason.trim()}
          >
            Save Dead End
          </button>
        </div>
      )}

      <div className="dead-ends-list">
        {entries.length === 0 && !showForm && (
          <div className="dead-ends-empty">
            <p>No dead ends recorded</p>
            <p className="dead-ends-empty-hint">
              Record failed approaches to prevent repeating them
            </p>
          </div>
        )}

        {entries.map((entry) => (
          <div
            key={entry.id}
            className={`dead-end-entry ${expanded.has(entry.id) ? "expanded" : ""}`}
            onClick={() => toggleExpanded(entry.id)}
          >
            <div className="dead-end-header">
              <span className="dead-end-icon">&#10007;</span>
              <div className="dead-end-summary">
                <div className="dead-end-approach">{entry.approach}</div>
                <div className="dead-end-reason">{entry.failure_reason}</div>
              </div>
              <span className="dead-end-time" title={entry.created_at}>
                {relativeTime(entry.created_at)}
              </span>
            </div>
            {expanded.has(entry.id) && entry.error_message && (
              <div className="dead-end-detail">
                <pre className="dead-end-error">{entry.error_message}</pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
