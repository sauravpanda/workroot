// Syntax highlighting helpers shared between the agent detail pane and
// any other surface that wants colorized code. Wraps highlight.js with
// a path → language map and a single `highlightCode` entry point.
//
// Languages are registered once at module import. Callers don't need to
// register anything.

import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("go", go);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("python", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);

const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  pyi: "python",
  rs: "rust",
  json: "json",
  jsonc: "json",
  css: "css",
  scss: "css",
  html: "xml",
  htm: "xml",
  xml: "xml",
  svg: "xml",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  yml: "yaml",
  yaml: "yaml",
  toml: "yaml", // close enough — hljs has no toml in our bundle
  sql: "sql",
  md: "markdown",
  mdx: "markdown",
  go: "go",
  patch: "diff",
  diff: "diff",
};

/** Get the highlight.js language id for a file path, or null when we
 *  don't recognize the extension. */
export function getLanguageFromPath(path: string): string | null {
  if (!path) return null;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_LANG[ext] ?? null;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

/** Highlight code as HTML. When `language` is unknown or highlight
 *  fails, returns the escaped raw code so the caller can still
 *  dangerouslySetInnerHTML safely. */
export function highlightCode(code: string, language?: string | null): string {
  try {
    if (language) {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    }
    // Auto-detect is expensive — only use when caller doesn't know.
    return hljs.highlightAuto(code, [
      "typescript",
      "javascript",
      "python",
      "rust",
      "go",
      "json",
      "bash",
      "yaml",
    ]).value;
  } catch {
    return escapeHtml(code);
  }
}
