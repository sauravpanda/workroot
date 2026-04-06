import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import "../styles/commit-panel.css";

interface PushStatus {
  ahead: number;
  behind: number;
  remote_branch: string | null;
}

interface CommitPanelProps {
  worktreeId: number;
  stagedCount: number;
  onCommitSuccess: () => void;
}

export function CommitPanel({
  worktreeId,
  stagedCount,
  onCommitSuccess,
}: CommitPanelProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [committing, setCommitting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadPushStatus = useCallback(async () => {
    try {
      const status = await invoke<PushStatus>("get_push_status", {
        worktreeId,
      });
      setPushStatus(status);
    } catch {
      // Ignore — may not have a remote
    }
  }, [worktreeId]);

  useEffect(() => {
    loadPushStatus();
  }, [loadPushStatus]);

  const handleCommit = async (andPush: boolean) => {
    if (!subject.trim() || stagedCount === 0) return;

    setError(null);
    setSuccess(null);
    setCommitting(true);

    const message = body.trim()
      ? `${subject.trim()}\n\n${body.trim()}`
      : subject.trim();

    try {
      const oid = await invoke<string>("git_commit", {
        worktreeId,
        message,
      });

      if (andPush) {
        setPushing(true);
        try {
          await invoke("git_push", { worktreeId });
          setSuccess(`Committed ${oid.slice(0, 7)} and pushed`);
        } catch (pushErr) {
          setSuccess(`Committed ${oid.slice(0, 7)}`);
          setError(`Push failed: ${pushErr}`);
        } finally {
          setPushing(false);
        }
      } else {
        setSuccess(`Committed ${oid.slice(0, 7)}`);
      }

      setSubject("");
      setBody("");
      loadPushStatus();
      onCommitSuccess();
    } catch (err) {
      setError(String(err));
    } finally {
      setCommitting(false);
    }
  };

  const handleAiGenerate = async () => {
    if (stagedCount === 0) return;
    setGenerating(true);
    setError(null);
    try {
      const diff = await invoke<string>("get_file_diff", {
        worktreeId,
        filePath: "",
        staged: true,
      });
      const result = await invoke<string>("ai_generate_commit_message", {
        model: "",
        diff,
      });
      const lines = result.trim().split("\n");
      setSubject(lines[0] || "");
      setBody(lines.slice(2).join("\n").trim());
    } catch (err) {
      setError(`AI generation failed: ${err}`);
    } finally {
      setGenerating(false);
    }
  };

  const canCommit = subject.trim().length > 0 && stagedCount > 0 && !committing;

  return (
    <div className="commit-panel">
      {error && <div className="commit-error">{error}</div>}
      {success && <div className="commit-success">{success}</div>}

      <div className="commit-subject-wrapper">
        <Input
          type="text"
          className="commit-subject h-auto py-[5px] pr-[72px] pl-2 text-[12.5px] rounded-sm"
          placeholder="Commit message..."
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canCommit) handleCommit(false);
          }}
        />
        <Button
          variant="ghost"
          size="xs"
          className="commit-ai-btn absolute right-[28px] top-1/2 -translate-y-1/2 border border-accent text-accent hover:bg-accent-muted px-[7px] h-auto py-[2px] text-[10px] font-semibold tracking-[0.3px] rounded-sm"
          disabled={stagedCount === 0 || generating}
          onClick={handleAiGenerate}
          title="Generate commit message with AI"
        >
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
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
          {generating ? "…" : "AI"}
        </Button>
        <span
          className={`commit-char-count ${subject.length > 50 ? "over" : ""}`}
        >
          {subject.length}/50
        </span>
      </div>

      <Textarea
        className="commit-body font-mono text-[11.5px] leading-[1.5] rounded-sm min-h-[42px] py-[5px] px-2 resize-vertical"
        placeholder="Extended description (optional)"
        rows={2}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />

      <div className="commit-footer">
        <div className="commit-staged-info">
          {stagedCount > 0
            ? `${stagedCount} file${stagedCount !== 1 ? "s" : ""} staged`
            : "No files staged"}
          {pushStatus && pushStatus.ahead > 0 && (
            <span className="push-status">
              {" "}
              &middot; <span className="ahead">{pushStatus.ahead} ahead</span>
              {pushStatus.behind > 0 && (
                <>
                  , <span className="behind">{pushStatus.behind} behind</span>
                </>
              )}
            </span>
          )}
        </div>
        <div className="commit-buttons">
          <Button
            variant="outline"
            size="sm"
            className="h-auto py-1 px-[11px] text-[11.5px] border-border-strong bg-bg-elevated text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-sm"
            disabled={!canCommit}
            onClick={() => handleCommit(false)}
          >
            {committing ? "Committing..." : "Commit"}
          </Button>
          <Button
            size="sm"
            className="h-auto py-1 px-[11px] text-[11.5px] bg-accent border-accent text-bg-base hover:bg-accent-hover hover:border-accent-hover font-semibold rounded-sm"
            disabled={!canCommit}
            onClick={() => handleCommit(true)}
          >
            {pushing ? "Pushing..." : "Commit & Push"}
          </Button>
        </div>
      </div>
    </div>
  );
}
