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
  | "portScanner"
  | "dirStats"
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
  | "networkTab"
  | "prStatus"
  | "gitDiff"
  | "createPr"
  | "memoryTab"
  | "shellHistory"
  | "deadEnds"
  | "dbSchema"
  | "browserEvents"
  | "dbExplorer";

// ─── State ───────────────────────────────────────────────────────────────────

type PanelState = Record<PanelKey, boolean>;

const INITIAL_STATE: PanelState = {
  palette: false,
  bookmarks: false,
  themeSelector: false,
  taskRunner: false,
  appThemePicker: false,
  shortcuts: false,
  themeEditor: false,
  densityPicker: false,
  cssEditor: false,
  stashManager: false,
  blameView: false,
  branchCompare: false,
  gitHooks: false,
  conflictResolver: false,
  securityAudit: false,
  secretScanner: false,
  licenseReport: false,
  securityHeaders: false,
  testRunnerPanel: false,
  coverageReport: false,
  benchmark: false,
  docker: false,
  dockerImages: false,
  containerMonitor: false,
  flakyTests: false,
  notifications: false,
  activityTimeline: false,
  pluginManager: false,
  backupRestore: false,
  analyticsDashboard: false,
  aiChat: false,
  unifiedSearch: false,
  settingsPage: false,
  terminalRecording: false,
  doraMetrics: false,
  webhookEvents: false,
  sshManager: false,
  gitAnalytics: false,
  snippetManager: false,
  envDiff: false,
  appPerformance: false,
  fileExplorer: false,
  projectOverview: false,
  webVitals: false,
  pluginRuntime: false,
  depAnalyzer: false,
  portScanner: false,
  dirStats: false,
  tagManager: false,
  gitLog: false,
  workspaceManager: false,
  taskScheduler: false,
  clipboardHistory: false,
  todoPanel: false,
  quickSwitcher: false,
  errorDiagnosis: false,
  morningBriefing: false,
  onboarding: false,
  networkTab: false,
  prStatus: false,
  gitDiff: false,
  createPr: false,
  memoryTab: false,
  shellHistory: false,
  deadEnds: false,
  dbSchema: false,
  browserEvents: false,
  dbExplorer: false,
};

// ─── Reducer ─────────────────────────────────────────────────────────────────

type PanelAction =
  | { type: "open"; panel: PanelKey }
  | { type: "close"; panel: PanelKey }
  | { type: "toggle"; panel: PanelKey }
  | { type: "closeMany"; panels: PanelKey[] };

function reducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "open":
      return state[action.panel] ? state : { ...state, [action.panel]: true };
    case "close":
      return state[action.panel] ? { ...state, [action.panel]: false } : state;
    case "toggle":
      return { ...state, [action.panel]: !state[action.panel] };
    case "closeMany": {
      const patch: Partial<PanelState> = {};
      for (const p of action.panels) patch[p] = false;
      return { ...state, ...patch };
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
