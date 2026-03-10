import { useState, useEffect, useRef, useCallback } from "react";
import {
  loadCustomCSS,
  saveCustomCSS,
  injectCSS,
  removeCustomCSS,
} from "../themes/customCSS";
import "../styles/custom-css-editor.css";

const CSS_VARIABLES = [
  { name: "--bg-base", desc: "Darkest background" },
  { name: "--bg-surface", desc: "Card / panel background" },
  { name: "--bg-elevated", desc: "Elevated surface background" },
  { name: "--bg-hover", desc: "Hover state background" },
  { name: "--border-subtle", desc: "Subtle border" },
  { name: "--border", desc: "Standard border" },
  { name: "--border-strong", desc: "Strong border" },
  { name: "--text-primary", desc: "Primary text" },
  { name: "--text-secondary", desc: "Secondary text" },
  { name: "--text-muted", desc: "Muted text" },
  { name: "--accent", desc: "Accent color" },
  { name: "--accent-hover", desc: "Accent hover" },
  { name: "--accent-muted", desc: "Accent muted" },
  { name: "--danger", desc: "Danger / error" },
  { name: "--warning", desc: "Warning" },
  { name: "--success", desc: "Success" },
  { name: "--font-sans", desc: "Sans-serif font" },
  { name: "--font-mono", desc: "Monospace font" },
  { name: "--radius-sm", desc: "Small radius" },
  { name: "--radius", desc: "Default radius" },
  { name: "--radius-lg", desc: "Large radius" },
];

interface CustomCSSEditorProps {
  onClose: () => void;
}

export function CustomCSSEditor({ onClose }: CustomCSSEditorProps) {
  const [css, setCss] = useState("");
  const [savedCSS, setSavedCSS] = useState("");
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadCustomCSS().then((loaded) => {
      setCss(loaded);
      setSavedCSS(loaded);
    });
  }, []);

  const handleChange = useCallback((value: string) => {
    setCss(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      injectCSS(value);
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await saveCustomCSS(css);
      setSavedCSS(css);
    } catch {
      // save failed
    }
    setSaving(false);
  }, [css]);

  const handleReset = useCallback(async () => {
    setCss("");
    await removeCustomCSS();
    setSavedCSS("");
  }, []);

  const handleCancel = useCallback(() => {
    injectCSS(savedCSS);
    onClose();
  }, [savedCSS, onClose]);

  return (
    <div className="csseditor-backdrop" onClick={handleCancel}>
      <div className="csseditor-panel" onClick={(e) => e.stopPropagation()}>
        <div className="csseditor-header">
          <h3 className="csseditor-title">Custom CSS Editor</h3>
          <button className="csseditor-close" onClick={handleCancel}>
            &times;
          </button>
        </div>

        <div className="csseditor-body">
          <div className="csseditor-main">
            <textarea
              className="csseditor-textarea"
              value={css}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={`:root {\n  --accent: #6366f1;\n}\n\n/* Add your custom CSS here */`}
              spellCheck={false}
            />
          </div>

          <div className="csseditor-sidebar">
            <div className="csseditor-sidebar-title">CSS Variables</div>
            <div className="csseditor-var-list">
              {CSS_VARIABLES.map((v) => (
                <div key={v.name} className="csseditor-var-item">
                  <code className="csseditor-var-name">{v.name}</code>
                  <span className="csseditor-var-desc">{v.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="csseditor-footer">
          <button
            className="csseditor-btn csseditor-btn-danger"
            onClick={handleReset}
          >
            Reset
          </button>
          <div className="csseditor-footer-right">
            <button
              className="csseditor-btn csseditor-btn-secondary"
              onClick={handleCancel}
            >
              Cancel
            </button>
            <button
              className="csseditor-btn csseditor-btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
