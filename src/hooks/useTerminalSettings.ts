import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_THEME_ID } from "../lib/terminalThemes";

interface TerminalSettingsSnapshot {
  shell: string | null;
  initCommand: string | null;
  themeId: string | null;
}

export function useTerminalSettings() {
  const [terminalShell, setTerminalShell] = useState(() =>
    navigator.platform.toLowerCase().includes("win")
      ? "powershell.exe"
      : "/bin/zsh",
  );
  const [terminalThemeId, setTerminalThemeId] = useState(DEFAULT_THEME_ID);
  const [terminalInitCommand, setTerminalInitCommand] = useState<string | null>(
    null,
  );

  useEffect(() => {
    invoke<TerminalSettingsSnapshot>("get_terminal_settings").then(
      (settings) => {
        if (settings.themeId?.trim()) {
          setTerminalThemeId(settings.themeId.trim());
        }
        if (settings.shell?.trim()) {
          setTerminalShell(settings.shell.trim());
        }
        setTerminalInitCommand(settings.initCommand?.trim() || null);
      },
      () => {},
    );
  }, []);

  return {
    terminalShell,
    terminalThemeId,
    terminalInitCommand,
    setTerminalThemeId,
  };
}
