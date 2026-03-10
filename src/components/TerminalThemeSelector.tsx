import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TERMINAL_THEMES, getThemeById } from "../lib/terminalThemes";
import "../styles/terminal-themes.css";

interface TerminalThemeSelectorProps {
  currentThemeId: string;
  onThemeChange: (themeId: string) => void;
  onClose: () => void;
}

export function TerminalThemeSelector({
  currentThemeId,
  onThemeChange,
  onClose,
}: TerminalThemeSelectorProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const previewTheme = hoveredId
    ? getThemeById(hoveredId)
    : getThemeById(currentThemeId);

  const handleSelect = useCallback(
    async (themeId: string) => {
      try {
        await invoke("set_setting", {
          key: "terminal_theme",
          value: themeId,
        });
      } catch {
        // ignore
      }
      onThemeChange(themeId);
      onClose();
    },
    [onThemeChange, onClose],
  );

  return (
    <div className="theme-selector-backdrop" onClick={onClose}>
      <div
        className="theme-selector-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="theme-selector-header">
          <h3 className="theme-selector-title">Terminal Theme</h3>
          <button className="theme-selector-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="theme-selector-body">
          <div className="theme-selector-list">
            {TERMINAL_THEMES.map((t) => (
              <button
                key={t.id}
                className={`theme-selector-item ${t.id === currentThemeId ? "theme-selector-item-active" : ""}`}
                onClick={() => handleSelect(t.id)}
                onMouseEnter={() => setHoveredId(t.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <span
                  className="theme-selector-swatch"
                  style={{ background: t.theme.background }}
                >
                  <span
                    className="theme-swatch-dot"
                    style={{ background: t.theme.red }}
                  />
                  <span
                    className="theme-swatch-dot"
                    style={{ background: t.theme.green }}
                  />
                  <span
                    className="theme-swatch-dot"
                    style={{ background: t.theme.blue }}
                  />
                  <span
                    className="theme-swatch-dot"
                    style={{ background: t.theme.yellow }}
                  />
                </span>
                <span className="theme-selector-name">{t.name}</span>
                {t.id === currentThemeId && (
                  <span className="theme-selector-check">&#10003;</span>
                )}
              </button>
            ))}
          </div>

          <div className="theme-selector-preview">
            <div
              className="theme-preview-terminal"
              style={{
                background: previewTheme.theme.background,
                color: previewTheme.theme.foreground,
              }}
            >
              <div className="theme-preview-titlebar">
                <span
                  className="theme-preview-dot"
                  style={{ background: previewTheme.theme.red }}
                />
                <span
                  className="theme-preview-dot"
                  style={{ background: previewTheme.theme.yellow }}
                />
                <span
                  className="theme-preview-dot"
                  style={{ background: previewTheme.theme.green }}
                />
                <span className="theme-preview-name">{previewTheme.name}</span>
              </div>
              <div className="theme-preview-content">
                <span style={{ color: previewTheme.theme.green }}>
                  user@workroot
                </span>
                <span style={{ color: previewTheme.theme.foreground }}>:</span>
                <span style={{ color: previewTheme.theme.blue }}>
                  ~/project
                </span>
                <span style={{ color: previewTheme.theme.foreground }}>$ </span>
                <span style={{ color: previewTheme.theme.foreground }}>
                  git status
                </span>
                <br />
                <span style={{ color: previewTheme.theme.green }}>
                  On branch main
                </span>
                <br />
                <span style={{ color: previewTheme.theme.red }}>
                  {"  "}modified: src/App.tsx
                </span>
                <br />
                <span style={{ color: previewTheme.theme.yellow }}>
                  {"  "}new file: src/lib/themes.ts
                </span>
                <br />
                <br />
                <span style={{ color: previewTheme.theme.green }}>
                  user@workroot
                </span>
                <span style={{ color: previewTheme.theme.foreground }}>:</span>
                <span style={{ color: previewTheme.theme.blue }}>
                  ~/project
                </span>
                <span style={{ color: previewTheme.theme.foreground }}>$ </span>
                <span style={{ color: previewTheme.theme.magenta }}>npm</span>
                <span style={{ color: previewTheme.theme.foreground }}>
                  {" "}
                  run build
                </span>
                <br />
                <span style={{ color: previewTheme.theme.cyan }}>
                  Building for production...
                </span>
                <br />
                <span style={{ color: previewTheme.theme.green }}>
                  Done in 2.4s
                </span>
                <br />
                <br />
                <span style={{ color: previewTheme.theme.green }}>
                  user@workroot
                </span>
                <span style={{ color: previewTheme.theme.foreground }}>:</span>
                <span style={{ color: previewTheme.theme.blue }}>
                  ~/project
                </span>
                <span style={{ color: previewTheme.theme.foreground }}>$ </span>
                <span
                  className="theme-preview-cursor"
                  style={{
                    background: previewTheme.theme.cursor,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
