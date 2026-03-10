import { invoke } from "@tauri-apps/api/core";

export interface AppTheme {
  id: string;
  name: string;
  variant: "dark" | "light";
  colors: {
    bgBase: string;
    bgSurface: string;
    bgElevated: string;
    bgHover: string;
    borderSubtle: string;
    border: string;
    borderStrong: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    accent: string;
    accentHover: string;
    accentMuted: string;
    accentGlow: string;
    danger: string;
    dangerMuted: string;
    warning: string;
    success: string;
  };
}

const CSS_VAR_MAP: Record<keyof AppTheme["colors"], string> = {
  bgBase: "--bg-base",
  bgSurface: "--bg-surface",
  bgElevated: "--bg-elevated",
  bgHover: "--bg-hover",
  borderSubtle: "--border-subtle",
  border: "--border",
  borderStrong: "--border-strong",
  textPrimary: "--text-primary",
  textSecondary: "--text-secondary",
  textMuted: "--text-muted",
  accent: "--accent",
  accentHover: "--accent-hover",
  accentMuted: "--accent-muted",
  accentGlow: "--accent-glow",
  danger: "--danger",
  dangerMuted: "--danger-muted",
  warning: "--warning",
  success: "--success",
};

export function applyTheme(theme: AppTheme): void {
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(CSS_VAR_MAP)) {
    const value = theme.colors[key as keyof AppTheme["colors"]];
    if (value) {
      root.style.setProperty(cssVar, value);
    }
  }
}

export async function loadSavedThemeId(): Promise<string> {
  try {
    const val = await invoke<string | null>("get_setting", {
      key: "app_theme",
    });
    return val?.trim() || "midnight";
  } catch {
    return "midnight";
  }
}

export async function saveThemeId(themeId: string): Promise<void> {
  try {
    await invoke("set_setting", { key: "app_theme", value: themeId });
  } catch {
    // ignore
  }
}
