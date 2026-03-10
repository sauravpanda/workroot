import { invoke } from "@tauri-apps/api/core";

const STYLE_ID = "workroot-custom-css";

export async function loadCustomCSS(): Promise<string> {
  try {
    const css = await invoke<string | null>("get_setting", {
      key: "custom_css",
    });
    if (css?.trim()) {
      injectCSS(css);
      return css;
    }
  } catch {
    // Setting not found — no custom CSS
  }
  return "";
}

export async function saveCustomCSS(css: string): Promise<void> {
  await invoke("set_setting", { key: "custom_css", value: css });
  injectCSS(css);
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
    // ignore
  }
}
