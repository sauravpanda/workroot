import { invoke } from "@tauri-apps/api/core";

const STYLE_ID = "workroot-custom-css";

export async function loadCustomCSS(): Promise<string> {
  try {
    const val = await invoke<string | null>("get_setting", {
      key: "custom_css",
    });
    const css = val?.trim() || "";
    if (css) injectCSS(css);
    return css;
  } catch {
    return "";
  }
}

export async function saveCustomCSS(css: string): Promise<void> {
  try {
    await invoke("set_setting", { key: "custom_css", value: css });
    injectCSS(css);
  } catch {
    /* ignore */
  }
}

export function injectCSS(css: string): void {
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

export async function removeCustomCSS(): Promise<void> {
  const el = document.getElementById(STYLE_ID);
  if (el) el.remove();
  try {
    await invoke("delete_setting", { key: "custom_css" });
  } catch {
    /* ignore */
  }
}
