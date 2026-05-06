import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { open as openShell } from "@tauri-apps/plugin-shell";
import {
  type Appearance,
  BODY_SIZE_OPTIONS,
  DEFAULT_APPEARANCE,
  MONO_FONT_OPTIONS,
  applyAppearance,
  loadAppearance,
  persistBodySize,
  persistMonoFont,
} from "../lib/appearance";
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
  /** Callback to open the Helm Machines management panel — invoked
   *  from the "Manage helm machines" button in this tab. The actual
   *  panel lives in PanelHost; this is the bridge. */
  onOpenHelmMachines?: () => void;
}

export function SettingsTab({
  onClose,
  onOpenHelmMachines,
}: SettingsTabProps = {}) {
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

  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);
  useEffect(() => {
    void loadAppearance().then(setAppearance);
  }, []);

  const handleMonoFontChange = useCallback((id: string) => {
    setAppearance((prev) => {
      const next = { ...prev, monoFontId: id };
      applyAppearance(next);
      void persistMonoFont(id);
      return next;
    });
  }, []);

  const handleBodySizeChange = useCallback((px: number) => {
    setAppearance((prev) => {
      const next = { ...prev, bodySize: px };
      applyAppearance(next);
      void persistBodySize(px);
      return next;
    });
  }, []);

  // Esc closes the settings tab. Doesn't fire inside text inputs
  // (where Esc is sometimes used to clear/blur the field).
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
            <svg
              width="12"
              height="12"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M9 3L4 7L9 11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Back</span>
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
          <svg
            width="12"
            height="12"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M9 3L4 7L9 11"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Back</span>
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
        <h3 className="settings-section-title">Appearance</h3>
        <p className="settings-section-desc">
          Tune the agent transcript font and size. Changes apply immediately and
          persist across launches.
        </p>

        <div className="settings-field">
          <label
            className="settings-label"
            htmlFor="setting-appearance-mono-font"
          >
            Mono Font
          </label>
          <select
            id="setting-appearance-mono-font"
            className="settings-input"
            value={appearance.monoFontId}
            onChange={(e) => handleMonoFontChange(e.target.value)}
          >
            {MONO_FONT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="settings-help">
            Used everywhere mono renders — chat body, tool args, code blocks,
            diff viewer.
          </p>
        </div>

        <div className="settings-field">
          <label
            className="settings-label"
            htmlFor="setting-appearance-font-size"
          >
            Transcript Font Size
          </label>
          <select
            id="setting-appearance-font-size"
            className="settings-input"
            value={appearance.bodySize}
            onChange={(e) => handleBodySizeChange(parseInt(e.target.value, 10))}
          >
            {BODY_SIZE_OPTIONS.map((px) => (
              <option key={px} value={px}>
                {px}px
              </option>
            ))}
          </select>
          <p className="settings-help">
            Sets the body size for assistant + user messages. Code blocks size
            relative to this.
          </p>
        </div>
      </section>

      <hr className="settings-divider" />

      <section className="settings-section">
        <h3 className="settings-section-title">Helm Machines</h3>
        <p className="settings-section-desc">
          Workroot connects to one or more helm-daemon machines (local or
          tailnet) to spawn and watch agents. Add, remove, or rotate tokens
          here.
        </p>
        <button
          type="button"
          className="settings-save-btn"
          onClick={() => onOpenHelmMachines?.()}
          disabled={!onOpenHelmMachines}
        >
          Manage helm machines
        </button>
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
        <h3 className="settings-section-title">About</h3>
        <p className="settings-section-desc">
          Workroot{appVersion ? ` v${appVersion}` : ""} — a desktop console for
          helm agents.
        </p>
        <ul className="settings-about-list">
          <li>
            Source:{" "}
            <a
              href="https://github.com/sauravpanda/workroot"
              onClick={(e) => {
                e.preventDefault();
                void openShell("https://github.com/sauravpanda/workroot").catch(
                  () => {},
                );
              }}
            >
              github.com/sauravpanda/workroot
            </a>
          </li>
          <li>
            Issues:{" "}
            <a
              href="https://github.com/sauravpanda/workroot/issues"
              onClick={(e) => {
                e.preventDefault();
                void openShell(
                  "https://github.com/sauravpanda/workroot/issues",
                ).catch(() => {});
              }}
            >
              github.com/sauravpanda/workroot/issues
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}
