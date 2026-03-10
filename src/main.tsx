import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./styles/sidebar.css";
import "./styles/env-panel.css";
import "./styles/terminal.css";
import "./styles/command-palette.css";
import "./styles/command-bookmarks.css";
import "./styles/terminal-themes.css";
import "./styles/task-runner.css";
import "./styles/task-graph.css";
import "./styles/app-theme-picker.css";
import "./styles/keyboard-shortcuts.css";
import "./styles/github-sidebar.css";
import "./styles/task-history.css";
import "./styles/theme-editor.css";
import "./styles/density-picker.css";
import "./styles/custom-css-editor.css";
import "./styles/stash-manager.css";
import "./styles/blame-view.css";
import "./styles/branch-compare.css";
import "./styles/git-hooks.css";
import "./styles/conflict-resolver.css";
import "./styles/security-audit.css";
import "./styles/secret-scanner.css";
import "./styles/license-report.css";
import "./styles/security-headers.css";
import "./styles/test-runner-panel.css";
import "./styles/coverage-report.css";
import "./styles/benchmark-dashboard.css";
import "./styles/docker-panel.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
