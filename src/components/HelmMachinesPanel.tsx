import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Dialog, DialogContent } from "./ui/dialog";
import "../styles/helm-machines.css";

interface HelmMachine {
  id: number;
  label: string;
  base_url: string;
  enabled: boolean;
  last_seen_at: string | null;
  created_at: string;
  api_token: string | null;
}

interface DiscoveredHelm {
  hostname: string;
  base_url: string;
  machine_name: string;
  version: string;
  already_registered: boolean;
}

interface HelmMachinesPanelProps {
  onClose: () => void;
}

function formatLastSeen(iso: string | null): string {
  if (!iso) return "never reached";
  try {
    const d = new Date(iso);
    return `last seen ${d.toLocaleString()}`;
  } catch {
    return iso;
  }
}

export function HelmMachinesPanel({ onClose }: HelmMachinesPanelProps) {
  const [machines, setMachines] = useState<HelmMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newLabel, setNewLabel] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState("");
  const [newToken, setNewToken] = useState("");
  const [adding, setAdding] = useState(false);

  const [discovered, setDiscovered] = useState<DiscoveredHelm[] | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await invoke<HelmMachine[]>("list_helm_machines");
      setMachines(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addMachine = useCallback(async () => {
    if (!newLabel.trim() || !newBaseUrl.trim()) {
      setError("Label and base URL are required.");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await invoke<HelmMachine>("add_helm_machine", {
        label: newLabel,
        baseUrl: newBaseUrl,
        apiToken: newToken.trim() ? newToken : null,
      });
      setNewLabel("");
      setNewBaseUrl("");
      setNewToken("");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setAdding(false);
    }
  }, [newLabel, newBaseUrl, newToken, refresh]);

  const toggleEnabled = useCallback(
    async (m: HelmMachine) => {
      try {
        await invoke("update_helm_machine", {
          id: m.id,
          label: m.label,
          baseUrl: m.base_url,
          enabled: !m.enabled,
          apiToken: null,
          clearToken: false,
        });
        await refresh();
      } catch (e) {
        setError(String(e));
      }
    },
    [refresh],
  );

  const removeMachine = useCallback(
    async (m: HelmMachine) => {
      try {
        await invoke<boolean>("remove_helm_machine", { id: m.id });
        await refresh();
      } catch (e) {
        setError(String(e));
      }
    },
    [refresh],
  );

  const discover = useCallback(async () => {
    setDiscovering(true);
    setDiscoverError(null);
    try {
      const list = await invoke<DiscoveredHelm[]>(
        "discover_helm_via_tailscale",
      );
      setDiscovered(list);
    } catch (e) {
      setDiscoverError(String(e));
      setDiscovered([]);
    } finally {
      setDiscovering(false);
    }
  }, []);

  const addDiscovered = useCallback(
    async (d: DiscoveredHelm) => {
      try {
        await invoke<HelmMachine>("add_helm_machine", {
          label: d.machine_name || d.hostname,
          baseUrl: d.base_url,
          apiToken: null,
        });
        // Mark this discovery as registered so the list updates
        // without a full re-discover.
        setDiscovered((prev) =>
          prev
            ? prev.map((x) =>
                x.base_url === d.base_url
                  ? { ...x, already_registered: true }
                  : x,
              )
            : prev,
        );
        await refresh();
      } catch (e) {
        setError(String(e));
      }
    },
    [refresh],
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="helm-machines" aria-label="Helm Machines">
        <div className="helm-machines__header">
          <h3 className="helm-machines__title">Helm Machines</h3>
          <p className="helm-machines__hint">
            Each row is one helm-daemon. Disabled rows are skipped when fetching
            agents.
          </p>
        </div>

        {error && <p className="helm-machines__error">{error}</p>}

        <div className="helm-machines__list">
          {loading ? (
            <p className="helm-machines__empty">Loading…</p>
          ) : machines.length === 0 ? (
            <p className="helm-machines__empty">
              No machines yet. Add one below or discover via Tailscale.
            </p>
          ) : (
            machines.map((m) => (
              <div
                key={m.id}
                className={
                  m.enabled
                    ? "helm-machines__row"
                    : "helm-machines__row helm-machines__row--disabled"
                }
              >
                <div className="helm-machines__row-meta">
                  <span className="helm-machines__row-label">{m.label}</span>
                  <span className="helm-machines__row-url">{m.base_url}</span>
                  <span className="helm-machines__row-status">
                    {m.api_token ? "auth: bearer • " : "auth: none • "}
                    {formatLastSeen(m.last_seen_at)}
                  </span>
                </div>
                <div className="helm-machines__row-actions">
                  <button
                    className="helm-machines__btn"
                    onClick={() => void toggleEnabled(m)}
                  >
                    {m.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    className="helm-machines__btn helm-machines__btn--danger"
                    onClick={() => void removeMachine(m)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="helm-machines__discover">
          <div className="helm-machines__discover-header">
            <span className="helm-machines__discover-title">
              Discover via Tailscale
            </span>
            <button
              className="helm-machines__btn"
              onClick={() => void discover()}
              disabled={discovering}
            >
              {discovering ? "Probing…" : "Discover"}
            </button>
          </div>
          {discoverError && (
            <p className="helm-machines__error">{discoverError}</p>
          )}
          {discovered !== null &&
            !discoverError &&
            (discovered.length === 0 ? (
              <p className="helm-machines__empty">
                No daemons answered on the tailnet.
              </p>
            ) : (
              <div className="helm-machines__discover-list">
                {discovered.map((d) => (
                  <div key={d.base_url} className="helm-machines__discover-row">
                    <div className="helm-machines__row-meta">
                      <span className="helm-machines__row-label">
                        {d.hostname}
                      </span>
                      <span className="helm-machines__row-url">
                        {d.base_url}
                      </span>
                      <span className="helm-machines__row-status">
                        {d.machine_name || "?"} {d.version && `· v${d.version}`}
                      </span>
                    </div>
                    {d.already_registered ? (
                      <span className="helm-machines__discover-added">
                        Added
                      </span>
                    ) : (
                      <button
                        className="helm-machines__btn"
                        onClick={() => void addDiscovered(d)}
                      >
                        Add
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
        </div>

        <div className="helm-machines__form">
          <input
            type="text"
            placeholder="Label (e.g. Work MBP)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <input
            type="text"
            placeholder="Base URL (e.g. http://10.0.0.1:8421)"
            value={newBaseUrl}
            onChange={(e) => setNewBaseUrl(e.target.value)}
          />
          <input
            type="password"
            placeholder="Bearer token (optional)"
            value={newToken}
            onChange={(e) => setNewToken(e.target.value)}
            style={{ gridColumn: "1 / -1" }}
          />
          <div className="helm-machines__form-row">
            <button
              className="helm-machines__btn"
              disabled={adding}
              onClick={() => void addMachine()}
            >
              {adding ? "Adding…" : "Add machine"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
