import { useState, useCallback, useRef, useEffect } from "react";
import { BUILTIN_THEMES, getAppThemeById } from "../themes/builtin";
import { applyTheme } from "../themes/engine";
import type { AppTheme } from "../themes/engine";
import { loadCustomThemes, saveCustomThemes } from "../lib/customThemes";
import "../styles/theme-editor.css";
import { Dialog, DialogContent } from "./ui/dialog";

interface ThemeEditorProps {
  currentThemeId: string;
  onClose: () => void;
  onThemeSave: (theme: AppTheme) => void;
}

type ColorKey = keyof AppTheme["colors"];

interface ColorGroup {
  label: string;
  keys: ColorKey[];
}

const COLOR_GROUPS: ColorGroup[] = [
  {
    label: "Backgrounds",
    keys: ["bgBase", "bgSurface", "bgElevated", "bgHover"],
  },
  {
    label: "Borders",
    keys: ["borderSubtle", "border", "borderStrong"],
  },
  {
    label: "Text",
    keys: ["textPrimary", "textSecondary", "textMuted"],
  },
  {
    label: "Accent",
    keys: ["accent", "accentHover", "accentMuted", "accentGlow"],
  },
  {
    label: "Semantic",
    keys: ["danger", "dangerMuted", "warning", "success"],
  },
];

const COLOR_LABELS: Record<ColorKey, string> = {
  bgBase: "Base",
  bgSurface: "Surface",
  bgElevated: "Elevated",
  bgHover: "Hover",
  borderSubtle: "Subtle",
  border: "Default",
  borderStrong: "Strong",
  textPrimary: "Primary",
  textSecondary: "Secondary",
  textMuted: "Muted",
  accent: "Accent",
  accentHover: "Hover",
  accentMuted: "Muted",
  accentGlow: "Glow",
  danger: "Danger",
  dangerMuted: "Danger Muted",
  warning: "Warning",
  success: "Success",
};

function generateId(): string {
  return `custom-${Date.now().toString(36)}`;
}

/**
 * Normalise any CSS colour (hex, rgb, rgba, named) to a 6-digit hex string
 * so it can be consumed by <input type="color">.  Falls back to black.
 */
function toHex6(raw: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const [, r, g, b] = raw.split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  // Try creating an off-screen element to resolve any CSS colour
  try {
    const el = document.createElement("span");
    el.style.color = raw;
    document.body.appendChild(el);
    const computed = getComputedStyle(el).color;
    document.body.removeChild(el);

    const match = computed.match(
      /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\s*\)/,
    );
    if (match) {
      const hex = (n: string) => parseInt(n).toString(16).padStart(2, "0");
      return `#${hex(match[1])}${hex(match[2])}${hex(match[3])}`;
    }
  } catch {
    // ignore
  }
  return "#000000";
}

