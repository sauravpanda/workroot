import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Dialog, DialogContent } from "./ui/dialog";

interface PluginDetail {
  name: string;
  version: string;
  description: string;
  language: string;
  permissions: string[];
}

interface ExecutionResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
}

interface PluginRuntimeProps {
  cwd: string;
  onClose: () => void;
}

function LanguageBadge({ language }: { language: string }) {
  const lang = language.toLowerCase();
  let badgeClass = "plrt-lang-badge";
  if (lang === "node" || lang === "javascript" || lang === "typescript") {
    badgeClass += " plrt-lang-node";
  } else if (lang === "python") {
    badgeClass += " plrt-lang-python";
  } else {
    badgeClass += " plrt-lang-shell";
  }
  return <span className={badgeClass}>{language}</span>;
}

export function PluginRuntime({ cwd, onClose }: PluginRuntimeProps) {
  const [plugins, setPlugins] = useState<PluginDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlugin, setSelectedPlugin] = useState<string | null>(null);
  const [args, setArgs] = useState("");
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState<ExecutionResult | null>(null);
  const [installUrl, setInstallUrl] = useState("");
  const [installing, setInstalling] = useState(false);

  const loadPlugins = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<PluginDetail[]>("discover_plugins", { cwd });
      setPlugins(result);
    } catch (e) {
      setError(String(e));
      setPlugins([]);
    }
    setLoading(false);
  }, [cwd]);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  const handleRun = useCallback(
    async (pluginName: string) => {
      setExecuting(true);
      setExecResult(null);
      setSelectedPlugin(pluginName);
      try {
        const result = await invoke<ExecutionResult>("execute_plugin", {
          cwd,
          pluginName,
          args: args.trim() || null,
        });
        setExecResult(result);
      } catch (e) {
        setExecResult({
          stdout: "",
          stderr: String(e),
          exit_code: -1,
          duration_ms: 0,
        });
      }
      setExecuting(false);
    },
    [cwd, args],
  );

  const handleInstall = useCallback(async () => {
    if (!installUrl.trim()) return;
    setInstalling(true);
    setError(null);
    try {
      await invoke("install_plugin_from_url", {
        cwd,
        url: installUrl.trim(),
      });
      setInstallUrl("");
      loadPlugins();
    } catch (e) {
      setError(String(e));
    }
    setInstalling(false);
  }, [cwd, installUrl, loadPlugins]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="plrt-panel">
        <div className="plrt-header">
          <h3 className="plrt-title">Plugin Runtime</h3>
          <div className="plrt-header-actions">
            <button
              className="plrt-refresh-btn"
              onClick={loadPlugins}
              disabled={loading}
            >
              Refresh
            </button>
            <button className="plrt-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        <div className="plrt-body">
          {error && <div className="plrt-error">{error}</div>}

          <div className="plrt-args-row">
            <input
              className="plrt-args-input"
              type="text"
              placeholder="Plugin arguments (optional)"
              value={args}
              onChange={(e) => setArgs(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="plrt-empty">Discovering plugins...</div>
          ) : plugins.length === 0 ? (
            <div className="plrt-empty-state">
              <p className="plrt-empty-title">No plugins found</p>
              <div className="plrt-empty-help">
                <p>Create a plugin directory with a manifest:</p>
                <pre className="plrt-code-block">
                  {`.workroot/plugins/my-plugin/
  manifest.json
  index.js (or main.py, run.sh)`}
                </pre>
                <p>manifest.json format:</p>
                <pre className="plrt-code-block">
                  {`{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "What it does",
  "language": "node",
  "permissions": ["fs:read"]
}`}
                </pre>
              </div>
            </div>
          ) : (
            <div className="plrt-list">
              {plugins.map((p) => (
                <div
                  key={p.name}
                  className={`plrt-card ${selectedPlugin === p.name ? "plrt-card-selected" : ""}`}
                >
                  <div className="plrt-card-icon">
                    <span className="plrt-icon-placeholder">
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="plrt-card-info">
                    <div className="plrt-card-header-row">
                      <span className="plrt-card-name">{p.name}</span>
                      <span className="plrt-card-version">v{p.version}</span>
                      <LanguageBadge language={p.language} />
                    </div>
                    <span className="plrt-card-desc">{p.description}</span>
                    {p.permissions.length > 0 && (
                      <div className="plrt-permissions">
                        {p.permissions.map((perm) => (
                          <span key={perm} className="plrt-perm-pill">
                            {perm}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    className="plrt-run-btn"
                    onClick={() => handleRun(p.name)}
                    disabled={executing}
                  >
                    {executing && selectedPlugin === p.name
                      ? "Running..."
                      : "Run"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {execResult && (
            <div className="plrt-output-section">
              <div className="plrt-output-header">
                <span className="plrt-output-title">
                  Output: {selectedPlugin}
                </span>
                <span
                  className={`plrt-exit-badge ${execResult.exit_code === 0 ? "plrt-exit-ok" : "plrt-exit-err"}`}
                >
                  exit {execResult.exit_code}
                </span>
                <span className="plrt-duration">
                  {execResult.duration_ms}ms
                </span>
              </div>
              <div className="plrt-output-area">
                {execResult.stdout && (
                  <pre className="plrt-stdout">{execResult.stdout}</pre>
                )}
                {execResult.stderr && (
                  <pre className="plrt-stderr">{execResult.stderr}</pre>
                )}
                {!execResult.stdout && !execResult.stderr && (
                  <span className="plrt-no-output">No output</span>
                )}
              </div>
            </div>
          )}

          <div className="plrt-install-section">
            <h4 className="plrt-install-title">Install from URL</h4>
            <div className="plrt-install-row">
              <input
                className="plrt-install-input"
                type="text"
                placeholder="https://github.com/user/plugin.git"
                value={installUrl}
                onChange={(e) => setInstallUrl(e.target.value)}
              />
              <button
                className="plrt-install-btn"
                onClick={handleInstall}
                disabled={installing || !installUrl.trim()}
              >
                {installing ? "Installing..." : "Install"}
              </button>
            </div>
            {installing && (
              <div className="plrt-install-progress">
                <div className="plrt-install-progress-fill" />
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
