import { useState, useCallback, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ExtensionStat {
  extension: string;
  count: number;
}

interface LargestFile {
  path: string;
  size_bytes: number;
}

interface DirStatsResult {
  total_files: number;
  total_directories: number;
  total_size_bytes: number;
  extensions: ExtensionStat[];
  largest_files: LargestFile[];
}

interface DirectoryStatsProps {
  cwd: string;
  onClose: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const BAR_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#6366f1",
  "#14b8a6",
  "#f97316",
  "#84cc16",
  "#a855f7",
  "#0ea5e9",
  "#22d3ee",
  "#facc15",
];

export function DirectoryStats({ cwd, onClose }: DirectoryStatsProps) {
  const [stats, setStats] = useState<DirStatsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await invoke<DirStatsResult>("get_directory_stats", { cwd });
      setResult(r);
    } catch (e) {
      setError(String(e));
      setResult(null);
    }
    setLoading(false);
  }, [cwd]);

  function setResult(r: DirStatsResult | null) {
    setStats(r);
  }

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const { topExtensions, otherCount, maxCount } = useMemo(() => {
    if (!stats || stats.extensions.length === 0) {
      return { topExtensions: [], otherCount: 0, maxCount: 0 };
    }
    const sorted = [...stats.extensions].sort((a, b) => b.count - a.count);
    const top = sorted.slice(0, 15);
    const rest = sorted.slice(15);
    const other = rest.reduce((sum, e) => sum + e.count, 0);
    const mc = Math.max(...top.map((e) => e.count), 1);
    return { topExtensions: top, otherCount: other, maxCount: mc };
  }, [stats]);

  return (
    <div className="dirstats-backdrop" onClick={onClose}>
      <div className="dirstats-panel" onClick={(e) => e.stopPropagation()}>
        <div className="dirstats-header">
          <h3 className="dirstats-title">Directory Stats</h3>
          <div className="dirstats-header-actions">
            <button
              className="dirstats-refresh-btn"
              onClick={loadStats}
              disabled={loading}
            >
              Refresh
            </button>
            <button className="dirstats-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        <div className="dirstats-body">
          {error && <div className="dirstats-error">{error}</div>}

          {loading ? (
            <div className="dirstats-empty">Scanning directory...</div>
          ) : stats ? (
            <>
              <div className="dirstats-summary">
                <div className="dirstats-card">
                  <span className="dirstats-card-value">
                    {stats.total_files.toLocaleString()}
                  </span>
                  <span className="dirstats-card-label">Files</span>
                </div>
                <div className="dirstats-card">
                  <span className="dirstats-card-value">
                    {stats.total_directories.toLocaleString()}
                  </span>
                  <span className="dirstats-card-label">Directories</span>
                </div>
                <div className="dirstats-card">
                  <span className="dirstats-card-value">
                    {formatSize(stats.total_size_bytes)}
                  </span>
                  <span className="dirstats-card-label">Total Size</span>
                </div>
              </div>

              {topExtensions.length > 0 && (
                <div className="dirstats-ext-section">
                  <h4 className="dirstats-section-title">
                    File Types by Count
                  </h4>
                  <div className="dirstats-bar-chart">
                    {topExtensions.map((ext, i) => (
                      <div key={ext.extension} className="dirstats-bar-row">
                        <span className="dirstats-bar-label">
                          {ext.extension || "(no ext)"}
                        </span>
                        <div className="dirstats-bar-track">
                          <div
                            className="dirstats-bar-fill"
                            style={{
                              width: `${(ext.count / maxCount) * 100}%`,
                              backgroundColor:
                                BAR_COLORS[i % BAR_COLORS.length],
                            }}
                          />
                        </div>
                        <span className="dirstats-bar-count">{ext.count}</span>
                      </div>
                    ))}
                    {otherCount > 0 && (
                      <div className="dirstats-bar-row dirstats-bar-other">
                        <span className="dirstats-bar-label">other</span>
                        <div className="dirstats-bar-track">
                          <div
                            className="dirstats-bar-fill"
                            style={{
                              width: `${(otherCount / maxCount) * 100}%`,
                              backgroundColor: "#6b7280",
                            }}
                          />
                        </div>
                        <span className="dirstats-bar-count">{otherCount}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {stats.largest_files.length > 0 && (
                <div className="dirstats-large-section">
                  <h4 className="dirstats-section-title">Largest Files</h4>
                  <div className="dirstats-file-list">
                    {stats.largest_files.slice(0, 10).map((f, i) => (
                      <div key={i} className="dirstats-file-item">
                        <span className="dirstats-file-name">{f.path}</span>
                        <span className="dirstats-file-size">
                          {formatSize(f.size_bytes)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="dirstats-empty">
              Unable to load directory stats.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
