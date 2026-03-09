import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
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

export function SettingsTab() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

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
