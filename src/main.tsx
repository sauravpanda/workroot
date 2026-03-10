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
import "./styles/app-theme-picker.css";
import "./styles/keyboard-shortcuts.css";
import "./styles/github-sidebar.css";
import "./styles/theme-editor.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
