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
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const init = useCallback(async () => {
    setLoading(true);
    try {
      const [existing, defaultBranch, template] = await Promise.all([
        invoke<ExistingPR | null>("get_pr_for_branch", { worktreeId }),
        invoke<string>("get_default_branch", { worktreeId }),
        invoke<string | null>("get_pr_template", { worktreeId }),
      ]);

      setExistingPR(existing);
      setBaseBranch(defaultBranch);

      if (!existing) {
        const branchTitle = branch
          .replace(/^(feature|fix|chore|docs|refactor)\//, "")
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        setTitle(branchTitle);
        if (template) setBody(template);
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

  const handleAiDescription = async () => {
    setGeneratingDesc(true);
    setError(null);
    try {
      const diff = await invoke<string>("get_file_diff", {
        worktreeId,
        filePath: "",
        staged: true,
      });
      const result = await invoke<string>("ai_generate_pr_description", {
        model: "",
        title: title.trim(),
        branchName: branch,
        diff,
      });
      setBody(result);
    } catch (err) {
      setError(`AI generation failed: ${err}`);
    } finally {
      setGeneratingDesc(false);
    }
  };

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
    return (
      <div className="create-pr-loading">
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          style={{ animation: "spin 1s linear infinite" }}
        >
          <circle
            cx="7"
            cy="7"
            r="5.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="20 15"
          />
        </svg>
        Loading…
      </div>
    );
  }

  if (createdPR) {
    return (
      <div className="create-pr">
        <div className="create-pr-header">
          <span className="create-pr-title">Pull Request</span>
        </div>
        <div className="create-pr-success">
          <div className="create-pr-success-icon">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M4 9l4 4 6-7"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="create-pr-success-title">
            PR #{createdPR.number} created
          </span>
          <a
            className="create-pr-success-link"
            href={createdPR.html_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub ↗
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
          <div className="create-pr-branch-flow">
            <span className="create-pr-branch-chip">
              <svg
                className="create-pr-chip-icon"
                width="10"
                height="10"
                viewBox="0 0 12 12"
                fill="none"
              >
                <circle
                  cx="3"
                  cy="3"
                  r="2"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <circle
                  cx="9"
                  cy="9"
                  r="2"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <path
                  d="M3 5v1a3 3 0 003 3h0"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
              {branch}
            </span>
          </div>
        </div>
        <div className="create-pr-existing-card">
          <span className="create-pr-existing-badge">
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
              <circle cx="4" cy="4" r="3" />
            </svg>
            PR #{existingPR.number} open{existingPR.draft ? " · draft" : ""}
          </span>
          <span className="create-pr-existing-title">{existingPR.title}</span>
          <a
            className="create-pr-existing-link"
            href={existingPR.html_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M2 6h8M7 3l3 3-3 3"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Open on GitHub
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="create-pr">
      <div className="create-pr-header">
        <span className="create-pr-title">Create Pull Request</span>
        <div className="create-pr-branch-flow">
          <span className="create-pr-branch-chip">
            <svg
              className="create-pr-chip-icon"
              width="10"
              height="10"
              viewBox="0 0 12 12"
              fill="none"
            >
              <circle
                cx="3"
                cy="3"
                r="2"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <circle
                cx="9"
                cy="9"
                r="2"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <path
                d="M3 5v1a3 3 0 003 3h0"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            {branch}
          </span>
          <span className="create-pr-branch-arrow">
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
              <path
                d="M1 5h11M9 2l3 3-3 3"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="create-pr-base-chip">
            <svg
              className="create-pr-chip-icon"
              width="10"
              height="10"
              viewBox="0 0 12 12"
              fill="none"
            >
              <circle
                cx="6"
                cy="3"
                r="2"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <path
                d="M6 5v6"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            {baseBranch}
          </span>
        </div>
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
            placeholder="Brief description of changes…"
          />
        </div>

        <div className="create-pr-field">
          <div className="create-pr-label-row">
            <label className="create-pr-label">Description</label>
            <button
              className="create-pr-ai-btn"
              onClick={handleAiDescription}
              disabled={generatingDesc}
              title="Generate with AI"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path
                  d="M6 1l1.2 3.8L11 6 7.2 7.2 6 11l-1.2-3.8L1 6l3.8-1.2z"
                  stroke="currentColor"
                  strokeWidth="1"
                  strokeLinejoin="round"
                  fill="currentColor"
                  opacity="0.3"
                />
                <path
                  d="M6 1l1.2 3.8L11 6 7.2 7.2 6 11l-1.2-3.8L1 6l3.8-1.2z"
                  stroke="currentColor"
                  strokeWidth="1"
                  strokeLinejoin="round"
                />
              </svg>
              {generatingDesc ? "Generating…" : "AI Generate"}
            </button>
          </div>
          <textarea
            className="create-pr-textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Describe what changed and why…"
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
        <button
          className="create-pr-btn"
          disabled={!title.trim() || creating}
          onClick={handleCreate}
        >
          {creating ? (
            <>
              <svg
                width="13"
                height="13"
                viewBox="0 0 14 14"
                fill="none"
                style={{ animation: "spin 1s linear infinite" }}
              >
                <circle
                  cx="7"
                  cy="7"
                  r="5.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeDasharray="20 15"
                />
              </svg>
              Creating…
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path
                  d="M3 7c0-2.2 1.8-4 4-4h5M9 1l3 2-3 2"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M11 9c0 2.2-1.8 4-4 4H2M5 13l-3-2 3-2"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Create Pull Request
            </>
          )}
        </button>
      </div>
    </div>
  );
}
