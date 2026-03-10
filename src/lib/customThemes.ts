import { invoke } from "@tauri-apps/api/core";
import type { AppTheme } from "../themes/engine";

const STORAGE_KEY = "custom_themes";

export async function loadCustomThemes(): Promise<AppTheme[]> {
  try {
    const raw = await invoke<string | null>("get_setting", {
      key: STORAGE_KEY,
    });
    if (!raw?.trim()) return [];
    return JSON.parse(raw) as AppTheme[];
  } catch {
    return [];
  }
}

export async function saveCustomThemes(themes: AppTheme[]): Promise<void> {
  await invoke("set_setting", {
    key: STORAGE_KEY,
    value: JSON.stringify(themes),
  });
}

export async function deleteCustomTheme(themeId: string): Promise<void> {
  const themes = await loadCustomThemes();
  const filtered = themes.filter((t) => t.id !== themeId);
  await saveCustomThemes(filtered);
}
