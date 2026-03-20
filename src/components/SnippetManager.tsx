import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/snippet-manager.css";

interface Snippet {
  id: number;
  title: string;
  language: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface SnippetManagerProps {
  projectId: number | null;
  onClose: () => void;
}

const LANGUAGES = [
  "text",
  "javascript",
  "typescript",
  "python",
  "rust",
  "go",
  "java",
  "ruby",
  "shell",
  "sql",
  "html",
  "css",
  "json",
  "yaml",
  "toml",
  "markdown",
];

export function SnippetManager({ projectId, onClose }: SnippetManagerProps) {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Editor state
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("text");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadSnippets = useCallback(async () => {
    setLoading(true);
    try {
      let result: Snippet[];
      if (search.trim()) {
        result = await invoke<Snippet[]>("search_snippets", {
          projectId,
          query: search.trim(),
        });
      } else {
        result = await invoke<Snippet[]>("list_snippets", { projectId });
      }
      setSnippets(result);
    } catch {
      setSnippets([]);
    }
    setLoading(false);
  }, [projectId, search]);

  useEffect(() => {
    loadSnippets();
  }, [loadSnippets]);

  const selectSnippet = useCallback((snippet: Snippet) => {
    setSelectedId(snippet.id);
    setTitle(snippet.title);
    setLanguage(snippet.language);
    setContent(snippet.content);
    setTagsInput(snippet.tags.join(", "));
  }, []);

  const handleNew = useCallback(() => {
    setSelectedId(null);
    setTitle("");
    setLanguage("text");
    setContent("");
    setTagsInput("");
  }, []);

  const handleSave = useCallback(async () => {
    if (!title.trim()) return;
    setSaving(true);
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    try {
      if (selectedId !== null) {
        await invoke("update_snippet", {
          id: selectedId,
          title: title.trim(),
          language,
          content,
          tags,
        });
      } else {
        const newId = await invoke<number>("create_snippet", {
          projectId,
          title: title.trim(),
          language,
          content,
          tags,
        });
        setSelectedId(newId);
      }
      await loadSnippets();
    } catch {
      // save failed
    }
    setSaving(false);
  }, [
    selectedId,
    projectId,
    title,
    language,
    content,
    tagsInput,
    loadSnippets,
  ]);

  const handleDelete = useCallback(async () => {
    if (selectedId === null) return;
    try {
      await invoke("delete_snippet", { id: selectedId });
      handleNew();
      await loadSnippets();
    } catch {
      // delete failed
    }
  }, [selectedId, handleNew, loadSnippets]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // copy failed
    }
  }, [content]);

  return (
    <div className="snip-backdrop" onClick={onClose}>
      <div className="snip-panel" onClick={(e) => e.stopPropagation()}>
        <div className="snip-header">
          <h3 className="snip-title">Snippets</h3>
          <button className="snip-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="snip-body">
          <div className="snip-sidebar">
            <div className="snip-search-row">
              <input
                className="snip-search"
                type="text"
                placeholder="Search snippets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                spellCheck={false}
              />
            </div>
            <button className="snip-new-btn" onClick={handleNew}>
              + New Snippet
            </button>
            <div className="snip-list">
              {loading ? (
                <div className="snip-empty-list">Loading...</div>
              ) : snippets.length === 0 ? (
                <div className="snip-empty-list">No snippets found.</div>
              ) : (
                snippets.map((s) => (
                  <button
                    key={s.id}
                    className={`snip-list-item ${selectedId === s.id ? "active" : ""}`}
                    onClick={() => selectSnippet(s)}
                  >
                    <span className="snip-list-title">{s.title}</span>
                    <div className="snip-list-meta">
                      <span
                        className={`snip-lang-badge snip-lang-${s.language}`}
                      >
                        {s.language}
                      </span>
                      {s.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="snip-tag-pill">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <span className="snip-list-date">{s.created_at}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="snip-editor">
            <div className="snip-editor-toolbar">
              <input
                className="snip-editor-title"
                type="text"
                placeholder="Snippet title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                spellCheck={false}
              />
              <select
                className="snip-lang-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>

            <textarea
              className="snip-editor-content"
              placeholder="Paste or type your code here..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
            />

            <div className="snip-editor-tags">
              <input
                className="snip-tags-input"
                type="text"
                placeholder="Tags (comma-separated)"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                spellCheck={false}
              />
            </div>

            <div className="snip-editor-actions">
              <button className="snip-copy-btn" onClick={handleCopy}>
                {copied ? "Copied ✓" : "Copy"}
              </button>
              {selectedId !== null && (
                <button className="snip-delete-btn" onClick={handleDelete}>
                  Delete
                </button>
              )}
              <button
                className="snip-save-btn"
                onClick={handleSave}
                disabled={saving || !title.trim()}
              >
                {saving
                  ? "Saving..."
                  : selectedId !== null
                    ? "Update"
                    : "Create"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
