import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/create-pr.css";

interface ExistingPR {
  number: number;
  title: string;
  html_url: string;
  state: string;
  draft: boolean;
}

interface PrCreateResult {
  number: number;
  html_url: string;
}

interface CreatePRPanelProps {
  worktreeId: number;
  branch: string;
}

export function CreatePRPanel({ worktreeId, branch }: CreatePRPanelProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  const [draft, setDraft] = useState(false);
  const [existingPR, setExistingPR] = useState<ExistingPR | null>(null);
  const [createdPR, setCreatedPR] = useState<PrCreateResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const init = useCallback(async () => {
    setLoading(true);
    try {
      // Check for existing PR, get default branch, get template in parallel
      const [existing, defaultBranch, template] = await Promise.all([
        invoke<ExistingPR | null>("get_pr_for_branch", { worktreeId }),
        invoke<string>("get_default_branch", { worktreeId }),
        invoke<string | null>("get_pr_template", { worktreeId }),
      ]);

      setExistingPR(existing);
      setBaseBranch(defaultBranch);

      if (!existing) {
        // Pre-fill title from branch name
        const branchTitle = branch
          .replace(/^(feature|fix|chore|docs|refactor)\//, "")
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        setTitle(branchTitle);

        if (template) {
          setBody(template);
        }
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [worktreeId, branch]);

  useEffect(() => {
    init();
  }, [init]);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setCreating(true);
    setError(null);

    try {
      const result = await invoke<PrCreateResult>("create_pull_request", {
        worktreeId,
        title: title.trim(),
        body: body.trim(),
        base: baseBranch,
        draft,
      });
      setCreatedPR(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <div className="create-pr-loading">Loading...</div>;
  }

  if (createdPR) {
    return (
      <div className="create-pr">
        <div className="create-pr-success">
          <span>PR #{createdPR.number} created successfully</span>
          <a
            href={createdPR.html_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub
          </a>
        </div>
      </div>
    );
  }

  if (existingPR) {
    return (
      <div className="create-pr">
        <div className="create-pr-header">
          <span className="create-pr-title">Pull Request</span>
          <span className="create-pr-branch-info">
            <span className="create-pr-branch-name">{branch}</span>
          </span>
        </div>
        <div className="create-pr-existing">
          <span className="create-pr-existing-badge">
            PR #{existingPR.number} already open
            {existingPR.draft ? " (draft)" : ""}
          </span>
          <strong>{existingPR.title}</strong>
          <a
            href={existingPR.html_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="create-pr">
      <div className="create-pr-header">
        <span className="create-pr-title">Create Pull Request</span>
        <span className="create-pr-branch-info">
          <span className="create-pr-branch-name">{branch}</span>
          {" -> "}
          <span className="create-pr-branch-name">{baseBranch}</span>
        </span>
      </div>

      <div className="create-pr-form">
        {error && <div className="create-pr-error">{error}</div>}

        <div className="create-pr-field">
          <label className="create-pr-label">Title</label>
          <input
            type="text"
            className="create-pr-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="PR title..."
          />
        </div>

        <div className="create-pr-field">
          <label className="create-pr-label">Description</label>
          <textarea
            className="create-pr-textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Describe your changes..."
          />
        </div>

        <div className="create-pr-row">
          <div className="create-pr-field">
            <label className="create-pr-label">Base Branch</label>
            <select
              className="create-pr-select"
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
            >
              <option value="main">main</option>
              <option value="master">master</option>
              <option value="develop">develop</option>
            </select>
          </div>

          <label className="create-pr-toggle">
            <input
              type="checkbox"
              checked={draft}
              onChange={(e) => setDraft(e.target.checked)}
            />
            Draft PR
          </label>
        </div>
      </div>

      <div className="create-pr-footer">
        <span />
        <button
          className="create-pr-btn"
          disabled={!title.trim() || creating}
          onClick={handleCreate}
        >
          {creating ? "Creating..." : "Create Pull Request"}
        </button>
      </div>
    </div>
  );
}
