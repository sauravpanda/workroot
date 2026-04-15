import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import "../styles/settings.css";

interface SettingField {
  key: string;
  label: string;
  placeholder: string;
  helpText: string;
  type: "text" | "password" | "number" | "textarea";
  helpUrl?: string;
}

const GITHUB_FIELDS: SettingField[] = [
  {
    key: "github_client_id",
    label: "GitHub OAuth Client ID",
    placeholder: "Ov23li...",
    helpText:
      "Create a GitHub OAuth App at github.com/settings/developers. Enable 'Device flow' in the app settings, then paste the Client ID here.",
    helpUrl: "https://github.com/settings/developers",
    type: "text",
  },
];

const TERMINAL_FIELDS: SettingField[] = [
  {
    key: "terminal_shell",
    label: "Default Shell",
    placeholder: "/bin/zsh",
    helpText:
      "Path to the shell executable. Defaults to /bin/zsh on macOS/Linux or powershell.exe on Windows.",
    type: "text",
  },
  {
    key: "terminal_init_command",
    label: "Startup Commands",
    placeholder: "source ~/.nvm/nvm.sh\nclear",
    helpText:
      "Commands to run automatically when a new terminal opens. One command per line.",
    type: "textarea",
  },
];

const PORT_FIELDS: SettingField[] = [
  {
    key: "proxy_port",
    label: "Reverse Proxy Port",
    placeholder: "3000",
    helpText:
      "Port for the reverse proxy that routes to your running processes. Requires restart.",
    type: "number",
  },
  {
    key: "forward_proxy_port",
    label: "HTTP Proxy Port",
    placeholder: "8888",
    helpText:
      "Port for the HTTP forward proxy that intercepts outgoing traffic. Requires restart.",
    type: "number",
  },
  {
    key: "mcp_port",
    label: "MCP Server Port",
    placeholder: "4444",
    helpText:
      "Port for the MCP server that Claude and other AI tools connect to. Requires restart.",
    type: "number",
  },
];

type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | {
      state: "available";
      version: string;
      update: Awaited<ReturnType<typeof check>>;
    }
  | { state: "up-to-date" }
  | { state: "downloading" }
  | { state: "error"; message: string };

interface SettingsTabProps {
  onClose?: () => void;
}

