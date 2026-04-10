import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./styles/sidebar.css";
import "./styles/terminal.css";
import "./styles/command-palette.css";
import "./styles/dashboard.css";
import "./styles/status-bar.css";
import "./styles/project-tabs.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
