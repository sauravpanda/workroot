import { useState, useCallback, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Dialog, DialogContent } from "./ui/dialog";

interface DependencyInfo {
  name: string;
  version: string;
  dep_type: string;
  is_outdated: boolean;
}

interface DepsResult {
  dependencies: DependencyInfo[];
  total: number;
  production: number;
  dev: number;
  outdated: number;
}

interface DependencyAnalyzerProps {
  cwd: string;
  onClose: () => void;
}

type FilterTab = "all" | "production" | "dev" | "outdated";
type SortMode = "name" | "type";

function getTypeBadgeClass(depType: string): string {
  switch (depType.toLowerCase()) {
    case "prod":
    case "production":
      return "depan-type-prod";
    case "dev":
    case "development":
      return "depan-type-dev";
    case "peer":
      return "depan-type-peer";
    case "optional":
      return "depan-type-optional";
    default:
      return "depan-type-prod";
  }
}

export function DependencyAnalyzer({ cwd, onClose }: DependencyAnalyzerProps) {
  const [result, setResult] = useState<DepsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [copied, setCopied] = useState(false);

  const loadDeps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await invoke<DepsResult>("analyze_dependencies", { cwd });
      setResult(r);
    } catch (e) {
      setError(String(e));
      setResult(null);
    }
    setLoading(false);
  }, [cwd]);

  useEffect(() => {
    loadDeps();
  }, [loadDeps]);

  const filteredDeps = useMemo(() => {
    if (!result) return [];
    let deps = [...result.dependencies];

    if (filter === "production") {
      deps = deps.filter(
        (d) =>
          d.dep_type.toLowerCase() === "prod" ||
          d.dep_type.toLowerCase() === "production",
      );
    } else if (filter === "dev") {
      deps = deps.filter(
        (d) =>
          d.dep_type.toLowerCase() === "dev" ||
          d.dep_type.toLowerCase() === "development",
      );
    } else if (filter === "outdated") {
      deps = deps.filter((d) => d.is_outdated);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      deps = deps.filter((d) => d.name.toLowerCase().includes(q));
    }

    if (sortMode === "name") {
      deps.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      deps.sort((a, b) => a.dep_type.localeCompare(b.dep_type));
    }

    return deps;
  }, [result, filter, search, sortMode]);

  const handleExport = useCallback(async () => {
    if (!result) return;
    const json = JSON.stringify(result.dependencies, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard not available */
    }
  }, [result]);

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: `All (${result?.total ?? 0})` },
    { key: "production", label: `Prod (${result?.production ?? 0})` },
    { key: "dev", label: `Dev (${result?.dev ?? 0})` },
    { key: "outdated", label: `Outdated (${result?.outdated ?? 0})` },
  ];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="depan-panel">
        <div className="depan-header">
          <h3 className="depan-title">Dependencies</h3>
          <div className="depan-header-actions">
            <button
              className="depan-refresh-btn"
              onClick={loadDeps}
              disabled={loading}
            >
              Refresh
            </button>
            <button className="depan-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        <div className="depan-body">
          {error && <div className="depan-error">{error}</div>}

          {loading ? (
            <div className="depan-empty">Analyzing dependencies...</div>
          ) : result ? (
            <>
              <div className="depan-summary">
                <span className="depan-stat">
                  <span className="depan-stat-num">{result.total}</span> Total
                </span>
                <span className="depan-stat depan-stat-prod">
                  <span className="depan-stat-num">{result.production}</span>{" "}
                  Prod
                </span>
                <span className="depan-stat depan-stat-dev">
                  <span className="depan-stat-num">{result.dev}</span> Dev
                </span>
                <span className="depan-stat depan-stat-outdated">
                  <span className="depan-stat-num">{result.outdated}</span>{" "}
                  Outdated
                </span>
              </div>

              <div className="depan-toolbar">
                <div className="depan-tabs">
                  {tabs.map((t) => (
                    <button
                      key={t.key}
                      className={`depan-tab ${filter === t.key ? "depan-tab-active" : ""}`}
                      onClick={() => setFilter(t.key)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="depan-toolbar-right">
                  <select
                    className="depan-sort"
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                  >
                    <option value="name">Sort: Name</option>
                    <option value="type">Sort: Type</option>
                  </select>
                  <button className="depan-export-btn" onClick={handleExport}>
                    {copied ? "Copied!" : "Export JSON"}
                  </button>
                </div>
              </div>

              <input
                className="depan-search"
                type="text"
                placeholder="Search dependencies..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <div className="depan-list">
                {filteredDeps.length === 0 ? (
                  <div className="depan-empty">No dependencies match.</div>
                ) : (
                  filteredDeps.map((d) => (
                    <div
                      key={`${d.name}-${d.dep_type}`}
                      className={`depan-item ${d.is_outdated ? "depan-item-outdated" : ""}`}
                    >
                      <span className="depan-dep-name">{d.name}</span>
                      <span className="depan-dep-version">{d.version}</span>
                      <span
                        className={`depan-type-badge ${getTypeBadgeClass(d.dep_type)}`}
                      >
                        {d.dep_type}
                      </span>
                      {d.is_outdated && (
                        <span className="depan-outdated-badge">outdated</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="depan-empty">Unable to analyze dependencies.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
