import { useState, useCallback, useEffect, useRef } from "react";

export interface Command {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  icon?: string;
  action: () => void;
  enabled?: () => boolean;
  /** Lower = ranks higher in empty-query results + ties. Defaults
   *  to 0. Used by the App to demote commands that don't apply to
   *  the current view (e.g. "Go Home" while already home). #509. */
  priority?: number;
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
        // Return recent commands first, then all, sorted by priority
        // (lower = higher) within each group.
        const byPrio = (a: Command, b: Command) =>
          (a.priority ?? 0) - (b.priority ?? 0);
        const recentCmds = state.recentIds
          .map((id) => state.commands.find((c) => c.id === id))
          .filter((c): c is Command => c !== undefined)
          .sort(byPrio);
        const rest = state.commands
          .filter((c) => !state.recentIds.includes(c.id))
          .sort(byPrio);
        return [...recentCmds, ...rest].filter(
          (c) => !c.enabled || c.enabled(),
        );
      }

      // Pass 1: collect substring-only matches (label or category
      // contains the query). These are unambiguous and stand alone.
      // Pass 2: only fall back to scattered-fuzzy matches when pass 1
      // returned nothing — keeps "Settings" from dragging in commands
      // that only match because the letters appear in any order. #510.
      const enabled = state.commands.filter((c) => !c.enabled || c.enabled());
      const sub = enabled.filter((c) => {
        const hay = `${c.label} ${c.category}`.toLowerCase();
        return hay.includes(q);
      });
      const pool =
        sub.length > 0
          ? sub
          : enabled.filter((c) => {
              const haystack = `${c.label} ${c.category} ${c.id}`.toLowerCase();
              let hi = 0;
              for (const ch of q) {
                const idx = haystack.indexOf(ch, hi);
                if (idx === -1) return false;
                hi = idx + 1;
              }
              return true;
            });

      return pool.sort((a, b) => {
        const aLabel = a.label.toLowerCase();
        const bLabel = b.label.toLowerCase();
        // Prefer starts-with matches
        const aStarts = aLabel.startsWith(q) ? 0 : 1;
        const bStarts = bLabel.startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        // Then prefer label-contains over category-only contains
        const aContains = aLabel.includes(q) ? 0 : 1;
        const bContains = bLabel.includes(q) ? 0 : 1;
        if (aContains !== bContains) return aContains - bContains;
        // Then priority (lower wins)
        const aPrio = a.priority ?? 0;
        const bPrio = b.priority ?? 0;
        if (aPrio !== bPrio) return aPrio - bPrio;
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
