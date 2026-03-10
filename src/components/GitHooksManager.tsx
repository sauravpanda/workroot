import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/git-hooks.css";

interface HookInfo {
  name: string;
  enabled: boolean;
  content: string;
}

interface GitHooksManagerProps {
  worktreeId: number;
  onClose: () => void;
}

const HOOK_TEMPLATES: Record<string, string> = {
  "pre-commit":
    '#!/bin/sh\n# Run linting before commit\nnpx lint-staged || exit 1\necho "Pre-commit checks passed."',
  "commit-msg":
    '#!/bin/sh\n# Enforce conventional commits\nif ! grep -qE "^(feat|fix|docs|style|refactor|test|chore)(\\(.+\\))?: .+" "$1"; then\n  echo "Commit message must follow Conventional Commits format."\n  exit 1\nfi',
  "pre-push":
    '#!/bin/sh\n# Run tests before push\nnpm test || exit 1\necho "All tests passed."',
};

export function GitHooksManager({ worktreeId, onClose }: GitHooksManagerProps) {
  const [hooks, setHooks] = useState<HookInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHook, setSelectedHook] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  const loadHooks = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<HookInfo[]>("list_hooks", { worktreeId });
      setHooks(result);
    } catch {
      setHooks([]);
    }
    setLoading(false);
  }, [worktreeId]);

  useEffect(() => {
    loadHooks();
  }, [loadHooks]);

  const handleSelectHook = useCallback(
    (name: string) => {
      setSelectedHook(name);
      const hook = hooks.find((h) => h.name === name);
      setEditContent(hook?.content ?? "");
    },
    [hooks],
  );

  const handleSave = useCallback(async () => {
    if (!selectedHook) return;
    setSaving(true);
    try {
      await invoke("set_hook_content", {
        worktreeId,
        hookName: selectedHook,
        content: editContent,
      });
      await loadHooks();
    } catch {
      // save failed
    }
    setSaving(false);
  }, [worktreeId, selectedHook, editContent, loadHooks]);

  const handleToggle = useCallback(
    async (hookName: string, enabled: boolean) => {
      try {
        await invoke("toggle_hook", { worktreeId, hookName, enabled });
        await loadHooks();
      } catch {
        // toggle failed
      }
    },
    [worktreeId, loadHooks],
  );

  const handleApplyTemplate = useCallback((hookName: string) => {
    const template = HOOK_TEMPLATES[hookName];
    if (template) {
      setEditContent(template);
    }
  }, []);

  return (
    <div className="githooks-backdrop" onClick={onClose}>
      <div className="githooks-panel" onClick={(e) => e.stopPropagation()}>
        <div className="githooks-header">
          <h3 className="githooks-title">Git Hooks</h3>
          <button className="githooks-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="githooks-body">
          <div className="githooks-list">
            {loading ? (
              <div className="githooks-empty">Loading hooks...</div>
            ) : hooks.length === 0 ? (
              <div className="githooks-empty">No hooks found.</div>
            ) : (
              hooks.map((hook) => (
                <button
                  key={hook.name}
                  className={`githooks-item ${selectedHook === hook.name ? "active" : ""}`}
                  onClick={() => handleSelectHook(hook.name)}
                >
                  <span
                    className={`githooks-status ${hook.enabled ? "githooks-enabled" : "githooks-disabled"}`}
                  />
                  <span className="githooks-name">{hook.name}</span>
                  <button
                    className="githooks-toggle-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggle(hook.name, !hook.enabled);
                    }}
                  >
                    {hook.enabled ? "Disable" : "Enable"}
                  </button>
                </button>
              ))
            )}
          </div>

          <div className="githooks-editor">
            {selectedHook ? (
              <>
                <div className="githooks-editor-header">
                  <span className="githooks-editor-name">{selectedHook}</span>
                  <div className="githooks-editor-actions">
                    {HOOK_TEMPLATES[selectedHook] && (
                      <button
                        className="githooks-template-btn"
                        onClick={() => handleApplyTemplate(selectedHook)}
                      >
                        Template
                      </button>
                    )}
                    <button
                      className="githooks-save-btn"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
                <textarea
                  className="githooks-textarea"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  spellCheck={false}
                  placeholder="#!/bin/sh"
                />
              </>
            ) : (
              <div className="githooks-editor-empty">
                Select a hook to edit its content.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
