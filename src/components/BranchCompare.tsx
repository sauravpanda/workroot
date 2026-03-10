import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/branch-compare.css";

interface CompareCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

interface ChangedFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

interface BranchComparison {
  base_branch: string;
  head_branch: string;
  ahead: number;
  behind: number;
  commits: CompareCommit[];
  changed_files: ChangedFile[];
}

interface BranchCompareProps {
  worktreeId: number;
  branches: string[];
  onClose: () => void;
}

const STATUS_ICONS: Record<string, string> = {
  added: "+",
  modified: "~",
  deleted: "-",
  renamed: "R",
};

export function BranchCompare({
  worktreeId,
  branches,
  onClose,
}: BranchCompareProps) {
  const [baseBranch, setBaseBranch] = useState("");
  const [headBranch, setHeadBranch] = useState("");
  const [comparison, setComparison] = useState<BranchComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branchList, setBranchList] = useState<string[]>(branches);

  useEffect(() => {
    if (branches.length > 0) {
      setBranchList(branches);
    }
  }, [branches]);

  const handleCompare = async () => {
    if (!baseBranch || !headBranch) return;
    if (baseBranch === headBranch) {
      setError("Base and head branches must be different");
      return;
    }

    setLoading(true);
    setError(null);
    setComparison(null);

    try {
      const result = await invoke<BranchComparison>("compare_branches", {
        worktreeId,
        base: baseBranch,
        head: headBranch,
      });
      setComparison(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="branch-compare-overlay" onClick={handleOverlayClick}>
      <div className="branch-compare-modal">
        <div className="branch-compare-header">
          <h2 className="branch-compare-title">Compare Branches</h2>
          <button className="branch-compare-close" onClick={onClose}>
            &#x2715;
          </button>
        </div>

        <div className="branch-compare-selectors">
          <div className="branch-compare-selector">
            <label className="branch-compare-label">Base</label>
            <select
              className="branch-compare-select"
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
            >
              <option value="">Select base branch</option>
              {branchList.map((b) => (
                <option key={`base-${b}`} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <span className="branch-compare-arrow">&#x2190;</span>

          <div className="branch-compare-selector">
            <label className="branch-compare-label">Head</label>
            <select
              className="branch-compare-select"
              value={headBranch}
              onChange={(e) => setHeadBranch(e.target.value)}
            >
              <option value="">Select head branch</option>
              {branchList.map((b) => (
                <option key={`head-${b}`} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <button
            className="branch-compare-btn"
            onClick={handleCompare}
            disabled={!baseBranch || !headBranch || loading}
          >
            {loading ? "Comparing..." : "Compare"}
          </button>
        </div>

        {error && <div className="branch-compare-error">{error}</div>}

        {comparison && (
          <div className="branch-compare-results">
            <div className="branch-compare-badges">
              <span className="branch-compare-badge ahead">
                {comparison.ahead} ahead
              </span>
              <span className="branch-compare-badge behind">
                {comparison.behind} behind
              </span>
            </div>

            {comparison.commits.length > 0 && (
              <div className="branch-compare-section">
                <h3 className="branch-compare-section-title">
                  Commits ({comparison.commits.length})
                </h3>
                <div className="branch-compare-commits">
                  {comparison.commits.map((commit) => (
                    <div key={commit.hash} className="branch-compare-commit">
                      <span className="branch-compare-commit-hash">
                        {commit.hash.slice(0, 7)}
                      </span>
                      <span className="branch-compare-commit-message">
                        {commit.message}
                      </span>
                      <span className="branch-compare-commit-author">
                        {commit.author}
                      </span>
                      <span className="branch-compare-commit-date">
                        {commit.date}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {comparison.changed_files.length > 0 && (
              <div className="branch-compare-section">
                <h3 className="branch-compare-section-title">
                  Changed Files ({comparison.changed_files.length})
                </h3>
                <div className="branch-compare-files">
                  {comparison.changed_files.map((file) => (
                    <div key={file.path} className="branch-compare-file">
                      <span
                        className={`branch-compare-file-status ${file.status}`}
                      >
                        {STATUS_ICONS[file.status] || "?"}
                      </span>
                      <span className="branch-compare-file-path">
                        {file.path}
                      </span>
                      <span className="branch-compare-file-stats">
                        {file.additions > 0 && (
                          <span className="branch-compare-additions">
                            +{file.additions}
                          </span>
                        )}
                        {file.deletions > 0 && (
                          <span className="branch-compare-deletions">
                            -{file.deletions}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {comparison.commits.length === 0 &&
              comparison.changed_files.length === 0 && (
                <div className="branch-compare-empty">
                  These branches are identical.
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
}
