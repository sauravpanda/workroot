import { useState, useCallback, useEffect, useRef } from "react";

export interface Command {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  icon?: string;
  action: () => void;
  enabled?: () => boolean;
}

interface CommandRegistryState {
  commands: Command[];
  recentIds: string[];
}

const RECENT_KEY = "workroot:recent-commands";
const MAX_RECENT = 8;

function loadRecent(): string[] {
  try {
    const saved = localStorage.getItem(RECENT_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveRecent(ids: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, MAX_RECENT)));
  } catch {
    // ignore
  }
}

export function useCommandRegistry() {
  const [state, setState] = useState<CommandRegistryState>({
    commands: [],
    recentIds: loadRecent(),
  });
  const commandsRef = useRef<Command[]>([]);

  const register = useCallback((cmds: Command[]) => {
    commandsRef.current = cmds;
    setState((prev) => ({ ...prev, commands: cmds }));
  }, []);

  const execute = useCallback((commandId: string) => {
    const cmd = commandsRef.current.find((c) => c.id === commandId);
    if (!cmd) return;
    if (cmd.enabled && !cmd.enabled()) return;
    cmd.action();
    setState((prev) => {
      const newRecent = [
        commandId,
        ...prev.recentIds.filter((id) => id !== commandId),
      ].slice(0, MAX_RECENT);
      saveRecent(newRecent);
      return { ...prev, recentIds: newRecent };
    });
  }, []);

  const search = useCallback(
    (query: string): Command[] => {
      const q = query.toLowerCase().trim();
      if (!q) {
        // Return recent commands first, then all
        const recentCmds = state.recentIds
          .map((id) => state.commands.find((c) => c.id === id))
          .filter((c): c is Command => c !== undefined);
        const rest = state.commands.filter(
          (c) => !state.recentIds.includes(c.id),
        );
        return [...recentCmds, ...rest].filter(
          (c) => !c.enabled || c.enabled(),
        );
      }

      return state.commands
        .filter((c) => {
          if (c.enabled && !c.enabled()) return false;
          const haystack = `${c.label} ${c.category} ${c.id}`.toLowerCase();
          // Fuzzy: all query chars appear in order
          let hi = 0;
          for (const ch of q) {
            const idx = haystack.indexOf(ch, hi);
            if (idx === -1) return false;
            hi = idx + 1;
          }
          return true;
        })
        .sort((a, b) => {
          const aLabel = a.label.toLowerCase();
          const bLabel = b.label.toLowerCase();
          // Prefer starts-with matches
          const aStarts = aLabel.startsWith(q) ? 0 : 1;
          const bStarts = bLabel.startsWith(q) ? 0 : 1;
          if (aStarts !== bStarts) return aStarts - bStarts;
          // Then prefer contains
          const aContains = aLabel.includes(q) ? 0 : 1;
          const bContains = bLabel.includes(q) ? 0 : 1;
          if (aContains !== bContains) return aContains - bContains;
          return aLabel.localeCompare(bLabel);
        });
    },
    [state.commands, state.recentIds],
  );

  return { commands: state.commands, register, execute, search };
}

export function useGlobalShortcuts(
  shortcuts: Array<{
    key: string;
    meta?: boolean;
    shift?: boolean;
    action: () => void;
  }>,
) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't fire in inputs unless it's a global shortcut with meta
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      for (const shortcut of shortcuts) {
        const metaMatch = shortcut.meta
          ? e.metaKey || e.ctrlKey
          : !e.metaKey && !e.ctrlKey;
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

        if (metaMatch && shiftMatch && keyMatch) {
          // Only block if meta is required (global shortcut) or not in input
          if (shortcut.meta || !isInput) {
            e.preventDefault();
            e.stopPropagation();
            shortcut.action();
            return;
          }
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [shortcuts]);
}
