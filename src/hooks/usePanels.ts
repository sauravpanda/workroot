import { useCallback, useReducer } from "react";

// ─── Panel keys ──────────────────────────────────────────────────────────────

export type PanelKey =
  | "palette"
  | "bookmarks"
  | "themeSelector"
  | "taskRunner"
  | "appThemePicker"
  | "shortcuts"
  | "themeEditor"
  | "densityPicker"
  | "cssEditor"
  | "stashManager"
  | "blameView"
  | "branchCompare"
  | "gitHooks"
  | "conflictResolver"
  | "securityAudit"
  | "secretScanner"
  | "licenseReport"
  | "securityHeaders"
  | "testRunnerPanel"
  | "coverageReport"
  | "benchmark"
  | "docker"
  | "dockerImages"
  | "containerMonitor"
  | "flakyTests"
  | "notifications"
  | "activityTimeline"
  | "pluginManager"
  | "backupRestore"
  | "analyticsDashboard"
  | "aiChat"
  | "unifiedSearch"
  | "settingsPage"
  | "terminalRecording"
  | "doraMetrics"
  | "webhookEvents"
  | "sshManager"
  | "gitAnalytics"
  | "snippetManager"
  | "envDiff"
  | "appPerformance"
  | "fileExplorer"
  | "projectOverview"
  | "webVitals"
  | "pluginRuntime"
  | "depAnalyzer"
  | "tagManager"
  | "gitLog"
  | "workspaceManager"
  | "taskScheduler"
  | "clipboardHistory"
  | "todoPanel"
  | "quickSwitcher"
  | "errorDiagnosis"
  | "morningBriefing"
  | "onboarding"
  | "prStatus"
  | "gitDiff"
  | "createPr"
  | "memoryTab"
  | "shellHistory"
  | "deadEnds"
  | "browserEvents"
  | "helmMachines"
  | "checkpointManager"
  | "multiAgentPipeline"
  | "modelComparison"
  | "terminalGrid";

// ─── State ───────────────────────────────────────────────────────────────────

type PanelState = ReadonlySet<PanelKey>;

const INITIAL_STATE: PanelState = new Set<PanelKey>();

// ─── Reducer ─────────────────────────────────────────────────────────────────

type PanelAction =
  | { type: "open"; panel: PanelKey }
  | { type: "close"; panel: PanelKey }
  | { type: "toggle"; panel: PanelKey }
  | { type: "closeMany"; panels: PanelKey[] };

function reducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "open": {
      if (state.has(action.panel)) return state;
      const next = new Set(state);
      next.add(action.panel);
      return next;
    }
    case "close": {
      if (!state.has(action.panel)) return state;
      const next = new Set(state);
      next.delete(action.panel);
      return next;
    }
    case "toggle": {
      const next = new Set(state);
      if (next.has(action.panel)) {
        next.delete(action.panel);
      } else {
        next.add(action.panel);
      }
      return next;
    }
    case "closeMany": {
      let changed = false;
      for (const p of action.panels) {
        if (state.has(p)) {
          changed = true;
          break;
        }
      }
      if (!changed) return state;
      const next = new Set(state);
      for (const p of action.panels) next.delete(p);
      return next;
    }
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function usePanels() {
  const [panels, dispatch] = useReducer(reducer, INITIAL_STATE);

  const openPanel = useCallback(
    (panel: PanelKey) => dispatch({ type: "open", panel }),
    [],
  );
  const closePanel = useCallback(
    (panel: PanelKey) => dispatch({ type: "close", panel }),
    [],
  );
  const togglePanel = useCallback(
    (panel: PanelKey) => dispatch({ type: "toggle", panel }),
    [],
  );
  const closePanels = useCallback(
    (panelList: PanelKey[]) =>
      dispatch({ type: "closeMany", panels: panelList }),
    [],
  );

  return { panels, openPanel, closePanel, togglePanel, closePanels } as const;
}
