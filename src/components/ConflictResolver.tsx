import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/conflict-resolver.css";

interface ConflictedFile {
  path: string;
  ours: string;
  theirs: string;
  base: string;
}

interface ConflictResolverProps {
  worktreeId: number;
  onClose: () => void;
}

export function ConflictResolver({
  worktreeId,
  onClose,
}: ConflictResolverProps) {
  const [files, setFiles] = useState<ConflictedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const loadConflicts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<ConflictedFile[]>("get_conflicted_files", {
        worktreeId,
      });
      setFiles(result);
      if (result.length > 0 && !selectedFile) {
        setSelectedFile(result[0].path);
      }
    } catch {
      setFiles([]);
    }
    setLoading(false);
  }, [worktreeId, selectedFile]);

  useEffect(() => {
    loadConflicts();
  }, [loadConflicts]);

  const handleResolve = useCallback(
    async (filePath: string, resolution: "ours" | "theirs" | "both") => {
      setResolving(true);
      try {
        await invoke("resolve_conflict", {
          worktreeId,
          filePath,
          resolution,
        });
        await loadConflicts();
      } catch {
        // resolve failed
      }
      setResolving(false);
    },
    [worktreeId, loadConflicts],
  );

  const selected = files.find((f) => f.path === selectedFile);

  return (
    <div className="conflict-backdrop" onClick={onClose}>
      <div className="conflict-panel" onClick={(e) => e.stopPropagation()}>
        <div className="conflict-header">
          <h3 className="conflict-title">Conflict Resolver</h3>
          <button className="conflict-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="conflict-body">
          {loading ? (
            <div className="conflict-empty">Loading conflicts...</div>
          ) : files.length === 0 ? (
            <div className="conflict-empty">No conflicted files found.</div>
          ) : (
            <>
              <div className="conflict-file-list">
                {files.map((f) => (
                  <button
                    key={f.path}
                    className={`conflict-file-item ${selectedFile === f.path ? "active" : ""}`}
                    onClick={() => setSelectedFile(f.path)}
                  >
                    <span className="conflict-file-icon">!</span>
                    <span className="conflict-file-path">{f.path}</span>
                  </button>
                ))}
              </div>

              {selected && (
                <div className="conflict-detail">
                  <div className="conflict-actions">
                    <span className="conflict-detail-path">
                      {selected.path}
                    </span>
                    <div className="conflict-action-btns">
                      <button
                        className="conflict-resolve-btn conflict-btn-ours"
                        onClick={() => handleResolve(selected.path, "ours")}
                        disabled={resolving}
                      >
                        Accept Ours
                      </button>
                      <button
                        className="conflict-resolve-btn conflict-btn-theirs"
                        onClick={() => handleResolve(selected.path, "theirs")}
                        disabled={resolving}
                      >
                        Accept Theirs
                      </button>
                      <button
                        className="conflict-resolve-btn conflict-btn-both"
                        onClick={() => handleResolve(selected.path, "both")}
                        disabled={resolving}
                      >
                        Accept Both
                      </button>
                    </div>
                  </div>

                  <div className="conflict-diff">
                    <div className="conflict-side">
                      <div className="conflict-side-label conflict-label-ours">
                        Ours
                      </div>
                      <pre className="conflict-code">{selected.ours}</pre>
                    </div>
                    <div className="conflict-side">
                      <div className="conflict-side-label conflict-label-theirs">
                        Theirs
                      </div>
                      <pre className="conflict-code">{selected.theirs}</pre>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
