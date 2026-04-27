/**
 * PanelHost renders all overlay panels/dialogs for the app shell.
 * It is a pure rendering concern — all state and callbacks come from AppContent.
 */
import { lazy } from "react";
import { PanelBoundary } from "./ErrorBoundary";
import { FocusTrapOverlay } from "./FocusTrapOverlay";
import type { AppTheme } from "../themes/engine";
import type { DensityMode } from "../themes/density";
import type { PanelKey } from "../hooks/usePanels";

/* eslint-disable @typescript-eslint/no-explicit-any */
const namedLazy = <K extends string>(
  factory: () => Promise<Record<K, React.ComponentType<any>>>,
  name: K,
): React.LazyExoticComponent<React.ComponentType<any>> =>
  lazy(() => factory().then((m) => ({ default: m[name] })));
/* eslint-enable @typescript-eslint/no-explicit-any */

const CommandPalette = namedLazy(
  () => import("./CommandPalette"),
  "CommandPalette",
);
const CommandBookmarks = namedLazy(
  () => import("./CommandBookmarks"),
  "CommandBookmarks",
);
const TerminalThemeSelector = namedLazy(
  () => import("./TerminalThemeSelector"),
  "TerminalThemeSelector",
);
const TaskRunner = namedLazy(() => import("./TaskRunner"), "TaskRunner");
const AppThemePicker = namedLazy(
  () => import("./AppThemePicker"),
  "AppThemePicker",
);
const KeyboardShortcuts = namedLazy(
  () => import("./KeyboardShortcuts"),
  "KeyboardShortcuts",
);
const ThemeEditor = namedLazy(() => import("./ThemeEditor"), "ThemeEditor");
const DensityPicker = namedLazy(
  () => import("./DensityPicker"),
  "DensityPicker",
);
const CustomCSSEditor = namedLazy(
  () => import("./CustomCSSEditor"),
  "CustomCSSEditor",
);
const StashManager = namedLazy(() => import("./StashManager"), "StashManager");
const CheckpointPanel = namedLazy(
  () => import("./CheckpointPanel"),
  "CheckpointPanel",
);
const MultiAgentPipelinePanel = namedLazy(
  () => import("./MultiAgentPipelinePanel"),
  "MultiAgentPipelinePanel",
);
const ModelComparisonPanel = namedLazy(
  () => import("./ModelComparisonPanel"),
  "ModelComparisonPanel",
);
const BlameView = namedLazy(() => import("./BlameView"), "BlameView");
const BranchCompare = namedLazy(
  () => import("./BranchCompare"),
  "BranchCompare",
);
const GitHooksManager = namedLazy(
  () => import("./GitHooksManager"),
  "GitHooksManager",
);
const ConflictResolver = namedLazy(
  () => import("./ConflictResolver"),
  "ConflictResolver",
);
const SecurityAudit = namedLazy(
  () => import("./SecurityAudit"),
  "SecurityAudit",
);
const SecretScanner = namedLazy(
  () => import("./SecretScanner"),
  "SecretScanner",
);
const LicenseReport = namedLazy(
  () => import("./LicenseReport"),
  "LicenseReport",
);
const SecurityHeaders = namedLazy(
  () => import("./SecurityHeaders"),
  "SecurityHeaders",
);
const TestRunnerPanel = namedLazy(
  () => import("./TestRunnerPanel"),
  "TestRunnerPanel",
);
const CoverageReport = namedLazy(
  () => import("./CoverageReport"),
  "CoverageReport",
);
const BenchmarkDashboard = namedLazy(
  () => import("./BenchmarkDashboard"),
  "BenchmarkDashboard",
);
const DockerPanel = namedLazy(() => import("./DockerPanel"), "DockerPanel");
const DockerImages = namedLazy(() => import("./DockerImages"), "DockerImages");
const ContainerMonitor = namedLazy(
  () => import("./ContainerMonitor"),
  "ContainerMonitor",
);
const FlakyTests = namedLazy(() => import("./FlakyTests"), "FlakyTests");
const NotificationCenter = namedLazy(
  () => import("./NotificationCenter"),
  "NotificationCenter",
);
const ActivityTimeline = namedLazy(
  () => import("./ActivityTimeline"),
  "ActivityTimeline",
);
const PluginManager = namedLazy(
  () => import("./PluginManager"),
  "PluginManager",
);
const BackupRestore = namedLazy(
  () => import("./BackupRestore"),
  "BackupRestore",
);
const AnalyticsDashboard = namedLazy(
  () => import("./AnalyticsDashboard"),
  "AnalyticsDashboard",
);
const AiChatSidebar = namedLazy(
  () => import("./AiChatSidebar"),
  "AiChatSidebar",
);
const UnifiedSearch = namedLazy(
  () => import("./UnifiedSearch"),
  "UnifiedSearch",
);
const SettingsPage = namedLazy(() => import("./SettingsPage"), "SettingsPage");
const TerminalRecording = namedLazy(
  () => import("./TerminalRecording"),
  "TerminalRecording",
);
const DoraMetrics = namedLazy(() => import("./DoraMetrics"), "DoraMetrics");
const WebhookEvents = namedLazy(
  () => import("./WebhookEvents"),
  "WebhookEvents",
);
const SshManager = namedLazy(() => import("./SshManager"), "SshManager");
const GitAnalytics = namedLazy(() => import("./GitAnalytics"), "GitAnalytics");
const SnippetManager = namedLazy(
  () => import("./SnippetManager"),
  "SnippetManager",
);
const EnvProfileDiff = namedLazy(
  () => import("./EnvProfileDiff"),
  "EnvProfileDiff",
);
const AppPerformance = namedLazy(
  () => import("./AppPerformance"),
  "AppPerformance",
);
const FileExplorer = namedLazy(() => import("./FileExplorer"), "FileExplorer");
const ProjectOverview = namedLazy(
  () => import("./ProjectOverview"),
  "ProjectOverview",
);
const WebVitals = namedLazy(() => import("./WebVitals"), "WebVitals");
const PluginRuntime = namedLazy(
  () => import("./PluginRuntime"),
  "PluginRuntime",
);
const DependencyAnalyzer = namedLazy(
  () => import("./DependencyAnalyzer"),
  "DependencyAnalyzer",
);
const TagManager = namedLazy(() => import("./TagManager"), "TagManager");
const GitLogViewer = namedLazy(() => import("./GitLogViewer"), "GitLogViewer");
const WorkspaceManager = namedLazy(
  () => import("./WorkspaceManager"),
  "WorkspaceManager",
);
const TaskScheduler = namedLazy(
  () => import("./TaskScheduler"),
  "TaskScheduler",
);
const ClipboardHistory = namedLazy(
  () => import("./ClipboardHistory"),
  "ClipboardHistory",
);
const TodoPanel = namedLazy(() => import("./TodoPanel"), "TodoPanel");
const QuickSwitcher = namedLazy(
  () => import("./QuickSwitcher"),
  "QuickSwitcher",
);
const ErrorDiagnosis = namedLazy(
  () => import("./ErrorDiagnosis"),
  "ErrorDiagnosis",
);
const MorningBriefing = namedLazy(
  () => import("./MorningBriefing"),
  "MorningBriefing",
);
const OnboardingWizard = namedLazy(
  () => import("./OnboardingWizard"),
  "OnboardingWizard",
);
const PRStatusPanel = namedLazy(
  () => import("./PRStatusPanel"),
  "PRStatusPanel",
);
const GitDiffView = namedLazy(() => import("./GitDiffView"), "GitDiffView");
const CreatePRPanel = namedLazy(
  () => import("./CreatePRPanel"),
  "CreatePRPanel",
);
const MemoryTab = namedLazy(() => import("./MemoryTab"), "MemoryTab");
const ShellHistoryTab = namedLazy(
  () => import("./ShellHistoryTab"),
  "ShellHistoryTab",
);
const DeadEndsLog = namedLazy(() => import("./DeadEndsLog"), "DeadEndsLog");
const BrowserEvents = namedLazy(
  () => import("./BrowserEvents"),
  "BrowserEvents",
);

