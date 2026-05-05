// User-tunable appearance: mono font + transcript body size. Persists
// in the existing settings table via two keys (appearance_mono_font,
// appearance_font_size). Applies via two CSS variables on the
// document root:
//   --font-mono       (overrides the @theme default → cascades
//                       everywhere mono is used)
//   --app-msg-size    (consumed only by .agent-detail__msg-body)
//
// Kept tiny and pure — no React state. Callers (App.tsx for the
// initial paint, SettingsTab for the controls) own their own state
// and call applyAppearance() to push it to the DOM.

import { invoke } from "@tauri-apps/api/core";

export interface MonoFontOption {
  id: string;
  label: string;
  stack: string;
}

export const MONO_FONT_OPTIONS: MonoFontOption[] = [
  {
    id: "jetbrains",
    label: "JetBrains Mono",
    stack: '"JetBrains Mono", "SF Mono", "Menlo", "Cascadia Code", monospace',
  },
  {
    id: "sfmono",
    label: "SF Mono",
    stack: '"SF Mono", "Menlo", "Monaco", monospace',
  },
  {
    id: "menlo",
    label: "Menlo",
    stack: '"Menlo", "Monaco", "Courier New", monospace',
  },
  {
    id: "cascadia",
    label: "Cascadia Code",
    stack: '"Cascadia Code", "Cascadia Mono", "Menlo", monospace',
  },
  {
    id: "geist",
    label: "Geist Mono",
    stack: '"Geist Mono", "JetBrains Mono", "SF Mono", monospace',
  },
];

export const BODY_SIZE_OPTIONS = [12, 13, 14, 15, 16] as const;

export interface Appearance {
  monoFontId: string;
  bodySize: number;
}

export const DEFAULT_APPEARANCE: Appearance = {
  monoFontId: "jetbrains",
  bodySize: 13,
};

export function fontStackFor(id: string): string {
  return (
    MONO_FONT_OPTIONS.find((o) => o.id === id)?.stack ??
    MONO_FONT_OPTIONS[0].stack
  );
}

export function applyAppearance(a: Appearance): void {
  const root = document.documentElement;
  root.style.setProperty("--font-mono", fontStackFor(a.monoFontId));
  root.style.setProperty("--app-msg-size", `${a.bodySize}px`);
}

/** Load the persisted appearance from the settings table. Returns
 *  defaults on any error (table empty, key missing, network blip). */
export async function loadAppearance(): Promise<Appearance> {
  try {
    const entries =
      await invoke<{ key: string; value: string }[]>("get_all_settings");
    const map: Record<string, string> = {};
    for (const e of entries) map[e.key] = e.value;
    const fontId = map.appearance_mono_font || DEFAULT_APPEARANCE.monoFontId;
    const sizeRaw = map.appearance_font_size;
    const size = sizeRaw ? parseInt(sizeRaw, 10) : DEFAULT_APPEARANCE.bodySize;
    return {
      monoFontId: MONO_FONT_OPTIONS.some((o) => o.id === fontId)
        ? fontId
        : DEFAULT_APPEARANCE.monoFontId,
      bodySize:
        Number.isFinite(size) &&
        (BODY_SIZE_OPTIONS as readonly number[]).includes(size)
          ? size
          : DEFAULT_APPEARANCE.bodySize,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export async function persistMonoFont(id: string): Promise<void> {
  try {
    await invoke("set_setting", { key: "appearance_mono_font", value: id });
  } catch {
    // ignore — applied to DOM regardless; SQLite write failure is rare
  }
}

export async function persistBodySize(px: number): Promise<void> {
  try {
    await invoke("set_setting", {
      key: "appearance_font_size",
      value: String(px),
    });
  } catch {
    // ignore
  }
}
