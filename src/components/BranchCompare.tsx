import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/branch-compare.css";

interface BranchInfo {
  name: string;
  is_current: boolean;
}

interface CompareResult {
  ahead: number;
  behind: number;
  commits: CompareCommit[];
  files: CompareFile[];
}

interface CompareCommit {
  hash: string;
  summary: string;
  author: string;
  date: string;
}

interface CompareFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

const STATUS_ICONS: Record<string, string> = {
  added: "+",
  modified: "M",
  deleted: "-",
  renamed: "R",
};

interface BranchCompareProps {
  worktreeId: number;
  onClose: () => void;
}

export function BranchCompare({ worktreeId, onClose }: BranchCompareProps) {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [base, setBase] = useState("");
  const [head, setHead] = useState("");
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"commits" | "files">("commits");

  useEffect(() => {
    invoke<BranchInfo[]>("list_branches", { worktreeId })
      .then((b) => {
        setBranches(b);
        const current = b.find((br) => br.is_current);
        if (current) setHead(current.name);
        const main = b.find((br) => br.name === "main" || br.name === "master");
        if (main) setBase(main.name);
      })
      .catch(() => setBranches([]));
  }, [worktreeId]);

  const handleCompare = useCallback(async () => {
    if (!base || !head || base === head) return;
    setLoading(true);
    try {
      const r = await invoke<CompareResult>("compare_branches", {
        worktreeId,
        base,
        head,
      });
      setResult(r);
    } catch {
      setResult(null);
    }
    setLoading(false);
  }, [worktreeId, base, head]);

  return (
    <div className="brcompare-backdrop" onClick={onClose}>
      <div className="brcompare-panel" onClick={(e) => e.stopPropagation()}>
        <div className="brcompare-header">
          <h3 className="brcompare-title">Branch Compare</h3>
          <button className="brcompare-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="brcompare-controls">
          <select
            className="brcompare-select"
            value={base}
            onChange={(e) => setBase(e.target.value)}
          >
            <option value="">Base branch...</option>
            {branches.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
          <span className="brcompare-arrow">&larr;&rarr;</span>
          <select
            className="brcompare-select"
            value={head}
            onChange={(e) => setHead(e.target.value)}
          >
            <option value="">Head branch...</option>
            {branches.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
          <button
            className="brcompare-btn"
            onClick={handleCompare}
            disabled={loading || !base || !head || base === head}
          >
            {loading ? "Comparing..." : "Compare"}
          </button>
        </div>

        <div className="brcompare-body">
          {result ? (
            <>
              <div className="brcompare-stats">
                <span className="brcompare-badge brcompare-ahead">
                  {result.ahead} ahead
                </span>
                <span className="brcompare-badge brcompare-behind">
                  {result.behind} behind
                </span>
                <span className="brcompare-badge brcompare-files-count">
                  {result.files.length} files changed
                </span>
              </div>

              <div className="brcompare-tabs">
                <button
                  className={`brcompare-tab ${tab === "commits" ? "active" : ""}`}
                  onClick={() => setTab("commits")}
                >
                  Commits ({result.commits.length})
                </button>
                <button
                  className={`brcompare-tab ${tab === "files" ? "active" : ""}`}
                  onClick={() => setTab("files")}
                >
                  Files ({result.files.length})
                </button>
              </div>

              <div className="brcompare-list">
                {tab === "commits"
                  ? result.commits.map((c) => (
                      <div key={c.hash} className="brcompare-commit">
                        <code className="brcompare-hash">
                          {c.hash.slice(0, 7)}
                        </code>
                        <span className="brcompare-summary">{c.summary}</span>
                        <span className="brcompare-commit-meta">
                          {c.author} &middot; {c.date}
                        </span>
                      </div>
                    ))
                  : result.files.map((f) => (
                      <div key={f.path} className="brcompare-file">
                        <span
                          className={`brcompare-status brcompare-status-${f.status}`}
                        >
                          {STATUS_ICONS[f.status] ?? "?"}
                        </span>
                        <span className="brcompare-file-path">{f.path}</span>
                        <span className="brcompare-additions">
                          +{f.additions}
                        </span>
                        <span className="brcompare-deletions">
                          -{f.deletions}
                        </span>
                      </div>
                    ))}
              </div>
            </>
          ) : (
            <div className="brcompare-empty">
              {loading
                ? "Comparing branches..."
                : "Select two branches and click Compare."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
