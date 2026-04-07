import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/plugin-manager.css";

interface PluginInfo {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  enabled: boolean;
}

interface PluginManagerProps {
  onClose: () => void;
}

export function PluginManager({ onClose }: PluginManagerProps) {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadPlugins = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<PluginInfo[]>("list_plugins");
      setPlugins(result);
    } catch (e) {
      setError(String(e));
      setPlugins([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  const handleToggle = useCallback(
    async (pluginId: string, enabled: boolean) => {
      setTogglingId(pluginId);

      // Optimistic update: flip the UI immediately
      setPlugins((prev) =>
        prev.map((p) => (p.id === pluginId ? { ...p, enabled: !enabled } : p)),
      );

      try {
        await invoke("toggle_plugin", { pluginId, enabled: !enabled });
      } catch (e) {
        // Roll back to previous state on failure
        setPlugins((prev) =>
          prev.map((p) => (p.id === pluginId ? { ...p, enabled } : p)),
        );
        setError(`Failed to toggle plugin: ${String(e)}`);
      }
      setTogglingId(null);
    },
    [],
  );

  return (
    <div className="plugmgr-backdrop" onClick={onClose}>
      <div className="plugmgr-panel" onClick={(e) => e.stopPropagation()}>
        <div className="plugmgr-header">
          <h3 className="plugmgr-title">Plugins</h3>
          <div className="plugmgr-header-actions">
            <button
              className="plugmgr-refresh-btn"
              onClick={loadPlugins}
              disabled={loading}
            >
              Refresh
            </button>
            <button className="plugmgr-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        <div className="plugmgr-body">
          {error && <div className="plugmgr-error">{error}</div>}

          {loading ? (
            <div className="plugmgr-empty">Loading plugins...</div>
          ) : (
            <>
              {plugins.length === 0 ? (
                <div className="plugmgr-empty">No plugins installed.</div>
              ) : (
                <div className="plugmgr-list">
                  {plugins.map((p) => (
                    <div key={p.id} className="plugmgr-card">
                      <div className="plugmgr-card-header">
                        <div className="plugmgr-card-title-row">
                          <span className="plugmgr-card-name">{p.name}</span>
                          <span className="plugmgr-card-version">
                            v{p.version}
                          </span>
                        </div>
                        <label className="plugmgr-toggle">
                          <input
                            type="checkbox"
                            role="switch"
                            aria-checked={p.enabled}
                            aria-label={`Toggle ${p.name}`}
                            checked={p.enabled}
                            onChange={() => handleToggle(p.id, p.enabled)}
                            disabled={togglingId === p.id}
                          />
                          <span className="plugmgr-toggle-slider" />
                        </label>
                      </div>
                      <span className="plugmgr-card-author">by {p.author}</span>
                      <span className="plugmgr-card-desc">{p.description}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="plugmgr-marketplace">
                <h4 className="plugmgr-marketplace-title">
                  Browse Marketplace
                </h4>
                <div className="plugmgr-marketplace-placeholder">
                  Plugin marketplace coming soon. Stay tuned for community
                  plugins and extensions.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
