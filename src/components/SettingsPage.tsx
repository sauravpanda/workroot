import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Dialog, DialogContent } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SettingsPageProps {
  onClose: () => void;
}

type SettingsSection =
  | "general"
  | "ai"
  | "appearance"
  | "git"
  | "security"
  | "docker"
  | "notifications"
  | "about";

interface ToggleSettingConfig {
  key: string;
  label: string;
  description: string;
}

interface TextSettingConfig {
  key: string;
  label: string;
  placeholder: string;
  description: string;
  type: "text" | "number" | "password";
}

/* ------------------------------------------------------------------ */
/*  Section nav items                                                  */
/* ------------------------------------------------------------------ */

const SECTIONS: { id: SettingsSection; label: string; icon: string }[] = [
  { id: "general", label: "General", icon: "G" },
  { id: "ai", label: "AI", icon: "A" },
  { id: "appearance", label: "Appearance", icon: "P" },
  { id: "git", label: "Git", icon: "B" },
  { id: "security", label: "Security", icon: "S" },
  { id: "docker", label: "Docker", icon: "D" },
  { id: "notifications", label: "Notifications", icon: "N" },
  { id: "about", label: "About", icon: "?" },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function SettingsPage({ onClose }: SettingsPageProps) {
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("general");
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "checking" | "up-to-date" | "available" | "downloading" | "error"
  >("idle");
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string>("");

  // Load app version on mount
  useEffect(() => {
    getVersion().then((v) => setAppVersion(v));
  }, []);

  // Load all settings on mount
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

  const handleChange = useCallback((key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    setSaved((prev) => ({ ...prev, [key]: false }));
  }, []);

  const handleSave = useCallback(
    async (key: string) => {
      const value = values[key];
      if (value === undefined) return;
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

  const handleToggle = useCallback(
    async (key: string) => {
      const current = values[key] === "true";
      const newValue = current ? "false" : "true";
      setValues((prev) => ({ ...prev, [key]: newValue }));
      try {
        await invoke("set_setting", { key, value: newValue });
        setSaved((prev) => ({ ...prev, [key]: true }));
        setTimeout(() => setSaved((prev) => ({ ...prev, [key]: false })), 2000);
      } catch {
        // revert on error
        setValues((prev) => ({ ...prev, [key]: current ? "true" : "false" }));
      }
    },
    [values],
  );

  const handleResetSection = useCallback((keys: string[]) => {
    for (const key of keys) {
      setValues((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }, []);

  const handleCheckUpdate = useCallback(async () => {
    setUpdateStatus("checking");
    setUpdateError(null);
    try {
      const update = await check();
      if (update?.available) {
        setUpdateVersion(update.version ?? null);
        setUpdateStatus("available");
        setUpdateStatus("downloading");
        await update.downloadAndInstall();
        await relaunch();
      } else {
        setUpdateStatus("up-to-date");
      }
    } catch (e) {
      setUpdateError(String(e));
      setUpdateStatus("error");
    }
  }, []);

  /* ── Render helpers ── */

  function renderTextField(config: TextSettingConfig) {
    return (
      <div key={config.key} className="settings-page__field">
        <Label
          htmlFor={`sp-${config.key}`}
          className="settings-page__field-label"
        >
          {config.label}
        </Label>
        <div className="settings-page__field-row">
          <Input
            id={`sp-${config.key}`}
            className="settings-page__field-input h-8 text-xs"
            type={config.type}
            value={values[config.key] || ""}
            onChange={(e) => handleChange(config.key, e.target.value)}
            placeholder={config.placeholder}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave(config.key);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="settings-page__save-btn h-8 text-xs shrink-0"
            onClick={() => handleSave(config.key)}
            disabled={!values[config.key]?.trim()}
          >
            {saved[config.key] ? "Saved" : "Save"}
          </Button>
        </div>
        <p className="settings-page__field-desc">{config.description}</p>
      </div>
    );
  }

  function renderToggle(config: ToggleSettingConfig) {
    const isOn = values[config.key] === "true";
    return (
      <div key={config.key} className="settings-page__toggle-row">
        <div className="settings-page__toggle-info">
          <span className="settings-page__toggle-label">{config.label}</span>
          <span className="settings-page__toggle-desc">
            {config.description}
          </span>
        </div>
        <Switch
          checked={isOn}
          onCheckedChange={() => handleToggle(config.key)}
          aria-label={config.label}
        />
        {saved[config.key] && (
          <span className="settings-page__saved-indicator">Saved</span>
        )}
      </div>
    );
  }

  function renderSectionActions(keys: string[]) {
    const sectionId = keys.join(",");
    const isConfirming = confirmingReset === sectionId;

    return (
      <div className="settings-page__section-actions">
        {isConfirming ? (
          <>
            <span className="text-xs text-text-muted">Are you sure?</span>
            <Button
              variant="ghost"
              size="sm"
              className="settings-page__reset-btn text-xs text-red-500 hover:text-red-400"
              onClick={() => {
                handleResetSection(keys);
                setConfirmingReset(null);
              }}
            >
              Confirm
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-text-muted hover:text-text-secondary"
              onClick={() => setConfirmingReset(null)}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="settings-page__reset-btn text-xs text-text-muted hover:text-text-secondary"
            onClick={() => setConfirmingReset(sectionId)}
          >
            Reset to defaults
          </Button>
        )}
      </div>
    );
  }

  /* ── Section content ── */

  function renderContent() {
    if (loading) {
      return <div className="settings-page__loading">Loading settings...</div>;
    }

    switch (activeSection) {
      case "general":
        return (
          <div className="settings-page__section-content">
            <h2 className="settings-page__section-title">General</h2>
            <p className="settings-page__section-desc">
              Configure project defaults and startup behavior.
            </p>

            {renderTextField({
              key: "default_project_path",
              label: "Default Project Path",
              placeholder: "~/Projects",
              description:
                "Default directory when creating or cloning new projects.",
              type: "text",
            })}

            {renderToggle({
              key: "open_last_project",
              label: "Open last project on startup",
              description:
                "Automatically re-open the last active project when Workroot starts.",
            })}

            {renderToggle({
              key: "check_updates",
              label: "Check for updates automatically",
              description: "Periodically check for new versions of Workroot.",
            })}

            <div className="settings-page__field">
              <div className="settings-page__field-label">Software Update</div>
              <p className="settings-page__field-desc">
                Manually check for a new version of Workroot.
              </p>
              <div className="settings-page__update-row">
                <Button
                  variant="outline"
                  size="sm"
                  className="settings-page__btn text-xs"
                  onClick={handleCheckUpdate}
                  disabled={
                    updateStatus === "checking" ||
                    updateStatus === "downloading"
                  }
                >
                  {updateStatus === "checking"
                    ? "Checking…"
                    : updateStatus === "downloading"
                      ? "Installing…"
                      : "Check for Updates"}
                </Button>
                {updateStatus === "up-to-date" && (
                  <span className="settings-page__update-ok">
                    You're up to date.
                  </span>
                )}
                {updateStatus === "available" && updateVersion && (
                  <span className="settings-page__update-ok">
                    v{updateVersion} found — installing…
                  </span>
                )}
                {updateStatus === "error" && (
                  <span className="settings-page__update-error">
                    {updateError ?? "Update check failed."}
                  </span>
                )}
              </div>
            </div>

            {renderTextField({
              key: "editor_command",
              label: "External Editor Command",
              placeholder: "code",
              description:
                "Command to open files in an external editor (e.g., code, vim, subl).",
              type: "text",
            })}

            {renderSectionActions([
              "default_project_path",
              "open_last_project",
              "check_updates",
              "editor_command",
            ])}
          </div>
        );

      case "ai":
        return (
          <div className="settings-page__section-content">
            <h2 className="settings-page__section-title">AI</h2>
            <p className="settings-page__section-desc">
              Configure local LLM connections via Ollama or LM Studio.
            </p>

            {renderTextField({
              key: "ai_endpoint",
              label: "Ollama / LM Studio Endpoint",
              placeholder: "http://localhost:11434",
              description:
                "Base URL for the local LLM API. Ollama default is http://localhost:11434.",
              type: "text",
            })}

            {renderTextField({
              key: "ai_default_model",
              label: "Default Model",
              placeholder: "llama3",
              description:
                "The model to select by default when opening the AI chat sidebar.",
              type: "text",
            })}

            {renderToggle({
              key: "ai_save_history",
              label: "Save chat history",
              description:
                "Persist chat conversations across sessions. Disable to clear history on close.",
            })}

            {renderTextField({
              key: "ai_max_tokens",
              label: "Max Response Tokens",
              placeholder: "2048",
              description: "Maximum number of tokens in AI responses.",
              type: "number",
            })}

            {renderSectionActions([
              "ai_endpoint",
              "ai_default_model",
              "ai_save_history",
              "ai_max_tokens",
            ])}
          </div>
        );

      case "appearance":
        return (
          <div className="settings-page__section-content">
            <h2 className="settings-page__section-title">Appearance</h2>
            <p className="settings-page__section-desc">
              Customize the look and feel of Workroot.
            </p>

            <div className="settings-page__button-group">
              <Button
                variant="outline"
                size="sm"
                className="settings-page__action-btn"
                onClick={() => dispatchCustomEvent("open-theme-picker")}
              >
                <PaletteIcon />
                <span>Theme Picker</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="settings-page__action-btn"
                onClick={() => dispatchCustomEvent("open-density-picker")}
              >
                <LayoutIcon />
                <span>Density Picker</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="settings-page__action-btn"
                onClick={() => dispatchCustomEvent("open-custom-css-editor")}
              >
                <CodeIcon />
                <span>Custom CSS Editor</span>
              </Button>
            </div>

            {renderTextField({
              key: "font_size",
              label: "Base Font Size",
              placeholder: "14",
              description: "Base font size in pixels for the application UI.",
              type: "number",
            })}

            {renderToggle({
              key: "reduce_motion",
              label: "Reduce motion",
              description: "Minimize animations throughout the interface.",
            })}

            {renderSectionActions(["font_size", "reduce_motion"])}
          </div>
        );

      case "git":
        return (
          <div className="settings-page__section-content">
            <h2 className="settings-page__section-title">Git</h2>
            <p className="settings-page__section-desc">
              Git defaults and automation settings.
            </p>

            {renderTextField({
              key: "git_default_branch",
              label: "Default Branch Name",
              placeholder: "main",
              description:
                "Default branch name when initializing new repositories.",
              type: "text",
            })}

            {renderTextField({
              key: "git_auto_fetch_interval",
              label: "Auto-Fetch Interval (seconds)",
              placeholder: "300",
              description:
                "How often to automatically fetch from remotes. Set to 0 to disable.",
              type: "number",
            })}

            {renderToggle({
              key: "git_commit_signing",
              label: "Enable commit signing",
              description:
                "Sign commits with GPG key. Requires GPG to be configured.",
            })}

            {renderToggle({
              key: "git_auto_stash",
              label: "Auto-stash before pull",
              description:
                "Automatically stash uncommitted changes before pulling.",
            })}

            {renderSectionActions([
              "git_default_branch",
              "git_auto_fetch_interval",
              "git_commit_signing",
              "git_auto_stash",
            ])}
          </div>
        );

      case "security":
        return (
          <div className="settings-page__section-content">
            <h2 className="settings-page__section-title">Security</h2>
            <p className="settings-page__section-desc">
              Security scanning and secret detection settings.
            </p>

            {renderToggle({
              key: "security_auto_scan",
              label: "Auto-scan on push",
              description:
                "Automatically run security scans before pushing to remote.",
            })}

            {renderTextField({
              key: "security_ignore_patterns",
              label: "Secret Patterns to Ignore",
              placeholder: "*.test.ts, fixtures/**",
              description:
                "Comma-separated glob patterns for files to exclude from secret scanning.",
              type: "text",
            })}

            {renderToggle({
              key: "security_block_on_secrets",
              label: "Block push on detected secrets",
              description:
                "Prevent pushing when secrets are found in staged changes.",
            })}

            {renderSectionActions([
              "security_auto_scan",
              "security_ignore_patterns",
              "security_block_on_secrets",
            ])}
          </div>
        );

      case "docker":
        return (
          <div className="settings-page__section-content">
            <h2 className="settings-page__section-title">Docker</h2>
            <p className="settings-page__section-desc">
              Docker integration and container management settings.
            </p>

            {renderTextField({
              key: "docker_socket_path",
              label: "Docker Socket Path",
              placeholder: "/var/run/docker.sock",
              description:
                "Path to the Docker daemon socket. Uses default if empty.",
              type: "text",
            })}

            {renderToggle({
              key: "docker_auto_detect",
              label: "Auto-detect Docker",
              description:
                "Automatically detect Docker installation and show Docker panel.",
            })}

            {renderToggle({
              key: "docker_show_system_containers",
              label: "Show system containers",
              description:
                "Include system/infrastructure containers in the Docker panel.",
            })}

            {renderSectionActions([
              "docker_socket_path",
              "docker_auto_detect",
              "docker_show_system_containers",
            ])}
          </div>
        );

      case "notifications":
        return (
          <div className="settings-page__section-content">
            <h2 className="settings-page__section-title">Notifications</h2>
            <p className="settings-page__section-desc">
              Configure notification behavior and GitHub polling.
            </p>

            {renderTextField({
              key: "github_poll_interval",
              label: "GitHub Poll Interval (seconds)",
              placeholder: "60",
              description:
                "How often to check for new GitHub notifications. Set to 0 to disable.",
              type: "number",
            })}

            {renderToggle({
              key: "notification_sound",
              label: "Notification sound",
              description: "Play a sound when new notifications arrive.",
            })}

            {renderToggle({
              key: "notification_badge",
              label: "Show notification badge",
              description:
                "Display unread count badge on the notification icon.",
            })}

            {renderToggle({
              key: "notification_ci_failures",
              label: "Notify on CI failures",
              description: "Show a notification when a CI pipeline fails.",
            })}

            {renderSectionActions([
              "github_poll_interval",
              "notification_sound",
              "notification_badge",
              "notification_ci_failures",
            ])}
          </div>
        );

      case "about":
        return (
          <div className="settings-page__section-content">
            <h2 className="settings-page__section-title">About Workroot</h2>
            <p className="settings-page__section-desc">
              A local-first developer workspace for managing projects,
              terminals, and Git workflows.
            </p>

            <div className="settings-page__field">
              <div className="settings-page__field-label">Version</div>
              <p className="settings-page__field-desc">
                {appVersion ? `v${appVersion}` : "Loading..."}
              </p>
            </div>

            <div className="settings-page__field">
              <div className="settings-page__field-label">Source Code</div>
              <p className="settings-page__field-desc">
                <a
                  href="https://github.com/sauravpanda/workroot"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--color-accent, #58a6ff)" }}
                >
                  github.com/sauravpanda/workroot
                </a>
              </p>
            </div>

            <div className="settings-page__field">
              <div className="settings-page__field-label">License</div>
              <p className="settings-page__field-desc">MIT</p>
            </div>
          </div>
        );
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="settings-page__panel" aria-label="Settings">
        {/* Header */}
        <div className="settings-page__header">
          <h2 className="settings-page__title">Settings</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            className="settings-page__close-btn"
            onClick={onClose}
            title="Close settings"
          >
            <CloseIcon />
          </Button>
        </div>

        <div className="settings-page__body">
          {/* Navigation sidebar */}
          <nav className="settings-page__nav">
            {SECTIONS.map((section) => (
              <Button
                key={section.id}
                variant="ghost"
                className={`settings-page__nav-item ${activeSection === section.id ? "settings-page__nav-item--active" : ""}`}
                onClick={() => setActiveSection(section.id)}
              >
                <span className="settings-page__nav-icon">{section.icon}</span>
                <span className="settings-page__nav-label">
                  {section.label}
                </span>
              </Button>
            ))}
          </nav>

          {/* Content area */}
          <div className="settings-page__content">{renderContent()}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function dispatchCustomEvent(name: string) {
  window.dispatchEvent(new CustomEvent(name));
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M3 3L11 11M11 3L3 11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PaletteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="6" cy="6" r="1.2" fill="currentColor" />
      <circle cx="10" cy="6" r="1.2" fill="currentColor" />
      <circle cx="6" cy="10" r="1.2" fill="currentColor" />
    </svg>
  );
}

function LayoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect
        x="2"
        y="2"
        width="12"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M2 6H14M6 6V14" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M5 4L1.5 8L5 12M11 4L14.5 8L11 12"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 2L7 14"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
