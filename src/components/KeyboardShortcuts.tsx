import "../styles/keyboard-shortcuts.css";

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
    <div className="shortcuts-backdrop" onClick={onClose}>
      <div className="shortcuts-panel" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-header">
          <h3 className="shortcuts-title">Keyboard Shortcuts</h3>
          <button className="shortcuts-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="shortcuts-body">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.label} className="shortcuts-group">
              <div className="shortcuts-group-label">{group.label}</div>
              {group.shortcuts.map((shortcut) => (
                <div key={shortcut.description} className="shortcuts-row">
                  <span className="shortcuts-desc">{shortcut.description}</span>
                  <span className="shortcuts-keys">
                    {shortcut.keys.map((key, i) => (
                      <kbd key={i} className="shortcuts-kbd">
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
