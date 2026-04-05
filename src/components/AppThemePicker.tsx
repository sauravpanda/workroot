import { useState, useCallback } from "react";
import { BUILTIN_THEMES, getAppThemeById } from "../themes/builtin";
import { applyTheme, saveThemeId } from "../themes/engine";
import type { AppTheme } from "../themes/engine";
import "../styles/app-theme-picker.css";
import { Dialog, DialogContent } from "./ui/dialog";

interface AppThemePickerProps {
  currentThemeId: string;
  onThemeChange: (themeId: string) => void;
  onClose: () => void;
}

export function AppThemePicker({
  currentThemeId,
  onThemeChange,
  onClose,
}: AppThemePickerProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleSelect = useCallback(
    async (themeId: string) => {
      const theme = getAppThemeById(themeId);
      applyTheme(theme);
      await saveThemeId(themeId);
      onThemeChange(themeId);
      onClose();
    },
    [onThemeChange, onClose],
  );

  const handleHover = useCallback(
    (themeId: string | null) => {
      setHoveredId(themeId);
      if (themeId) {
        applyTheme(getAppThemeById(themeId));
      } else {
        applyTheme(getAppThemeById(currentThemeId));
      }
    },
    [currentThemeId],
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          applyTheme(getAppThemeById(currentThemeId));
          onClose();
        }
      }}
    >
      <DialogContent className="app-theme-panel">
        <div className="app-theme-header">
          <h3 className="app-theme-title">App Theme</h3>
          <button
            className="app-theme-close"
            onClick={() => {
              applyTheme(getAppThemeById(currentThemeId));
              onClose();
            }}
          >
            &times;
          </button>
        </div>

        <div className="app-theme-grid">
          {BUILTIN_THEMES.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              isActive={theme.id === currentThemeId}
              isHovered={theme.id === hoveredId}
              onSelect={handleSelect}
              onHover={handleHover}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ThemeCard({
  theme,
  isActive,
  isHovered,
  onSelect,
  onHover,
}: {
  theme: AppTheme;
  isActive: boolean;
  isHovered: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  return (
    <button
      className={`app-theme-card ${isActive ? "app-theme-card-active" : ""} ${isHovered ? "app-theme-card-hovered" : ""}`}
      onClick={() => onSelect(theme.id)}
      onMouseEnter={() => onHover(theme.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div
        className="app-theme-preview"
        style={{ background: theme.colors.bgBase }}
      >
        <div
          className="app-theme-preview-sidebar"
          style={{ background: theme.colors.bgSurface }}
        >
          <div
            className="app-theme-preview-bar"
            style={{ background: theme.colors.accent, width: "60%" }}
          />
          <div
            className="app-theme-preview-bar"
            style={{ background: theme.colors.textMuted, width: "80%" }}
          />
          <div
            className="app-theme-preview-bar"
            style={{ background: theme.colors.textMuted, width: "45%" }}
          />
        </div>
        <div className="app-theme-preview-content">
          <div
            className="app-theme-preview-line"
            style={{ background: theme.colors.textPrimary, width: "70%" }}
          />
          <div
            className="app-theme-preview-line"
            style={{ background: theme.colors.textSecondary, width: "50%" }}
          />
          <div className="app-theme-preview-colors">
            <span
              className="app-theme-preview-dot"
              style={{ background: theme.colors.accent }}
            />
            <span
              className="app-theme-preview-dot"
              style={{ background: theme.colors.danger }}
            />
            <span
              className="app-theme-preview-dot"
              style={{ background: theme.colors.warning }}
            />
            <span
              className="app-theme-preview-dot"
              style={{ background: theme.colors.success }}
            />
          </div>
        </div>
      </div>
      <div className="app-theme-card-footer">
        <span className="app-theme-card-name">{theme.name}</span>
        <span className="app-theme-card-variant">
          {theme.variant === "light" ? "Light" : "Dark"}
        </span>
        {isActive && <span className="app-theme-card-check">&#10003;</span>}
      </div>
    </button>
  );
}
