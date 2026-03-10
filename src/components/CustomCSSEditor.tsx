import { useState, useEffect, useCallback, useRef } from "react";
import {
  loadCustomCSS,
  saveCustomCSS,
  removeCustomCSS,
  injectCSS,
} from "../themes/customCSS";
import "../styles/custom-css-editor.css";

interface CustomCSSEditorProps {
  onClose: () => void;
}

const CSS_VARIABLES = [
  "--bg-base",
  "--bg-surface",
  "--bg-elevated",
  "--bg-hover",
  "--border-subtle",
  "--border",
  "--border-strong",
  "--text-primary",
  "--text-secondary",
  "--text-muted",
  "--accent",
  "--accent-hover",
  "--accent-muted",
  "--accent-glow",
  "--danger",
  "--danger-muted",
  "--warning",
  "--success",
  "--font-sans",
  "--font-mono",
  "--radius-sm",
  "--radius",
  "--radius-lg",
];

const EXAMPLE_SNIPPETS = [
  {
    label: "Custom accent color",
    code: `:root {\n  --accent: #6366f1;\n  --accent-hover: #818cf8;\n  --accent-muted: rgba(99, 102, 241, 0.12);\n  --accent-glow: rgba(99, 102, 241, 0.25);\n}`,
  },
  {
    label: "Larger border radius",
    code: `:root {\n  --radius-sm: 6px;\n  --radius: 10px;\n  --radius-lg: 16px;\n}`,
  },
  {
    label: "Custom font",
    code: `:root {\n  --font-sans: "Inter", system-ui, sans-serif;\n  --font-mono: "Fira Code", monospace;\n}`,
  },
  {
    label: "High-contrast borders",
    code: `:root {\n  --border-subtle: #2a2a30;\n  --border: #3a3a42;\n  --border-strong: #5a5a66;\n}`,
  },
];

export function CustomCSSEditor({ onClose }: CustomCSSEditorProps) {
  const [css, setCss] = useState("");
  const [savedCSS, setSavedCSS] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing CSS on mount
  useEffect(() => {
    loadCustomCSS().then((loaded) => {
      setCss(loaded);
      setSavedCSS(loaded);
    });
  }, []);

  // Live preview with debounced injection
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setCss(value);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        injectCSS(value);
      }, 300);
    },
    [],
  );

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSave = useCallback(async () => {
    await saveCustomCSS(css);
    setSavedCSS(css);
    onClose();
  }, [css, onClose]);

  const handleReset = useCallback(async () => {
    await removeCustomCSS();
    setCss("");
    setSavedCSS("");
  }, []);

  const handleCancel = useCallback(() => {
    // Restore previously saved CSS on cancel
    injectCSS(savedCSS);
    onClose();
  }, [savedCSS, onClose]);

  return (
    <div className="css-editor-backdrop" onClick={handleCancel}>
      <div className="css-editor-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="css-editor-header">
          <h3 className="css-editor-title">Custom CSS</h3>
          <button className="css-editor-close" onClick={handleCancel}>
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="css-editor-body">
          {/* Left: editor */}
          <div className="css-editor-left">
            <textarea
              className="css-editor-textarea"
              value={css}
              onChange={handleChange}
              placeholder="/* Enter your custom CSS here */&#10;:root {&#10;  --accent: #6366f1;&#10;}"
              spellCheck={false}
              autoFocus
            />
          </div>

          {/* Right: reference sidebar */}
          <div className="css-editor-right">
            {/* CSS Variables */}
            <div>
              <h4 className="css-editor-ref-title">CSS Variables</h4>
              <ul className="css-editor-ref-list">
                {CSS_VARIABLES.map((v) => (
                  <li key={v} className="css-editor-ref-item">
                    {v}
                  </li>
                ))}
              </ul>
            </div>

            {/* Example Snippets */}
            <div>
              <h4 className="css-editor-ref-title">Example Snippets</h4>
              {EXAMPLE_SNIPPETS.map((s) => (
                <div key={s.label} className="css-editor-snippet">
                  <p className="css-editor-snippet-label">{s.label}</p>
                  <pre className="css-editor-snippet-code">{s.code}</pre>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="css-editor-footer">
          <button
            className="css-editor-btn css-editor-btn-danger"
            onClick={handleReset}
          >
            Reset
          </button>
          <div className="css-editor-footer-spacer" />
          <button className="css-editor-btn" onClick={handleCancel}>
            Cancel
          </button>
          <button
            className="css-editor-btn css-editor-btn-primary"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
