import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/env-diff.css";

interface EnvProfile {
  id: number;
  name: string;
}

interface DiffEntry {
  key: string;
  status: "added" | "removed" | "changed" | "unchanged";
  left_value: string | null;
  right_value: string | null;
}

interface DiffResult {
  added: number;
  removed: number;
  changed: number;
  entries: DiffEntry[];
}

interface EnvProfileDiffProps {
  projectId: number;
  onClose: () => void;
}

type FilterType = "all" | "added" | "removed" | "changed";

export function EnvProfileDiff({ projectId, onClose }: EnvProfileDiffProps) {
  const [profiles, setProfiles] = useState<EnvProfile[]>([]);
  const [profileA, setProfileA] = useState<number | "">("");
  const [profileB, setProfileB] = useState<number | "">("");
  const [result, setResult] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => {
    const loadProfiles = async () => {
      try {
        const list = await invoke<EnvProfile[]>("vault_list_profiles", {
          projectId,
        });
        setProfiles(list);
      } catch {
        setProfiles([]);
      }
    };
    loadProfiles();
  }, [projectId]);

  const handleCompare = useCallback(async () => {
    if (profileA === "" || profileB === "") return;
    setLoading(true);
    try {
      const diff = await invoke<DiffResult>("compare_env_profiles", {
        profileIdA: profileA,
        profileIdB: profileB,
      });
      setResult(diff);
    } catch {
      setResult(null);
    }
    setLoading(false);
  }, [profileA, profileB]);

  const filteredEntries = result
    ? result.entries.filter((e) => filter === "all" || e.status === filter)
    : [];

  const FILTERS: { key: FilterType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "added", label: "Added" },
    { key: "removed", label: "Removed" },
    { key: "changed", label: "Changed" },
  ];

  return (
    <div className="envdiff-backdrop" onClick={onClose}>
      <div className="envdiff-panel" onClick={(e) => e.stopPropagation()}>
        <div className="envdiff-header">
          <h3 className="envdiff-title">Environment Profile Diff</h3>
          <button className="envdiff-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="envdiff-selectors">
          <select
            className="envdiff-select"
            value={profileA}
            onChange={(e) =>
              setProfileA(e.target.value ? Number(e.target.value) : "")
            }
          >
            <option value="">Profile A</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="envdiff-arrow">&harr;</span>
          <select
            className="envdiff-select"
            value={profileB}
            onChange={(e) =>
              setProfileB(e.target.value ? Number(e.target.value) : "")
            }
          >
            <option value="">Profile B</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            className="envdiff-compare-btn"
            onClick={handleCompare}
            disabled={loading || profileA === "" || profileB === ""}
          >
            {loading ? "Comparing..." : "Compare"}
          </button>
        </div>

        <div className="envdiff-body">
          {result ? (
            <>
              <div className="envdiff-summary">
                <span className="envdiff-summary-item envdiff-sum-added">
                  {result.added} added
                </span>
                <span className="envdiff-summary-item envdiff-sum-removed">
                  {result.removed} removed
                </span>
                <span className="envdiff-summary-item envdiff-sum-changed">
                  {result.changed} changed
                </span>
              </div>

              <div className="envdiff-filters">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    className={`envdiff-filter-btn ${filter === f.key ? "active" : ""}`}
                    onClick={() => setFilter(f.key)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="envdiff-table-wrap">
                <table className="envdiff-table">
                  <thead>
                    <tr>
                      <th className="envdiff-th">Key</th>
                      <th className="envdiff-th">Status</th>
                      <th className="envdiff-th">Profile A</th>
                      <th className="envdiff-th">Profile B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.length === 0 ? (
                      <tr>
                        <td
                          className="envdiff-td envdiff-empty-row"
                          colSpan={4}
                        >
                          No entries match this filter.
                        </td>
                      </tr>
                    ) : (
                      filteredEntries.map((entry) => (
                        <tr
                          key={entry.key}
                          className={`envdiff-row envdiff-row-${entry.status}`}
                        >
                          <td className="envdiff-td envdiff-td-key">
                            {entry.key}
                          </td>
                          <td className="envdiff-td">
                            <span
                              className={`envdiff-status-badge envdiff-badge-${entry.status}`}
                            >
                              {entry.status}
                            </span>
                          </td>
                          <td className="envdiff-td envdiff-td-val">
                            {entry.left_value ?? "\u2014"}
                          </td>
                          <td className="envdiff-td envdiff-td-val">
                            {entry.right_value ?? "\u2014"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : !loading ? (
            <div className="envdiff-empty">
              Select two profiles and click &quot;Compare&quot; to see the diff.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
