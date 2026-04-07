import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/docker-panel.css";
import { Dialog, DialogContent } from "./ui/dialog";

interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  ports: string;
  state: "running" | "exited" | "paused";
}

interface ComposeService {
  name: string;
  status: string;
  image: string;
}

interface DockerPanelProps {
  cwd: string;
  onClose: () => void;
}

export function DockerPanel({ cwd, onClose }: DockerPanelProps) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [composeServices, setComposeServices] = useState<ComposeService[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"containers" | "compose">("containers");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const isAvailable = await invoke<boolean>("detect_docker");
      setAvailable(isAvailable);
      if (isAvailable) {
        const [ctrs, svcs] = await Promise.allSettled([
          invoke<ContainerInfo[]>("list_containers"),
          invoke<ComposeService[]>("list_compose_services", { cwd }),
        ]);
        setContainers(ctrs.status === "fulfilled" ? ctrs.value : []);
        setComposeServices(svcs.status === "fulfilled" ? svcs.value : []);
      }
    } catch (err) {
      setAvailable(false);
      setError(err instanceof Error ? err.message : "Failed to detect Docker");
    }
    setLoading(false);
  }, [cwd]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStartStop = useCallback(
    async (containerId: string, action: "start" | "stop") => {
      setActionLoading(containerId);
      try {
        await invoke(`${action}_container`, { containerId });
        await loadData();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : `Failed to ${action} container`,
        );
      }
      setActionLoading(null);
    },
    [loadData],
  );

  const stateClass = (state: string) => {
    if (state === "running") return "docker-state-running";
    if (state === "paused") return "docker-state-paused";
    return "docker-state-exited";
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="docker-panel">
        <div className="docker-header">
          <h3 className="docker-title">Docker</h3>
          <div className="docker-header-actions">
            <button
              className="docker-refresh-btn"
              onClick={loadData}
              disabled={loading}
            >
              Refresh
            </button>
            <button className="docker-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        {error && (
          <div
            className="docker-error"
            style={{
              color: "var(--error)",
              padding: "8px 12px",
              fontSize: "0.85em",
            }}
          >
            {error}
          </div>
        )}

        <div className="docker-body">
          {loading ? (
            <div className="docker-empty">Checking Docker...</div>
          ) : available === false ? (
            <div className="docker-empty">
              Docker is not available on this system.
            </div>
          ) : (
            <>
              <div className="docker-tabs">
                <button
                  className={`docker-tab ${tab === "containers" ? "active" : ""}`}
                  onClick={() => setTab("containers")}
                >
                  Containers ({containers.length})
                </button>
                <button
                  className={`docker-tab ${tab === "compose" ? "active" : ""}`}
                  onClick={() => setTab("compose")}
                >
                  Compose ({composeServices.length})
                </button>
              </div>

              <div className="docker-list">
                {tab === "containers" ? (
                  containers.length === 0 ? (
                    <div className="docker-empty">No containers found.</div>
                  ) : (
                    containers.map((c) => (
                      <div key={c.id} className="docker-item">
                        <span
                          className={`docker-state ${stateClass(c.state)}`}
                        />
                        <div className="docker-item-info">
                          <span className="docker-item-name">{c.name}</span>
                          <span className="docker-item-meta">
                            {c.image}
                            {c.ports ? ` | ${c.ports}` : ""}
                          </span>
                        </div>
                        <span className="docker-item-status">{c.status}</span>
                        <button
                          className={`docker-action-btn ${c.state === "running" ? "docker-btn-stop" : "docker-btn-start"}`}
                          onClick={() =>
                            handleStartStop(
                              c.id,
                              c.state === "running" ? "stop" : "start",
                            )
                          }
                          disabled={actionLoading === c.id}
                        >
                          {actionLoading === c.id
                            ? "..."
                            : c.state === "running"
                              ? "Stop"
                              : "Start"}
                        </button>
                      </div>
                    ))
                  )
                ) : composeServices.length === 0 ? (
                  <div className="docker-empty">No compose services found.</div>
                ) : (
                  composeServices.map((s) => (
                    <div key={s.name} className="docker-item">
                      <span className="docker-state docker-state-compose" />
                      <div className="docker-item-info">
                        <span className="docker-item-name">{s.name}</span>
                        <span className="docker-item-meta">{s.image}</span>
                      </div>
                      <span className="docker-item-status">{s.status}</span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
