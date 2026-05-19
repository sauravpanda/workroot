// Helpers for surfacing Tauri-IPC errors to the user. The most common
// confusing case is when the frontend is loaded outside the Tauri
// runtime (browser preview, Vite dev with no Tauri bundle): every
// invoke() rejects with a JS-runtime TypeError about reading 'invoke'
// on undefined, which is total noise to a user.

const TAURI_MISSING_SENTINELS = [
  "Cannot read properties of undefined",
  "is not a function",
  "__TAURI_INTERNALS__",
  "window.__TAURI_IPC__",
];

/** True when the error string clearly comes from the Tauri runtime
 *  not being loaded (vs. a genuine command failure). */
export function isTauriMissingError(e: unknown): boolean {
  const msg = String(e);
  return TAURI_MISSING_SENTINELS.some((s) => msg.includes(s));
}

/** Convert any thrown value to a user-facing string. Hides the
 *  TypeError noise when Tauri isn't loaded. */
export function friendlyError(e: unknown): string {
  if (isTauriMissingError(e)) {
    return "This screen needs the desktop app — Tauri commands aren't available here.";
  }
  return String(e);
}
