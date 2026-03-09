import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DiffViewer } from "./DiffViewer";
import type { FileDiff } from "./DiffViewer";
import { CommitPanel } from "./CommitPanel";
import "../styles/git-diff.css";

interface ChangedFile {
  path: string;
  status: string;
  staged: boolean;
}

interface GitDiffViewProps {
  worktreeId: number;
}

export function GitDiffView({ worktreeId }: GitDiffViewProps) {
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
    [worktreeId]
  );

  const handleFileClick = (file: ChangedFile) => {
    setSelectedFile({ path: file.path, staged: file.staged });
    loadDiff(file.path, file.staged);
  };

  const handleStageFile = async (file: ChangedFile) => {
    try {
      if (file.staged) {
        await invoke("unstage_files", {
          worktreeId,
          files: [file.path],
        });
      } else {
        await invoke("stage_files", {
          worktreeId,
          files: [file.path],
        });
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
    return <div className="git-diff-loading">Loading changes...</div>;
  }

  if (files.length === 0) {
    return (
      <div className="git-diff-empty">
        <div className="git-diff-empty-icon">&#10003;</div>
        <p>Working tree clean</p>
        <p className="git-diff-empty-hint">No uncommitted changes</p>
      </div>
    );
  }

  const stagedFiles = files.filter((f) => f.staged);
  const unstagedFiles = files.filter((f) => !f.staged);

  return (
    <div className="git-diff">
      <div className="git-diff-header">
        <span className="git-diff-title">
          {files.length} changed file{files.length !== 1 ? "s" : ""}
        </span>
        <div className="git-diff-actions">
          <button
            className="git-diff-btn"
            onClick={handleStageAll}
            disabled={unstagedFiles.length === 0}
          >
            Stage All
          </button>
          <button
            className="git-diff-btn"
            onClick={handleUnstageAll}
            disabled={stagedFiles.length === 0}
          >
            Unstage All
          </button>
          <button className="git-diff-btn" onClick={loadFiles}>
            Refresh
          </button>
        </div>
      </div>

      <div className="git-diff-body">
        <div className="git-diff-file-list">
          {stagedFiles.length > 0 && (
            <>
              <div className="git-diff-section-header">
                Staged
                <span className="git-diff-section-count">
                  {stagedFiles.length}
                </span>
              </div>
              {stagedFiles.map((file) => (
                <div
                  key={`staged-${file.path}`}
                  className={`git-diff-file-item ${
                    selectedFile?.path === file.path &&
                    selectedFile?.staged === true
                      ? "active"
                      : ""
                  }`}
                  onClick={() => handleFileClick(file)}
                >
                  <input
                    type="checkbox"
                    className="git-diff-file-checkbox"
                    checked={true}
                    onChange={() => handleStageFile(file)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="git-diff-file-name" title={file.path}>
                    {file.path}
                  </span>
                  <span className={`git-diff-file-status ${file.status}`}>
                    {file.status[0].toUpperCase()}
                  </span>
                </div>
              ))}
            </>
          )}

          {unstagedFiles.length > 0 && (
            <>
              <div className="git-diff-section-header">
                Changes
                <span className="git-diff-section-count">
                  {unstagedFiles.length}
                </span>
              </div>
              {unstagedFiles.map((file) => (
                <div
                  key={`unstaged-${file.path}`}
                  className={`git-diff-file-item ${
                    selectedFile?.path === file.path &&
                    selectedFile?.staged === false
                      ? "active"
                      : ""
                  }`}
                  onClick={() => handleFileClick(file)}
                >
                  <input
                    type="checkbox"
                    className="git-diff-file-checkbox"
                    checked={false}
                    onChange={() => handleStageFile(file)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="git-diff-file-name" title={file.path}>
                    {file.path}
                  </span>
                  <span className={`git-diff-file-status ${file.status}`}>
                    {file.status === "untracked"
                      ? "U"
                      : file.status[0].toUpperCase()}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="git-diff-content">
          {diffLoading ? (
            <div className="git-diff-placeholder">Loading diff...</div>
          ) : diff ? (
            <DiffViewer diff={diff} />
          ) : (
            <div className="git-diff-placeholder">
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
