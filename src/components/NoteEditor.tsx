import { useState, useEffect, useRef } from "react";

const CATEGORIES = [
  { value: "note", label: "Note" },
  { value: "decision", label: "Decision" },
  { value: "dead_end", label: "Dead End" },
];

interface NoteEditorProps {
  initialContent?: string;
  initialCategory?: string;
  onSave: (content: string, category: string) => void;
  onCancel: () => void;
}

export function NoteEditor({
  initialContent = "",
  initialCategory = "note",
  onSave,
  onCancel,
}: NoteEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [category, setCategory] = useState(initialCategory);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Auto-save after 2 seconds of inactivity
  useEffect(() => {
    if (!content.trim() || content === initialContent) return;

    if (autoSaveRef.current) {
      clearTimeout(autoSaveRef.current);
    }
    autoSaveRef.current = setTimeout(() => {
      onSave(content.trim(), category);
    }, 2000);

    return () => {
      if (autoSaveRef.current) {
        clearTimeout(autoSaveRef.current);
      }
    };
  }, [content, category, initialContent, onSave]);

  const handleSubmit = () => {
    if (!content.trim()) return;
    if (autoSaveRef.current) {
      clearTimeout(autoSaveRef.current);
    }
    onSave(content.trim(), category);
  };

  return (
    <div className="note-editor">
      <div className="note-editor-header">
        <select
          className="note-category-select"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>
      </div>
      <textarea
        ref={textareaRef}
        className="note-editor-textarea"
        placeholder="Write your note... (Markdown supported)"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={5}
      />
      <div className="note-editor-footer">
        <span className="note-editor-hint">Auto-saves after 2s</span>
        <div className="note-editor-actions">
          <button className="note-btn cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="note-btn save"
            onClick={handleSubmit}
            disabled={!content.trim()}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