export function ThemeEditor({
  currentThemeId,
  onClose,
  onThemeSave,
}: ThemeEditorProps) {
  const originalTheme = getAppThemeById(currentThemeId);

  const [baseThemeId, setBaseThemeId] = useState(currentThemeId);
  const [themeName, setThemeName] = useState("My Custom Theme");
  const [variant, setVariant] = useState<"dark" | "light">(
    originalTheme.variant,
  );
  const [colors, setColors] = useState<AppTheme["colors"]>({
    ...originalTheme.colors,
  });

  const importRef = useRef<HTMLInputElement>(null);

  // Live preview: apply theme whenever colors / variant change
  useEffect(() => {
    const preview: AppTheme = {
      id: "__preview__",
      name: themeName,
      variant,
      colors,
    };
    applyTheme(preview);
  }, [colors, variant, themeName]);

  const handleBaseChange = useCallback(
    (id: string) => {
      const base = getAppThemeById(id);
      setBaseThemeId(id);
      setVariant(base.variant);
      setColors({ ...base.colors });
    },
    [setBaseThemeId, setVariant, setColors],
  );

  const handleColorChange = useCallback(
    (key: ColorKey, value: string) => {
      setColors((prev) => ({ ...prev, [key]: value }));
    },
    [setColors],
  );

  const handleCancel = useCallback(() => {
    applyTheme(originalTheme);
    onClose();
  }, [originalTheme, onClose]);

  const handleSave = useCallback(async () => {
    const newTheme: AppTheme = {
      id: generateId(),
      name: themeName.trim() || "Custom Theme",
      variant,
      colors,
    };

    // Persist
    const existing = await loadCustomThemes();
    existing.push(newTheme);
    await saveCustomThemes(existing);

    onThemeSave(newTheme);
    onClose();
  }, [themeName, variant, colors, onThemeSave, onClose]);

  const handleExport = useCallback(() => {
    const theme: AppTheme = {
      id: generateId(),
      name: themeName.trim() || "Custom Theme",
      variant,
      colors,
    };
    const blob = new Blob([JSON.stringify(theme, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${theme.name.replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [themeName, variant, colors]);

  const handleImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string) as AppTheme;
          if (parsed.colors && parsed.name) {
            setThemeName(parsed.name);
            setVariant(parsed.variant ?? "dark");
            setColors({ ...parsed.colors });
          }
        } catch {
          // invalid file — ignore
        }
      };
      reader.readAsText(file);
      // Reset so the same file can be re-imported
      e.target.value = "";
    },
    [setThemeName, setVariant, setColors],
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) handleCancel();
      }}
    >
      <DialogContent className="theme-editor-panel">
        {/* Header */}
        <div className="theme-editor-header">
          <h3 className="theme-editor-title">Theme Editor</h3>
          <button className="theme-editor-close" onClick={handleCancel}>
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="theme-editor-body">
          {/* Left: controls */}
          <div className="theme-editor-left">
            {/* Meta fields */}
            <div className="theme-editor-meta">
              <div className="theme-editor-field">
                <label>Theme Name</label>
                <input
                  type="text"
                  value={themeName}
                  onChange={(e) => setThemeName(e.target.value)}
                  placeholder="My Custom Theme"
                />
              </div>

              <div className="theme-editor-field">
                <label>Base Theme</label>
                <select
                  value={baseThemeId}
                  onChange={(e) => handleBaseChange(e.target.value)}
                >
                  {BUILTIN_THEMES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="theme-editor-field">
                <label>Variant</label>
                <div className="theme-editor-variant-toggle">
                  <button
                    className={`theme-editor-variant-btn ${variant === "dark" ? "theme-editor-variant-btn-active" : ""}`}
                    onClick={() => setVariant("dark")}
                  >
                    Dark
                  </button>
                  <button
                    className={`theme-editor-variant-btn ${variant === "light" ? "theme-editor-variant-btn-active" : ""}`}
                    onClick={() => setVariant("light")}
                  >
                    Light
                  </button>
                </div>
              </div>
            </div>

            {/* Color groups */}
            {COLOR_GROUPS.map((group) => (
              <div key={group.label} className="theme-editor-group">
                <h4 className="theme-editor-group-title">{group.label}</h4>
                {group.keys.map((key) => (
                  <ColorRow
                    key={key}
                    colorKey={key}
                    value={colors[key]}
                    onChange={handleColorChange}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Right: preview */}
          <div className="theme-editor-right">
            <p className="theme-editor-preview-label">Preview</p>
            <div
              className="theme-editor-preview-mockup"
              style={{ background: colors.bgBase }}
            >
              <div
                className="theme-editor-preview-sidebar"
                style={{ background: colors.bgSurface }}
              >
                <div
                  className="theme-editor-preview-bar"
                  style={{ background: colors.accent, width: "60%" }}
                />
                <div
                  className="theme-editor-preview-bar"
                  style={{ background: colors.textMuted, width: "80%" }}
                />
                <div
                  className="theme-editor-preview-bar"
                  style={{ background: colors.textMuted, width: "45%" }}
                />
              </div>
              <div
                className="theme-editor-preview-content"
                style={{ background: colors.bgElevated }}
              >
                <div
                  className="theme-editor-preview-line"
                  style={{ background: colors.textPrimary, width: "70%" }}
                />
                <div
                  className="theme-editor-preview-line"
                  style={{ background: colors.textSecondary, width: "50%" }}
                />
                <div
                  className="theme-editor-preview-line"
                  style={{ background: colors.textMuted, width: "35%" }}
                />
                <div className="theme-editor-preview-dots">
                  <span
                    className="theme-editor-preview-dot"
                    style={{ background: colors.accent }}
                  />
                  <span
                    className="theme-editor-preview-dot"
                    style={{ background: colors.danger }}
                  />
                  <span
                    className="theme-editor-preview-dot"
                    style={{ background: colors.warning }}
                  />
                  <span
                    className="theme-editor-preview-dot"
                    style={{ background: colors.success }}
                  />
                </div>
              </div>
              <div className="theme-editor-preview-text">
                <span style={{ color: colors.textPrimary, fontSize: "0.82em" }}>
                  Primary text
                </span>
                <span
                  style={{ color: colors.textSecondary, fontSize: "0.76em" }}
                >
                  Secondary text
                </span>
                <span style={{ color: colors.textMuted, fontSize: "0.7em" }}>
                  Muted text
                </span>
              </div>
            </div>

            {/* Border preview */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: 8,
                borderRadius: "var(--radius-sm)",
                background: colors.bgSurface,
              }}
            >
              <div
                style={{
                  height: 1,
                  background: colors.borderSubtle,
                }}
              />
              <div style={{ height: 1, background: colors.border }} />
              <div
                style={{
                  height: 1,
                  background: colors.borderStrong,
                }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="theme-editor-footer">
          <button
            className="theme-editor-btn"
            onClick={() => importRef.current?.click()}
          >
            Import JSON
          </button>
          <input
            ref={importRef}
            className="theme-editor-import-input"
            type="file"
            accept=".json,application/json"
            onChange={handleImport}
          />
          <button className="theme-editor-btn" onClick={handleExport}>
            Export JSON
          </button>
          <div className="theme-editor-footer-spacer" />
          <button className="theme-editor-btn" onClick={handleCancel}>
            Cancel
          </button>
          <button
            className="theme-editor-btn theme-editor-btn-primary"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Color row subcomponent ── */

function ColorRow({
  colorKey,
  value,
  onChange,
}: {
  colorKey: ColorKey;
  value: string;
  onChange: (key: ColorKey, value: string) => void;
}) {
  const hex6 = toHex6(value);

  return (
    <div className="theme-editor-color-row">
      <span className="theme-editor-color-label">{COLOR_LABELS[colorKey]}</span>
      <div className="theme-editor-swatch-wrapper">
        <div className="theme-editor-swatch" style={{ background: value }} />
        <input
          className="theme-editor-color-input"
          type="color"
          value={hex6}
          onChange={(e) => onChange(colorKey, e.target.value)}
        />
      </div>
      <input
        className="theme-editor-hex"
        type="text"
        value={value}
        onChange={(e) => onChange(colorKey, e.target.value)}
      />
    </div>
  );
}