export function SettingsTab({ onClose }: SettingsTabProps = {}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [appVersion, setAppVersion] = useState<string>("");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    state: "idle",
  });

  useEffect(() => {
    async function load() {
      try {
        const entries =
          await invoke<{ key: string; value: string }[]>("get_all_settings");
        const map: Record<string, string> = {};
        for (const e of entries) {
          map[e.key] = e.value;
        }
        setValues(map);
      } catch {
        // settings table may be empty
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion("unknown"));
  }, []);

  const handleCheckForUpdate = useCallback(async () => {
    setUpdateStatus({ state: "checking" });
    try {
      const update = await check();
      if (update) {
        setUpdateStatus({
          state: "available",
          version: update.version,
          update,
        });
      } else {
        setUpdateStatus({ state: "up-to-date" });
      }
    } catch (err) {
      setUpdateStatus({
        state: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const handleInstallUpdate = useCallback(async () => {
    if (updateStatus.state !== "available") return;
    const { update } = updateStatus;
    setUpdateStatus({ state: "downloading" });
    try {
      await update!.downloadAndInstall();
      await relaunch();
    } catch (err) {
      setUpdateStatus({
        state: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [updateStatus]);

  const handleSave = useCallback(
    async (key: string) => {
      const value = values[key];
      if (value === undefined || value.trim() === "") return;
      try {
        await invoke("set_setting", { key, value: value.trim() });
        setSaved((prev) => ({ ...prev, [key]: true }));
        setTimeout(() => setSaved((prev) => ({ ...prev, [key]: false })), 2000);
      } catch {
        // ignore
      }
    },
    [values],
  );

  const handleChange = useCallback((key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    setSaved((prev) => ({ ...prev, [key]: false }));
  }, []);

  if (loading) {
    return (
      <div className="settings-tab">
        {onClose && (
          <button
            type="button"
            className="settings-close-btn"
            onClick={onClose}
            aria-label="Close settings"
            title="Close settings (Esc)"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M3 3L11 11M11 3L3 11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
        <p className="settings-loading">Loading settings...</p>
      </div>
    );
  }

  function renderField(field: SettingField) {
    return (
      <div key={field.key} className="settings-field">
        <label className="settings-label" htmlFor={`setting-${field.key}`}>
          {field.label}
        </label>
        {field.type === "textarea" ? (
          <>
            <textarea
              id={`setting-${field.key}`}
              className="settings-textarea"
              value={values[field.key] || ""}
              onChange={(e) => handleChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              rows={3}
            />
            <div style={{ marginTop: "6px" }}>
              <button
                className="settings-save-btn"
                onClick={() => handleSave(field.key)}
                disabled={!values[field.key]?.trim()}
              >
                {saved[field.key] ? "Saved" : "Save"}
              </button>
            </div>
          </>
        ) : (
          <div className="settings-input-row">
            <input
              id={`setting-${field.key}`}
              className="settings-input"
              type={field.type}
              value={values[field.key] || ""}
              onChange={(e) => handleChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave(field.key);
              }}
            />
            <button
              className="settings-save-btn"
              onClick={() => handleSave(field.key)}
              disabled={!values[field.key]?.trim()}
            >
              {saved[field.key] ? "Saved" : "Save"}
            </button>
          </div>
        )}
        <p className="settings-help">{field.helpText}</p>
      </div>
    );
  }

  return (
    <div className="settings-tab">
      {onClose && (
        <button
          type="button"
          className="settings-close-btn"
          onClick={onClose}
          aria-label="Close settings"
          title="Close settings (Esc)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M3 3L11 11M11 3L3 11"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
      <h2 className="settings-title">Settings</h2>

      <section className="settings-section">
        <h3 className="settings-section-title">GitHub Integration</h3>
        <p className="settings-section-desc">
          To use GitHub features (auth, PRs, CI, env sharing), create a GitHub
          OAuth App:
        </p>
        <ol className="settings-steps">
          <li>
            Go to{" "}
            <a
              href="https://github.com/settings/developers"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/settings/developers
            </a>
          </li>
          <li>Click &quot;New OAuth App&quot;</li>
          <li>
            Set Homepage URL and Callback URL to <code>http://localhost</code>
          </li>
          <li>
            After creating, enable <strong>Device flow</strong> in the app
            settings
          </li>
          <li>Copy the Client ID and paste it below</li>
        </ol>
        {GITHUB_FIELDS.map(renderField)}
      </section>

      <hr className="settings-divider" />

      <section className="settings-section">
        <h3 className="settings-section-title">Terminal</h3>
        <p className="settings-section-desc">
          Configure the default shell and commands that run when a new terminal
          tab opens.
        </p>
        {TERMINAL_FIELDS.map(renderField)}
      </section>

      <hr className="settings-divider" />

      <section className="settings-section">
        <h3 className="settings-section-title">Updates</h3>
        <p className="settings-section-desc">
          Current version: <strong>{appVersion || "..."}</strong>
        </p>

        <div className="settings-update-status">
          {updateStatus.state === "idle" && (
            <button
              className="settings-save-btn"
              onClick={handleCheckForUpdate}
            >
              Check for Updates
            </button>
          )}

          {updateStatus.state === "checking" && (
            <span className="settings-update-msg">Checking for updates...</span>
          )}

          {updateStatus.state === "up-to-date" && (
            <div className="settings-update-row">
              <span className="settings-update-msg settings-update-success">
                You&apos;re up to date!
              </span>
              <button
                className="settings-save-btn settings-btn-secondary"
                onClick={handleCheckForUpdate}
              >
                Check Again
              </button>
            </div>
          )}

          {updateStatus.state === "available" && (
            <div className="settings-update-row">
              <span className="settings-update-msg">
                Version <strong>{updateStatus.version}</strong> is available.
              </span>
              <button
                className="settings-save-btn"
                onClick={handleInstallUpdate}
              >
                Update Now
              </button>
            </div>
          )}

          {updateStatus.state === "downloading" && (
            <span className="settings-update-msg">
              Downloading and installing update...
            </span>
          )}

          {updateStatus.state === "error" && (
            <div className="settings-update-row">
              <span className="settings-update-msg settings-update-error">
                Update check failed: {updateStatus.message}
              </span>
              <button
                className="settings-save-btn settings-btn-secondary"
                onClick={handleCheckForUpdate}
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </section>

      <hr className="settings-divider" />

      <section className="settings-section settings-info">
        <h3 className="settings-section-title">Service Ports</h3>
        <p className="settings-section-desc">
          The following services run locally when Workroot starts. Change ports
          only if there are conflicts. Changes require restarting Workroot.
        </p>
        {PORT_FIELDS.map(renderField)}
        <table className="settings-port-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Default</th>
              <th>Current</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Reverse Proxy</td>
              <td>3000</td>
              <td>{values["proxy_port"] || "3000"}</td>
            </tr>
            <tr>
              <td>HTTP Forward Proxy</td>
              <td>8888</td>
              <td>{values["forward_proxy_port"] || "8888"}</td>
            </tr>
            <tr>
              <td>MCP Server</td>
              <td>4444</td>
              <td>{values["mcp_port"] || "4444"}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
