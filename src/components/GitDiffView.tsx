import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DiffViewer } from "./DiffViewer";
import type { FileDiff } from "./DiffViewer";
import { CommitPanel } from "./CommitPanel";

interface ChangedFile {
  path: string;
  status: string;
  staged: boolean;
}

interface GitDiffViewProps {
  worktreeId: number;
  onCreatePR?: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  added: "text-[#4ade80] bg-[rgba(74,222,128,0.1)]",
  untracked: "text-[#4ade80] bg-[rgba(74,222,128,0.1)]",
  modified: "text-[#60a5fa] bg-[rgba(96,165,250,0.1)]",
  deleted: "text-[#f87171] bg-[rgba(248,113,113,0.1)]",
  renamed: "text-[#c084fc] bg-[rgba(192,132,252,0.1)]",
};

function statusLabel(status: string): string {
  if (status === "untracked") return "U";
  return status[0].toUpperCase();
}

export function GitDiffView({ worktreeId, onCreatePR }: GitDiffViewProps) {
  const [files, setFiles] = useState<ChangedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<{
    path: string;
    staged: boolean;
  } | null>(null);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [diffLoading, setDiffLoading] = useState(false);

  const loadFiles = useCallback(async () => {
    try {
      const result = await invoke<ChangedFile[]>("get_changed_files", {
        worktreeId,
      });
      setFiles(result);
    } catch (err) {
      console.error("Failed to load changed files:", err);
    } finally {
      setLoading(false);
    }
  }, [worktreeId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const loadDiff = useCallback(
    async (filePath: string, staged: boolean) => {
      setDiffLoading(true);
      try {
        const result = await invoke<FileDiff>("get_file_diff", {
          worktreeId,
          filePath,
          staged,
        });
        setDiff(result);
      } catch (err) {
        console.error("Failed to load diff:", err);
        setDiff(null);
      } finally {
        setDiffLoading(false);
      }
    },
    [worktreeId],
  );

  const handleFileClick = (file: ChangedFile) => {
    setSelectedFile({ path: file.path, staged: file.staged });
    loadDiff(file.path, file.staged);
  };

  const handleStageFile = async (file: ChangedFile) => {
    try {
      if (file.staged) {
        await invoke("unstage_files", { worktreeId, files: [file.path] });
      } else {
        await invoke("stage_files", { worktreeId, files: [file.path] });
      }
      await loadFiles();
    } catch (err) {
      console.error("Failed to stage/unstage:", err);
    }
  };

  const handleStageAll = async () => {
    const unstaged = files.filter((f) => !f.staged);
    if (unstaged.length === 0) return;
    try {
      await invoke("stage_files", {
        worktreeId,
        files: unstaged.map((f) => f.path),
      });
      await loadFiles();
    } catch (err) {
      console.error("Failed to stage all:", err);
    }
  };

  const handleUnstageAll = async () => {
    const staged = files.filter((f) => f.staged);
    if (staged.length === 0) return;
    try {
      await invoke("unstage_files", {
        worktreeId,
        files: staged.map((f) => f.path),
      });
      await loadFiles();
    } catch (err) {
      console.error("Failed to unstage all:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[200px] items-center justify-center text-[var(--text-muted)]">
        Loading changes...
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex h-[200px] flex-col items-center justify-center text-[var(--text-muted)]">
        <div className="mb-3 text-[32px] font-bold opacity-40">&#10003;</div>
        <p>Working tree clean</p>
        <p className="text-xs opacity-70">No uncommitted changes</p>
      </div>
    );
  }

  const stagedFiles = files.filter((f) => f.staged);
  const unstagedFiles = files.filter((f) => !f.staged);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">
          {files.length} changed file{files.length !== 1 ? "s" : ""}
        </span>
        <div className="flex gap-1.5">
          <button
            className="cursor-pointer rounded-[3px] border border-[var(--border)] bg-transparent px-2.5 py-1 text-xs text-[var(--text-muted)] transition-colors duration-100 hover:text-[var(--text-primary)] disabled:cursor-default disabled:opacity-40"
            onClick={handleStageAll}
            disabled={unstagedFiles.length === 0}
          >
            Stage All
          </button>
          <button
            className="cursor-pointer rounded-[3px] border border-[var(--border)] bg-transparent px-2.5 py-1 text-xs text-[var(--text-muted)] transition-colors duration-100 hover:text-[var(--text-primary)] disabled:cursor-default disabled:opacity-40"
            onClick={handleUnstageAll}
            disabled={stagedFiles.length === 0}
          >
            Unstage All
          </button>
          <button
            className="cursor-pointer rounded-[3px] border border-[var(--border)] bg-transparent px-2.5 py-1 text-xs text-[var(--text-muted)] transition-colors duration-100 hover:text-[var(--text-primary)]"
            onClick={loadFiles}
          >
            Refresh
          </button>
          {onCreatePR && (
            <button
              className="cursor-pointer rounded-[3px] border border-[var(--accent-muted)] bg-transparent px-2.5 py-1 text-xs text-[var(--accent)] transition-colors duration-100 hover:bg-[var(--accent-muted)]"
              onClick={onCreatePR}
            >
              Create PR ↗
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* File list */}
        <div className="flex w-[260px] flex-col overflow-y-auto border-r border-[var(--border)]">
          {stagedFiles.length > 0 && (
            <>
              <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[11px] font-semibold uppercase text-[var(--text-muted)]">
                Staged
                <span className="rounded-full bg-[var(--bg-elevated)] px-1.5 py-px text-[10px]">
                  {stagedFiles.length}
                </span>
              </div>
              {stagedFiles.map((file) => (
                <div
                  key={`staged-${file.path}`}
                  className={`flex cursor-pointer items-center gap-2 border-l-2 px-3 py-[5px] text-[13px] transition-colors duration-100 hover:bg-[var(--bg-hover)] ${
                    selectedFile?.path === file.path &&
                    selectedFile?.staged === true
                      ? "border-l-[var(--accent)] bg-[var(--bg-hover)]"
                      : "border-l-transparent"
                  }`}
                  onClick={() => handleFileClick(file)}
                >
                  <input
                    type="checkbox"
                    className="size-3.5 cursor-pointer accent-[var(--accent)]"
                    checked={true}
                    onChange={() => handleStageFile(file)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span
                    className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-primary)]"
                    title={file.path}
                  >
                    {file.path}
                  </span>
                  <span
                    className={`rounded-[3px] px-[5px] py-px text-[11px] font-semibold ${STATUS_STYLES[file.status] ?? "text-[var(--text-muted)]"}`}
                  >
                    {statusLabel(file.status)}
                  </span>
                </div>
              ))}
            </>
          )}

          {unstagedFiles.length > 0 && (
            <>
              <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[11px] font-semibold uppercase text-[var(--text-muted)]">
                Changes
                <span className="rounded-full bg-[var(--bg-elevated)] px-1.5 py-px text-[10px]">
                  {unstagedFiles.length}
                </span>
              </div>
              {unstagedFiles.map((file) => (
                <div
                  key={`unstaged-${file.path}`}
                  className={`flex cursor-pointer items-center gap-2 border-l-2 px-3 py-[5px] text-[13px] transition-colors duration-100 hover:bg-[var(--bg-hover)] ${
                    selectedFile?.path === file.path &&
                    selectedFile?.staged === false
                      ? "border-l-[var(--accent)] bg-[var(--bg-hover)]"
                      : "border-l-transparent"
                  }`}
                  onClick={() => handleFileClick(file)}
                >
                  <input
                    type="checkbox"
                    className="size-3.5 cursor-pointer accent-[var(--accent)]"
                    checked={false}
                    onChange={() => handleStageFile(file)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span
                    className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-primary)]"
                    title={file.path}
                  >
                    {file.path}
                  </span>
                  <span
                    className={`rounded-[3px] px-[5px] py-px text-[11px] font-semibold ${STATUS_STYLES[file.status] ?? "text-[var(--text-muted)]"}`}
                  >
                    {statusLabel(file.status)}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Diff content */}
        <div className="flex-1 overflow-y-auto">
          {diffLoading ? (
            <div className="flex h-[200px] items-center justify-center text-[13px] text-[var(--text-muted)]">
              Loading diff...
            </div>
          ) : diff ? (
            <DiffViewer diff={diff} />
          ) : (
            <div className="flex h-[200px] items-center justify-center text-[13px] text-[var(--text-muted)]">
              Select a file to view its diff
            </div>
          )}
        </div>
      </div>

      <CommitPanel
        worktreeId={worktreeId}
        stagedCount={stagedFiles.length}
        onCommitSuccess={() => {
          loadFiles();
          setDiff(null);
          setSelectedFile(null);
        }}
      />
    </div>
  );
}
