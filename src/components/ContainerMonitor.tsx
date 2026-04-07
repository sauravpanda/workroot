import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/container-monitor.css";

interface ContainerStat {
  container_id: string;
  name: string;
  cpu_percent: number;
  mem_usage: string;
  mem_percent: number;
  net_io: string;
  state: "running" | "exited" | "paused";
}

interface ContainerMonitorProps {
  onClose: () => void;
}

export function ContainerMonitor({ onClose }: ContainerMonitorProps) {
  const [stats, setStats] = useState<ContainerStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null);
  const [logs, setLogs] = useState<string>("");
  const [logsLoading, setLogsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expandedLogsRef = useRef<string | null>(null);
  const logFetchGenRef = useRef(0);

  const loadStats = useCallback(async () => {
    try {
      const result = await invoke<ContainerStat[]>("get_container_stats");
      setStats(result);
      setError(null);
    } catch (e) {
      setError(String(e));
      setStats([]);
    }
    setLoading(false);
  }, []);

  const loadStatsRef = useRef(loadStats);
  loadStatsRef.current = loadStats;

  useEffect(() => {
    loadStatsRef.current();
    intervalRef.current = setInterval(() => loadStatsRef.current(), 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleAction = useCallback(
    async (containerId: string, action: "start" | "stop" | "restart") => {
      setActionLoading(containerId);
      try {
        await invoke(`${action}_container`, { containerId });
        await loadStats();
      } catch (e) {
        setError(String(e));
      }
      setActionLoading(null);
    },
    [loadStats],
  );

  const handleToggleLogs = useCallback(async (containerId: string) => {
    if (expandedLogsRef.current === containerId) {
      expandedLogsRef.current = null;
      setExpandedLogs(null);
      setLogs("");
      return;
    }
    expandedLogsRef.current = containerId;
    setExpandedLogs(containerId);
    setLogsLoading(true);
    const gen = ++logFetchGenRef.current;
    try {
      const result = await invoke<string>("get_container_logs", {
        containerId,
        tail: 100,
      });
      if (logFetchGenRef.current !== gen) return;
      setLogs(result);
    } catch {
      if (logFetchGenRef.current !== gen) return;
      setLogs("Failed to fetch logs.");
    }
    setLogsLoading(false);
  }, []);

  return (
    <div className="cmon-backdrop" onClick={onClose}>
      <div className="cmon-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cmon-header">
          <h3 className="cmon-title">Container Monitor</h3>
          <div className="cmon-header-actions">
            <button
              className="cmon-refresh-btn"
              onClick={loadStats}
              disabled={loading}
            >
              Refresh
            </button>
            <button className="cmon-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        <div className="cmon-body">
          {error && <div className="cmon-error">{error}</div>}

          {loading ? (
            <div className="cmon-empty">Loading container stats...</div>
          ) : stats.length === 0 ? (
            <div className="cmon-empty">No running containers found.</div>
          ) : (
            <table className="cmon-table">
              <thead>
                <tr>
                  <th>Container</th>
                  <th>CPU %</th>
                  <th>Memory</th>
                  <th>Mem %</th>
                  <th>Net I/O</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <>
                    <tr key={s.container_id} className="cmon-row">
                      <td className="cmon-cell-name">
                        <span className={`cmon-state cmon-state-${s.state}`} />
                        {s.name}
                      </td>
                      <td className="cmon-cell-cpu">
                        <span
                          className={`cmon-cpu-val ${s.cpu_percent > 80 ? "cmon-cpu-high" : ""}`}
                        >
                          {s.cpu_percent.toFixed(1)}%
                        </span>
                      </td>
                      <td className="cmon-cell-mem">{s.mem_usage}</td>
                      <td className="cmon-cell-mempct">
                        {s.mem_percent.toFixed(1)}%
                      </td>
                      <td className="cmon-cell-net">{s.net_io}</td>
                      <td className="cmon-cell-actions">
                        {s.state === "running" ? (
                          <>
                            <button
                              className="cmon-action-btn cmon-btn-stop"
                              onClick={() =>
                                handleAction(s.container_id, "stop")
                              }
                              disabled={actionLoading === s.container_id}
                            >
                              Stop
                            </button>
                            <button
                              className="cmon-action-btn cmon-btn-restart"
                              onClick={() =>
                                handleAction(s.container_id, "restart")
                              }
                              disabled={actionLoading === s.container_id}
                            >
                              Restart
                            </button>
                          </>
                        ) : (
                          <button
                            className="cmon-action-btn cmon-btn-start"
                            onClick={() =>
                              handleAction(s.container_id, "start")
                            }
                            disabled={actionLoading === s.container_id}
                          >
                            Start
                          </button>
                        )}
                        <button
                          className={`cmon-action-btn cmon-btn-logs ${expandedLogs === s.container_id ? "active" : ""}`}
                          onClick={() => handleToggleLogs(s.container_id)}
                        >
                          Logs
                        </button>
                      </td>
                    </tr>
                    {expandedLogs === s.container_id && (
                      <tr
                        key={`${s.container_id}-logs`}
                        className="cmon-logs-row"
                      >
                        <td colSpan={6}>
                          <div className="cmon-logs-container">
                            {logsLoading ? (
                              <div className="cmon-logs-loading">
                                Loading logs...
                              </div>
                            ) : (
                              <pre className="cmon-logs-content">{logs}</pre>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
