interface ShortcutGroup {
  label: string;
  shortcuts: Array<{
    keys: string[];
    description: string;
  }>;
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: "General",
    shortcuts: [
      { keys: ["\u2318", "K"], description: "Open command palette" },
      { keys: ["\u2318", ","], description: "Open settings" },
      { keys: ["\u2318", "B"], description: "Command bookmarks" },
      { keys: ["\u2318", "T"], description: "Terminal theme selector" },
      { keys: ["\u2318", "R"], description: "Task runner" },
      { keys: ["\u2318", "G"], description: "Toggle GitHub sidebar" },
      { keys: ["\u2318", "N"], description: "Notifications" },
      { keys: ["\u2318", "J"], description: "AI Chat" },
      { keys: ["\u2318", "P"], description: "Search Everything" },
      { keys: ["\u2318", "E"], description: "File Explorer" },
      { keys: ["\u2318", "L"], description: "Git Log" },
      { keys: ["\u2318", "\u21E7", "O"], description: "Quick Switcher" },
      { keys: ["\u2318", "\u21E7", "D"], description: "Error Diagnosis" },
      { keys: ["\u2318", "?"], description: "Keyboard shortcuts" },
    ],
  },
  {
    label: "Terminal",
    shortcuts: [
      { keys: ["\u2318", "\\"], description: "Split pane vertically" },
      {
        keys: ["\u2318", "\u21E7", "-"],
        description: "Split pane horizontally",
      },
      { keys: ["\u2318", "\u21E7", "W"], description: "Close active pane" },
    ],
  },
  {
    label: "Navigation",
    shortcuts: [
      { keys: ["Esc"], description: "Close current panel" },
      { keys: ["\u2191", "\u2193"], description: "Navigate items" },
      { keys: ["Enter"], description: "Select / confirm" },
    ],
  },
];

interface KeyboardShortcutsProps {
  onClose: () => void;
}

export function KeyboardShortcuts({ onClose }: KeyboardShortcutsProps) {
  return (
    <div
      className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm [animation:cmd-backdrop-in_0.12s_ease-out]"
      onClick={onClose}
    >
      <div
        className="fixed left-1/2 top-[15%] flex max-h-[65vh] w-[440px] max-w-[calc(100vw-40px)] -translate-x-1/2 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-surface)] shadow-[0_24px_64px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)] [animation:cmd-palette-in_0.15s_ease-out] z-[9999]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 pb-2.5 pt-3.5">
          <h3 className="m-0 text-[0.88em] font-semibold text-[var(--text-primary)]">
            Keyboard Shortcuts
          </h3>
          <button
            className="flex size-6 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent p-0 text-base leading-none text-[var(--text-muted)] transition-colors duration-100 hover:text-[var(--text-primary)]"
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-2 [scrollbar-width:thin]">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.label} className="mb-3">
              <div className="pb-1 pt-2 text-[0.68em] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                {group.label}
              </div>
              {group.shortcuts.map((shortcut) => (
                <div
                  key={shortcut.description}
                  className="flex items-center justify-between py-[5px]"
                >
                  <span className="text-[0.8em] text-[var(--text-secondary)]">
                    {shortcut.description}
                  </span>
                  <span className="flex shrink-0 gap-[3px]">
                    {shortcut.keys.map((key, i) => (
                      <kbd
                        key={i}
                        className="inline-flex min-w-[22px] h-[22px] items-center justify-center rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-[5px] font-mono text-[0.68em] font-medium leading-none text-[var(--text-secondary)] shadow-[0_1px_0_var(--border-strong)]"
                      >
                        {key}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
