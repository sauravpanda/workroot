import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/conflict-resolver.css";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface ConflictedFile {
  path: string;
  ancestor_exists: boolean;
  ours_exists: boolean;
  theirs_exists: boolean;
}

interface ConflictResolverProps {
  worktreeId: number;
  onClose: () => void;
}

export function ConflictResolver({
  worktreeId,
  onClose,
}: ConflictResolverProps) {
  const focusTrapRef = useFocusTrap();
  const [files, setFiles] = useState<ConflictedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

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

  const selected = files.find((f) => f.path === selectedFile);
  const stageSummary = selected
    ? [
        {
          label: "Base",
          present: selected.ancestor_exists,
        },
        {
          label: "Ours",
          present: selected.ours_exists,
        },
        {
          label: "Theirs",
          present: selected.theirs_exists,
        },
      ]
    : [];

  return (
    <div className="conflict-backdrop" ref={focusTrapRef} onClick={onClose}>
      <div className="conflict-panel" onClick={(e) => e.stopPropagation()}>
        <div className="conflict-header">
          <h3 className="conflict-title">Conflict Inspector</h3>
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
                    <div className="conflict-detail-meta">
                      <span className="conflict-detail-path">
                        {selected.path}
                      </span>
                      <span className="conflict-detail-note">
                        Resolution is not available in Workroot yet. Use Git or
                        your editor to resolve this file.
                      </span>
                    </div>
                  </div>

                  <div className="conflict-diff">
                    <div className="conflict-side">
                      <div className="conflict-side-label">
                        Available Conflict Stages
                      </div>
                      <div className="conflict-stage-list">
                        {stageSummary.map((stage) => (
                          <div key={stage.label} className="conflict-stage-row">
                            <span className="conflict-stage-name">
                              {stage.label}
                            </span>
                            <span
                              className={`conflict-stage-pill ${
                                stage.present
                                  ? "conflict-stage-pill-present"
                                  : "conflict-stage-pill-missing"
                              }`}
                            >
                              {stage.present ? "Present" : "Missing"}
                            </span>
                          </div>
                        ))}
                      </div>
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
