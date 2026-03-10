import { invoke } from "@tauri-apps/api/core";

export type DensityMode = "compact" | "comfortable" | "spacious";

const DENSITY_VARS: Record<DensityMode, Record<string, string>> = {
  compact: {
    "--density-padding-xs": "2px",
    "--density-padding-sm": "4px",
    "--density-padding-md": "6px",
    "--density-padding-lg": "10px",
    "--density-gap-sm": "2px",
    "--density-gap-md": "4px",
    "--density-gap-lg": "8px",
    "--density-font-sm": "0.7em",
    "--density-font-md": "0.78em",
    "--density-font-lg": "0.85em",
    "--density-row-height": "26px",
  },
  comfortable: {
    "--density-padding-xs": "4px",
    "--density-padding-sm": "6px",
    "--density-padding-md": "10px",
    "--density-padding-lg": "16px",
    "--density-gap-sm": "4px",
    "--density-gap-md": "6px",
    "--density-gap-lg": "12px",
    "--density-font-sm": "0.75em",
    "--density-font-md": "0.82em",
    "--density-font-lg": "0.9em",
    "--density-row-height": "32px",
  },
  spacious: {
    "--density-padding-xs": "6px",
    "--density-padding-sm": "10px",
    "--density-padding-md": "14px",
    "--density-padding-lg": "22px",
    "--density-gap-sm": "6px",
    "--density-gap-md": "10px",
    "--density-gap-lg": "16px",
    "--density-font-sm": "0.82em",
    "--density-font-md": "0.88em",
    "--density-font-lg": "0.95em",
    "--density-row-height": "38px",
  },
};

export function applyDensity(mode: DensityMode): void {
  const vars = DENSITY_VARS[mode];
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}

export async function loadSavedDensity(): Promise<DensityMode> {
  try {
    const val = await invoke<string | null>("get_setting", {
      key: "density_mode",
    });
    const trimmed = val?.trim();
    if (
      trimmed === "compact" ||
      trimmed === "comfortable" ||
      trimmed === "spacious"
    ) {
      return trimmed;
    }
    return "comfortable";
  } catch {
    return "comfortable";
  }
}

export async function saveDensity(mode: DensityMode): Promise<void> {
  try {
    await invoke("set_setting", { key: "density_mode", value: mode });
  } catch {
    // ignore
  }
}