interface PanelHostProps {
  panels: ReadonlySet<PanelKey>;
  openPanel: (name: PanelKey) => void;
  closePanel: (name: PanelKey) => void;
  selectedProjectId: number | null;
  selectedWorktreeId: number | null;
  allWorktreeIds?: number[];
  selectedWorktreePath: string | null;
  selectedWorktreeName: string | null;
  blameFilePath: string;
  setBlameFilePath: (path: string) => void;
  appThemeId: string;
  setAppThemeId: (id: string) => void;
  onApplyAppTheme: (theme: AppTheme) => void;
  terminalThemeId: string;
  setTerminalThemeId: (id: string) => void;
  densityMode: DensityMode;
  onApplyDensityMode: (mode: DensityMode) => void;
  execute: (id: string) => void;
  search: (query: string) => import("../hooks/useCommandRegistry").Command[];
  contentTab: string;
  setContentTab: (tab: string) => void;
  onClosePalette: () => void;
  onCloseBookmarks: () => void;
  onSwitchProject: (id: number) => void;
}

export function PanelHost({
  panels,
  openPanel,
  closePanel,
  selectedProjectId,
  selectedWorktreeId,
  allWorktreeIds,
  selectedWorktreePath,
  selectedWorktreeName,
  blameFilePath,
  setBlameFilePath,
  appThemeId,
  setAppThemeId,
  onApplyAppTheme,
  terminalThemeId,
  setTerminalThemeId,
  densityMode,
  onApplyDensityMode,
  execute,
  search,
  contentTab: _contentTab,
  setContentTab,
  onClosePalette,
  onCloseBookmarks,
  onSwitchProject,
}: PanelHostProps) {
  return (
    <>
      <PanelBoundary name="CommandPalette">
        <CommandPalette
          open={panels.has("palette")}
          onClose={onClosePalette}
          onExecute={execute}
          search={search}
        />
      </PanelBoundary>
      {panels.has("bookmarks") && (
        <PanelBoundary name="CommandBookmarks">
          <CommandBookmarks
            projectId={selectedProjectId}
            onClose={onCloseBookmarks}
          />
        </PanelBoundary>
      )}
      {panels.has("themeSelector") && (
        <PanelBoundary name="TerminalThemeSelector">
          <TerminalThemeSelector
            currentThemeId={terminalThemeId}
            onThemeChange={setTerminalThemeId}
            onClose={() => closePanel("themeSelector")}
          />
        </PanelBoundary>
      )}
      {panels.has("taskRunner") && selectedWorktreePath && (
        <PanelBoundary name="TaskRunner">
          <TaskRunner
            cwd={selectedWorktreePath}
            onClose={() => closePanel("taskRunner")}
          />
        </PanelBoundary>
      )}
      {panels.has("appThemePicker") && (
        <PanelBoundary name="AppThemePicker">
          <AppThemePicker
            currentThemeId={appThemeId}
            onThemeChange={setAppThemeId}
            onClose={() => closePanel("appThemePicker")}
          />
        </PanelBoundary>
      )}
      {panels.has("themeEditor") && (
        <PanelBoundary name="ThemeEditor">
          <ThemeEditor
            currentThemeId={appThemeId}
            onClose={() => closePanel("themeEditor")}
            onThemeSave={(theme: AppTheme) => {
              onApplyAppTheme(theme);
            }}
          />
        </PanelBoundary>
      )}
      {panels.has("densityPicker") && (
        <PanelBoundary name="DensityPicker">
          <DensityPicker
            currentMode={densityMode}
            onModeChange={(mode: DensityMode) => {
              onApplyDensityMode(mode);
            }}
            onClose={() => closePanel("densityPicker")}
          />
        </PanelBoundary>
      )}
      {panels.has("shortcuts") && (
        <PanelBoundary name="KeyboardShortcuts">
          <KeyboardShortcuts onClose={() => closePanel("shortcuts")} />
        </PanelBoundary>
      )}
      {panels.has("cssEditor") && (
        <PanelBoundary name="CustomCSSEditor">
          <CustomCSSEditor onClose={() => closePanel("cssEditor")} />
        </PanelBoundary>
      )}
      {panels.has("stashManager") && selectedWorktreeId !== null && (
        <PanelBoundary name="StashManager">
          <StashManager
            worktreeId={selectedWorktreeId}
            onClose={() => closePanel("stashManager")}
          />
        </PanelBoundary>
      )}
      {panels.has("checkpointManager") && selectedWorktreeId !== null && (
        <PanelBoundary name="CheckpointPanel">
          <CheckpointPanel
            worktreeId={selectedWorktreeId}
            onClose={() => closePanel("checkpointManager")}
          />
        </PanelBoundary>
      )}
      {panels.has("multiAgentPipeline") && selectedWorktreeId !== null && (
        <PanelBoundary name="MultiAgentPipeline">
          <MultiAgentPipelinePanel
            worktreeId={selectedWorktreeId}
            allWorktreeIds={allWorktreeIds}
            onClose={() => closePanel("multiAgentPipeline")}
          />
        </PanelBoundary>
      )}
      {panels.has("modelComparison") && selectedWorktreeId !== null && (
        <PanelBoundary name="ModelComparison">
          <FocusTrapOverlay onClick={() => closePanel("modelComparison")}>
            <div
              className="panel-dialog panel-dialog--wide"
              onClick={(e) => e.stopPropagation()}
            >
              <ModelComparisonPanel
                worktreeId={selectedWorktreeId}
                onClose={() => closePanel("modelComparison")}
              />
            </div>
          </FocusTrapOverlay>
        </PanelBoundary>
      )}
      {panels.has("blameView") && selectedWorktreeId !== null && (
        <PanelBoundary name="BlameView">
          <BlameView
            worktreeId={selectedWorktreeId}
            filePath={blameFilePath}
            onClose={() => closePanel("blameView")}
          />
        </PanelBoundary>
      )}
      {panels.has("branchCompare") && selectedWorktreeId !== null && (
        <PanelBoundary name="BranchCompare">
          <BranchCompare
            worktreeId={selectedWorktreeId}
            onClose={() => closePanel("branchCompare")}
          />
        </PanelBoundary>
      )}
      {panels.has("gitHooks") && selectedWorktreeId !== null && (
        <PanelBoundary name="GitHooksManager">
          <GitHooksManager
            worktreeId={selectedWorktreeId}
            onClose={() => closePanel("gitHooks")}
          />
        </PanelBoundary>
      )}
      {panels.has("conflictResolver") && selectedWorktreeId !== null && (
        <PanelBoundary name="ConflictResolver">
          <ConflictResolver
            worktreeId={selectedWorktreeId}
            onClose={() => closePanel("conflictResolver")}
          />
        </PanelBoundary>
      )}
      {panels.has("securityAudit") && selectedWorktreePath && (
        <PanelBoundary name="SecurityAudit">
          <SecurityAudit
            cwd={selectedWorktreePath}
            onClose={() => {
              closePanel("securityAudit");
              setContentTab("terminal");
            }}
          />
        </PanelBoundary>
      )}
      {panels.has("secretScanner") && selectedWorktreePath && (
        <PanelBoundary name="SecretScanner">
          <SecretScanner
            cwd={selectedWorktreePath}
            onClose={() => closePanel("secretScanner")}
          />
        </PanelBoundary>
      )}
      {panels.has("licenseReport") && selectedWorktreePath && (
        <PanelBoundary name="LicenseReport">
          <LicenseReport
            cwd={selectedWorktreePath}
            onClose={() => closePanel("licenseReport")}
          />
        </PanelBoundary>
      )}
      {panels.has("securityHeaders") && (
        <PanelBoundary name="SecurityHeaders">
          <SecurityHeaders onClose={() => closePanel("securityHeaders")} />
        </PanelBoundary>
      )}
      {panels.has("testRunnerPanel") && selectedWorktreePath && (
        <PanelBoundary name="TestRunner">
          <TestRunnerPanel
            cwd={selectedWorktreePath}
            onClose={() => {
              closePanel("testRunnerPanel");
              setContentTab("terminal");
            }}
          />
        </PanelBoundary>
      )}
      {panels.has("coverageReport") && selectedWorktreePath && (
        <PanelBoundary name="CoverageReport">
          <CoverageReport
            cwd={selectedWorktreePath}
            onClose={() => closePanel("coverageReport")}
          />
        </PanelBoundary>
      )}
      {panels.has("benchmark") && selectedWorktreePath && (
        <PanelBoundary name="Benchmark">
          <BenchmarkDashboard
            cwd={selectedWorktreePath}
            onClose={() => closePanel("benchmark")}
          />
        </PanelBoundary>
      )}
      {panels.has("docker") && selectedWorktreePath && (
        <PanelBoundary name="Docker">
          <DockerPanel
            cwd={selectedWorktreePath}
            onClose={() => {
              closePanel("docker");
              setContentTab("terminal");
            }}
          />
        </PanelBoundary>
      )}
      {panels.has("dockerImages") && (
        <PanelBoundary name="DockerImages">
          <DockerImages onClose={() => closePanel("dockerImages")} />
        </PanelBoundary>
      )}
      {panels.has("containerMonitor") && (
        <PanelBoundary name="ContainerMonitor">
          <ContainerMonitor onClose={() => closePanel("containerMonitor")} />
        </PanelBoundary>
      )}
      {panels.has("flakyTests") && selectedWorktreePath && (
        <PanelBoundary name="FlakyTests">
          <FlakyTests
            cwd={selectedWorktreePath}
            onClose={() => closePanel("flakyTests")}
          />
        </PanelBoundary>
      )}
      <PanelBoundary name="NotificationCenter">
        <NotificationCenter
          open={panels.has("notifications")}
          onClose={() => closePanel("notifications")}
        />
      </PanelBoundary>
      {panels.has("activityTimeline") && (
        <PanelBoundary name="ActivityTimeline">
          <ActivityTimeline onClose={() => closePanel("activityTimeline")} />
        </PanelBoundary>
      )}
      {panels.has("pluginManager") && (
        <PanelBoundary name="PluginManager">
          <PluginManager onClose={() => closePanel("pluginManager")} />
        </PanelBoundary>
      )}
      {panels.has("backupRestore") && (
        <PanelBoundary name="BackupRestore">
          <BackupRestore onClose={() => closePanel("backupRestore")} />
        </PanelBoundary>
      )}
      {panels.has("analyticsDashboard") && selectedWorktreePath && (
        <PanelBoundary name="AnalyticsDashboard">
          <AnalyticsDashboard
            cwd={selectedWorktreePath}
            onClose={() => closePanel("analyticsDashboard")}
          />
        </PanelBoundary>
      )}
      <PanelBoundary name="AiChat">
        <AiChatSidebar
          open={panels.has("aiChat")}
          onClose={() => closePanel("aiChat")}
        />
      </PanelBoundary>
      <PanelBoundary name="UnifiedSearch">
        <UnifiedSearch
          open={panels.has("unifiedSearch")}
          onClose={() => closePanel("unifiedSearch")}
          onNavigate={(type: string, _data: string) => {
            closePanel("unifiedSearch");
            if (type === "bookmark") openPanel("bookmarks");
            else if (type === "setting") openPanel("settingsPage");
          }}
        />
      </PanelBoundary>
      {panels.has("settingsPage") && (
        <PanelBoundary name="SettingsPage">
          <SettingsPage onClose={() => closePanel("settingsPage")} />
        </PanelBoundary>
      )}
      {panels.has("terminalRecording") && selectedWorktreeId !== null && (
        <PanelBoundary name="TerminalRecording">
          <TerminalRecording
            worktreeId={selectedWorktreeId}
            onClose={() => closePanel("terminalRecording")}
          />
        </PanelBoundary>
      )}
      {panels.has("doraMetrics") && selectedProjectId !== null && (
        <PanelBoundary name="DoraMetrics">
          <DoraMetrics
            projectId={selectedProjectId}
            onClose={() => closePanel("doraMetrics")}
          />
        </PanelBoundary>
      )}
      {panels.has("webhookEvents") && (
        <PanelBoundary name="WebhookEvents">
          <WebhookEvents onClose={() => closePanel("webhookEvents")} />
        </PanelBoundary>
      )}
      {panels.has("sshManager") && (
        <PanelBoundary name="SshManager">
          <SshManager
            onClose={() => closePanel("sshManager")}
            onConnect={() => closePanel("sshManager")}
          />
        </PanelBoundary>
      )}
      {panels.has("gitAnalytics") && selectedWorktreeId !== null && (
        <PanelBoundary name="GitAnalytics">
          <GitAnalytics
            worktreeId={selectedWorktreeId}
            onClose={() => closePanel("gitAnalytics")}
          />
        </PanelBoundary>
      )}
      {panels.has("snippetManager") && (
        <PanelBoundary name="SnippetManager">
          <SnippetManager
            projectId={selectedProjectId}
            onClose={() => closePanel("snippetManager")}
          />
        </PanelBoundary>
      )}
      {panels.has("envDiff") && selectedProjectId !== null && (
        <PanelBoundary name="EnvProfileDiff">
          <EnvProfileDiff
            projectId={selectedProjectId}
            onClose={() => closePanel("envDiff")}
          />
        </PanelBoundary>
      )}
      {panels.has("appPerformance") && (
        <PanelBoundary name="AppPerformance">
          <AppPerformance onClose={() => closePanel("appPerformance")} />
        </PanelBoundary>
      )}
      {panels.has("fileExplorer") && selectedWorktreePath && (
        <PanelBoundary name="FileExplorer">
          <FileExplorer
            cwd={selectedWorktreePath}
            onClose={() => closePanel("fileExplorer")}
            onFileSelect={(path: string) => {
              closePanel("fileExplorer");
              setBlameFilePath(path);
              openPanel("blameView");
            }}
          />
        </PanelBoundary>
      )}
      {panels.has("projectOverview") && selectedProjectId !== null && (
        <PanelBoundary name="ProjectOverview">
          <ProjectOverview
            projectId={selectedProjectId}
            onClose={() => closePanel("projectOverview")}
          />
        </PanelBoundary>
      )}
      {panels.has("webVitals") && (
        <PanelBoundary name="WebVitals">
          <WebVitals onClose={() => closePanel("webVitals")} />
        </PanelBoundary>
      )}
      {panels.has("pluginRuntime") && selectedWorktreePath && (
        <PanelBoundary name="PluginRuntime">
          <PluginRuntime
            cwd={selectedWorktreePath}
            onClose={() => closePanel("pluginRuntime")}
          />
        </PanelBoundary>
      )}
      {panels.has("depAnalyzer") && selectedWorktreePath && (
        <PanelBoundary name="DependencyAnalyzer">
          <DependencyAnalyzer
            cwd={selectedWorktreePath}
            onClose={() => closePanel("depAnalyzer")}
          />
        </PanelBoundary>
      )}
      {panels.has("tagManager") && selectedWorktreeId !== null && (
        <PanelBoundary name="TagManager">
          <TagManager
            worktreeId={selectedWorktreeId}
            onClose={() => closePanel("tagManager")}
          />
        </PanelBoundary>
      )}
      {panels.has("gitLog") && selectedWorktreeId !== null && (
        <PanelBoundary name="GitLogViewer">
          <GitLogViewer
            worktreeId={selectedWorktreeId}
            onClose={() => closePanel("gitLog")}
          />
        </PanelBoundary>
      )}
      {panels.has("workspaceManager") && (
        <PanelBoundary name="WorkspaceManager">
          <WorkspaceManager
            onClose={() => closePanel("workspaceManager")}
            onLoad={() => closePanel("workspaceManager")}
          />
        </PanelBoundary>
      )}
      {panels.has("taskScheduler") && (
        <PanelBoundary name="TaskScheduler">
          <TaskScheduler onClose={() => closePanel("taskScheduler")} />
        </PanelBoundary>
      )}
      {panels.has("clipboardHistory") && (
        <PanelBoundary name="ClipboardHistory">
          <ClipboardHistory onClose={() => closePanel("clipboardHistory")} />
        </PanelBoundary>
      )}
      {panels.has("todoPanel") && (
        <PanelBoundary name="TodoPanel">
          <TodoPanel
            projectId={selectedProjectId}
            onClose={() => closePanel("todoPanel")}
          />
        </PanelBoundary>
      )}
      {panels.has("morningBriefing") && selectedProjectId && (
        <PanelBoundary name="MorningBriefing">
          <FocusTrapOverlay onClick={() => closePanel("morningBriefing")}>
            <div className="panel-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="panel-dialog-header">
                <span>Morning Briefing</span>
                <button
                  className="panel-dialog-close"
                  onClick={() => closePanel("morningBriefing")}
                >
                  &times;
                </button>
              </div>
              <MorningBriefing projectId={selectedProjectId} />
            </div>
          </FocusTrapOverlay>
        </PanelBoundary>
      )}
      {panels.has("onboarding") && (
        <PanelBoundary name="Onboarding">
          <FocusTrapOverlay onClick={() => closePanel("onboarding")}>
            <div
              className="panel-dialog panel-dialog--wide"
              onClick={(e) => e.stopPropagation()}
            >
              <OnboardingWizard
                onComplete={() => {
                  localStorage.setItem("workroot:onboarded", "true");
                  closePanel("onboarding");
                }}
                onClose={() => closePanel("onboarding")}
              />
            </div>
          </FocusTrapOverlay>
        </PanelBoundary>
      )}
      {panels.has("prStatus") && selectedWorktreeId && (
        <PanelBoundary name="PRStatus">
          <FocusTrapOverlay onClick={() => closePanel("prStatus")}>
            <div
              className="panel-dialog panel-dialog--wide"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="panel-dialog-header">
                <span>PR Status</span>
                <button
                  className="panel-dialog-close"
                  onClick={() => closePanel("prStatus")}
                >
                  &times;
                </button>
              </div>
              <PRStatusPanel worktreeId={selectedWorktreeId} />
            </div>
          </FocusTrapOverlay>
        </PanelBoundary>
      )}
      {panels.has("gitDiff") && selectedWorktreeId && (
        <PanelBoundary name="GitDiff">
          <FocusTrapOverlay
            onClick={() => {
              closePanel("gitDiff");
              setContentTab("terminal");
            }}
          >
            <div
              className="panel-dialog panel-dialog--wide"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="panel-dialog-header">
                <span>Git Changes</span>
                <button
                  className="panel-dialog-close"
                  onClick={() => {
                    closePanel("gitDiff");
                    setContentTab("terminal");
                  }}
                >
                  &times;
                </button>
              </div>
              <GitDiffView
                worktreeId={selectedWorktreeId}
                onCreatePR={() => {
                  closePanel("gitDiff");
                  openPanel("createPr");
                  setContentTab("pr");
                }}
              />
            </div>
          </FocusTrapOverlay>
        </PanelBoundary>
      )}
      {panels.has("createPr") && selectedWorktreeId && selectedWorktreeName && (
        <PanelBoundary name="CreatePR">
          <FocusTrapOverlay
            onClick={() => {
              closePanel("createPr");
              setContentTab("terminal");
            }}
          >
            <div className="panel-dialog" onClick={(e) => e.stopPropagation()}>
              <CreatePRPanel
                worktreeId={selectedWorktreeId}
                branch={selectedWorktreeName}
                onClose={() => {
                  closePanel("createPr");
                  setContentTab("terminal");
                }}
              />
            </div>
          </FocusTrapOverlay>
        </PanelBoundary>
      )}
      {panels.has("memoryTab") && selectedWorktreeId && (
        <PanelBoundary name="MemoryTab">
          <FocusTrapOverlay onClick={() => closePanel("memoryTab")}>
            <div
              className="panel-dialog panel-dialog--wide"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="panel-dialog-header">
                <span>Memory Notes</span>
                <button
                  className="panel-dialog-close"
                  onClick={() => closePanel("memoryTab")}
                >
                  &times;
                </button>
              </div>
              <MemoryTab worktreeId={selectedWorktreeId} />
            </div>
          </FocusTrapOverlay>
        </PanelBoundary>
      )}
      {panels.has("shellHistory") && selectedProjectId && (
        <PanelBoundary name="ShellHistory">
          <FocusTrapOverlay onClick={() => closePanel("shellHistory")}>
            <div
              className="panel-dialog panel-dialog--wide"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="panel-dialog-header">
                <span>Shell History</span>
                <button
                  className="panel-dialog-close"
                  onClick={() => closePanel("shellHistory")}
                >
                  &times;
                </button>
              </div>
              <ShellHistoryTab
                projectId={selectedProjectId}
                branch={selectedWorktreeName ?? ""}
              />
            </div>
          </FocusTrapOverlay>
        </PanelBoundary>
      )}
      {panels.has("deadEnds") && selectedWorktreeId && (
        <PanelBoundary name="DeadEnds">
          <FocusTrapOverlay onClick={() => closePanel("deadEnds")}>
            <div className="panel-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="panel-dialog-header">
                <span>Dead Ends Log</span>
                <button
                  className="panel-dialog-close"
                  onClick={() => closePanel("deadEnds")}
                >
                  &times;
                </button>
              </div>
              <DeadEndsLog worktreeId={selectedWorktreeId} />
            </div>
          </FocusTrapOverlay>
        </PanelBoundary>
      )}
      {panels.has("browserEvents") && selectedWorktreeId && (
        <PanelBoundary name="BrowserEvents">
          <FocusTrapOverlay onClick={() => closePanel("browserEvents")}>
            <div
              className="panel-dialog panel-dialog--wide"
              onClick={(e) => e.stopPropagation()}
            >
              <BrowserEvents
                worktreeId={selectedWorktreeId}
                onClose={() => closePanel("browserEvents")}
              />
            </div>
          </FocusTrapOverlay>
        </PanelBoundary>
      )}
      <PanelBoundary name="QuickSwitcher">
        <QuickSwitcher
          open={panels.has("quickSwitcher")}
          onClose={() => closePanel("quickSwitcher")}
          selectedProjectId={selectedProjectId}
          onSwitchProject={(id: number) => {
            onSwitchProject(id);
            closePanel("quickSwitcher");
          }}
          onSwitchBranch={() => {
            closePanel("quickSwitcher");
          }}
          onOpenFile={(path: string) => {
            setBlameFilePath(path);
            openPanel("blameView");
            closePanel("quickSwitcher");
          }}
        />
      </PanelBoundary>
      <PanelBoundary name="ErrorDiagnosis">
        <ErrorDiagnosis
          open={panels.has("errorDiagnosis")}
          onClose={() => closePanel("errorDiagnosis")}
        />
      </PanelBoundary>
    </>
  );
}
