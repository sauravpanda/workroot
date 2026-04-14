import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import "../styles/multi-agent-pipeline.css";

// ─── CLI Tool Presets ───────────────────────────────────────────────────────

interface CliPreset {
  label: string;
  role: "generator" | "reviewer";
  command: string;
}

const GENERATOR_PRESETS: CliPreset[] = [
  { label: "Claude Code", role: "generator", command: "claude --print" },
  { label: "Aider", role: "generator", command: "aider --message" },
  { label: "Codex", role: "generator", command: "codex --quiet" },
  {
    label: "Test Writer",
    role: "generator",
    command: 'claude --print "Write tests for the following code"',
  },
  {
    label: "PR Description",
    role: "generator",
    command:
      'claude --print "Write a pull request description for the current changes"',
  },
  { label: "Custom", role: "generator", command: "" },
];

const REVIEWER_PRESETS: CliPreset[] = [
  {
    label: "Claude Code",
    role: "reviewer",
    command:
      'claude --print "Review the changes and respond with APPROVED or request fixes"',
  },
  {
    label: "Aider",
    role: "reviewer",
    command: 'aider --message "Review the following changes"',
  },
  {
    label: "Lint Checker",
    role: "reviewer",
    command:
      'claude --print "Check for lint issues, type errors, and style problems. Respond APPROVED if clean"',
  },
  {
    label: "Security Review",
    role: "reviewer",
    command:
      'claude --print "Review for security vulnerabilities (XSS, injection, secrets). Respond APPROVED if safe"',
  },
  { label: "Custom", role: "reviewer", command: "" },
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentDef {
  id: number;
  name: string;
  role: "generator" | "reviewer";
  command: string;
  created_at: string;
}

interface PipelineDef {
  id: number;
  name: string;
  generator_id: number;
  reviewer_id: number;
  max_iterations: number;
  created_at: string;
}

interface StepOutput {
  iteration: number;
  role: string;
  stdout: string;
  stderr: string;
  exit_code: number;
}

interface PipelineRun {
  id: number;
  pipeline_id: number;
  worktree_id: number;
  task_desc: string;
  status: "running" | "approved" | "failed" | "max_iterations";
  iterations: number;
  output: StepOutput[];
  started_at: string;
  finished_at: string | null;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  worktreeId: number;
  allWorktreeIds?: number[];
  onClose: () => void;
}

type Tab = "agents" | "pipelines" | "run" | "quick";

// ─── Pipeline Templates ────────────────────────────────────────────────────

interface PipelineTemplate {
  label: string;
  description: string;
  generator: { name: string; command: string };
  reviewer: { name: string; command: string };
  maxIterations: number;
}

const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    label: "Claude Code",
    description: "Claude generates code, Claude reviews changes",
    generator: { name: "Claude generator", command: "claude --print" },
    reviewer: {
      name: "Claude reviewer",
      command:
        'claude --print "Review the changes and respond with APPROVED or request fixes"',
    },
    maxIterations: 3,
  },
  {
    label: "Aider",
    description: "Aider generates code, Aider reviews changes",
    generator: { name: "Aider generator", command: "aider --message" },
    reviewer: {
      name: "Aider reviewer",
      command: 'aider --message "Review the following changes"',
    },
    maxIterations: 3,
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function MultiAgentPipelinePanel({
  worktreeId,
  allWorktreeIds,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>("quick");

  // Agents state
  const [agents, setAgents] = useState<AgentDef[]>([]);
  const [agentName, setAgentName] = useState("");
  const [agentRole, setAgentRole] = useState<"generator" | "reviewer">(
    "generator",
  );
  const [agentCommand, setAgentCommand] = useState("");
  const [agentError, setAgentError] = useState("");

  // Pipelines state
  const [pipelines, setPipelines] = useState<PipelineDef[]>([]);
  const [pipelineName, setPipelineName] = useState("");
  const [generatorId, setGeneratorId] = useState<number | "">("");
  const [reviewerId, setReviewerId] = useState<number | "">("");
  const [maxIterations, setMaxIterations] = useState(3);
  const [pipelineError, setPipelineError] = useState("");

  // Run state
  const [selectedPipelineId, setSelectedPipelineId] = useState<number | "">("");
  const [taskDesc, setTaskDesc] = useState("");
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [activeRun, setActiveRun] = useState<PipelineRun | null>(null);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const [progress, setProgress] = useState("");
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // Pipeline run history for sparkline display
  const [pipelineHistory, setPipelineHistory] = useState<
    Record<number, PipelineRun[]>
  >({});

  // Load agents
  const loadAgents = useCallback(async () => {
    try {
      const result = await invoke<AgentDef[]>("list_agents");
      setAgents(result);
    } catch {
      // ignore
    }
  }, []);

  // Load pipelines + their recent run history
  const loadPipelines = useCallback(async () => {
    try {
      const result = await invoke<PipelineDef[]>("list_pipelines");
      setPipelines(result);
      // Load last 5 runs per pipeline for sparkline
      const history: Record<number, PipelineRun[]> = {};
      for (const p of result) {
        try {
          const r = await invoke<PipelineRun[]>("list_pipeline_runs", {
            pipelineId: p.id,
          });
          history[p.id] = r.slice(0, 5);
        } catch {
          history[p.id] = [];
        }
      }
      setPipelineHistory(history);
    } catch {
      // ignore
    }
  }, []);

  // Load runs for selected pipeline
  const loadRuns = useCallback(async (pipelineId: number) => {
    try {
      const result = await invoke<PipelineRun[]>("list_pipeline_runs", {
        pipelineId,
      });
      setRuns(result);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadAgents();
    void loadPipelines();
  }, [loadAgents, loadPipelines]);

  useEffect(() => {
    if (typeof selectedPipelineId === "number") {
      void loadRuns(selectedPipelineId);
    } else {
      setRuns([]);
    }
  }, [selectedPipelineId, loadRuns]);

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      unlistenRef.current?.();
      for (const fn of quickUnlistenRef.current) fn();
    };
  }, []);

  // ─── Agent handlers ──────────────────────────────────────────────────────

  async function handleCreateAgent() {
    setAgentError("");
    if (!agentName.trim() || !agentCommand.trim()) {
      setAgentError("Name and command are required.");
      return;
    }
    try {
      await invoke("create_agent", {
        name: agentName.trim(),
        role: agentRole,
        command: agentCommand.trim(),
      });
      setAgentName("");
      setAgentCommand("");
      void loadAgents();
    } catch (e) {
      setAgentError(String(e));
    }
  }

  async function handleDeleteAgent(id: number) {
    try {
      await invoke("delete_agent", { id });
      void loadAgents();
    } catch {
      // ignore
    }
  }

  // ─── Pipeline handlers ───────────────────────────────────────────────────

  async function handleCreatePipeline() {
    setPipelineError("");
    if (!pipelineName.trim() || generatorId === "" || reviewerId === "") {
      setPipelineError("Name, generator and reviewer are required.");
      return;
    }
    try {
      await invoke("create_pipeline", {
        name: pipelineName.trim(),
        generatorId: Number(generatorId),
        reviewerId: Number(reviewerId),
        maxIterations,
      });
      setPipelineName("");
      setGeneratorId("");
      setReviewerId("");
      setMaxIterations(3);
      void loadPipelines();
    } catch (e) {
      setPipelineError(String(e));
    }
  }

  async function handleDeletePipeline(id: number) {
    try {
      await invoke("delete_pipeline", { id });
      if (selectedPipelineId === id) setSelectedPipelineId("");
      void loadPipelines();
    } catch {
      // ignore
    }
  }

  // ─── Pipeline config export/import ────────────────────────────────────────

  async function handleExportConfig() {
    const config = {
      agents: agents.map(({ name, role, command }) => ({
        name,
        role,
        command,
      })),
      pipelines: pipelines.map((p) => ({
        name: p.name,
        generator: agentName_(p.generator_id),
        reviewer: agentName_(p.reviewer_id),
        max_iterations: p.max_iterations,
      })),
    };
    try {
      const path = await save({
        defaultPath: "pipeline-config.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (path) {
        await invoke("save_text_file", {
          path,
          contents: JSON.stringify(config, null, 2),
        });
      }
    } catch {
      // cancelled
    }
  }

  async function handleImportConfig(file: File) {
    try {
      const text = await file.text();
      const config = JSON.parse(text) as {
        agents: { name: string; role: string; command: string }[];
        pipelines: {
          name: string;
          generator: string;
          reviewer: string;
          max_iterations: number;
        }[];
      };
      // Create agents
      for (const a of config.agents) {
        await invoke("create_agent", {
          name: a.name,
          role: a.role,
          command: a.command,
        });
      }
      await loadAgents();
      const updatedAgents = await invoke<AgentDef[]>("list_agents");
      // Create pipelines
      for (const p of config.pipelines) {
        const gen = updatedAgents.find(
          (a) => a.name === p.generator && a.role === "generator",
        );
        const rev = updatedAgents.find(
          (a) => a.name === p.reviewer && a.role === "reviewer",
        );
        if (gen && rev) {
          await invoke("create_pipeline", {
            name: p.name,
            generatorId: gen.id,
            reviewerId: rev.id,
            maxIterations: p.max_iterations,
          });
        }
      }
      await loadPipelines();
    } catch {
      // ignore parse errors
    }
  }

  // ─── Template handler ─────────────────────────────────────────────────────

  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateError, setTemplateError] = useState("");

  async function handleApplyTemplate(tmpl: PipelineTemplate) {
    setTemplateBusy(true);
    setTemplateError("");
    try {
      await invoke("create_agent", {
        name: tmpl.generator.name,
        role: "generator",
        command: tmpl.generator.command,
      });
      await invoke("create_agent", {
        name: tmpl.reviewer.name,
        role: "reviewer",
        command: tmpl.reviewer.command,
      });
      await loadAgents();
      const updatedAgents = await invoke<AgentDef[]>("list_agents");
      const gen = updatedAgents.find(
        (a) => a.name === tmpl.generator.name && a.role === "generator",
      );
      const rev = updatedAgents.find(
        (a) => a.name === tmpl.reviewer.name && a.role === "reviewer",
      );
      if (gen && rev) {
        await invoke("create_pipeline", {
          name: `${tmpl.label} pipeline`,
          generatorId: gen.id,
          reviewerId: rev.id,
          maxIterations: tmpl.maxIterations,
        });
        await loadPipelines();
      }
      setTab("run");
    } catch (e) {
      setTemplateError(String(e));
    } finally {
      setTemplateBusy(false);
    }
  }

  // ─── Quick Run handler (streaming) ────────────────────────────────────

  const [quickCommand, setQuickCommand] = useState("");
  const [quickTask, setQuickTask] = useState("");
  const [quickRunning, setQuickRunning] = useState(false);
  const [quickLines, setQuickLines] = useState<
    { stream: string; line: string }[]
  >([]);
  const [quickExitCode, setQuickExitCode] = useState<number | null>(null);
  const [quickError, setQuickError] = useState("");
  const quickUnlistenRef = useRef<UnlistenFn[]>([]);

  async function handleQuickRun() {
    setQuickError("");
    if (!quickCommand.trim() || !quickTask.trim()) {
      setQuickError("Command and task are required.");
      return;
    }
    setQuickRunning(true);
    setQuickLines([]);
    setQuickExitCode(null);

    // Clean up prior listeners
    for (const fn of quickUnlistenRef.current) fn();
    quickUnlistenRef.current = [];

    try {
      const runId = await invoke<number>("run_agent_task_streaming", {
        worktreeId,
        command: quickCommand.trim(),
        taskDesc: quickTask.trim(),
      });

      // Listen for output lines
      const unOutput = await listen<{
        run_id: number;
        stream: string;
        line: string;
      }>("agent:output", (event) => {
        if (event.payload.run_id !== runId) return;
        setQuickLines((prev) => [
          ...prev,
          { stream: event.payload.stream, line: event.payload.line },
        ]);
      });

      // Listen for completion
      const unDone = await listen<{
        run_id: number;
        exit_code: number;
      }>("agent:done", (event) => {
        if (event.payload.run_id !== runId) return;
        setQuickExitCode(event.payload.exit_code);
        setQuickRunning(false);
        // Notify if backgrounded
        if (
          !document.hasFocus() &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          new Notification("Quick Run completed", {
            body: `Exit code: ${event.payload.exit_code}`,
            silent: false,
          });
        }
      });

      quickUnlistenRef.current = [unOutput, unDone];
    } catch (e) {
      setQuickError(String(e));
      setQuickRunning(false);
    }
  }

  // ─── Bulk Run handler ────────────────────────────────────────────────────

  async function handleBulkRun() {
    if (!allWorktreeIds || !quickCommand.trim() || !quickTask.trim()) return;
    setQuickRunning(true);
    setQuickLines([]);
    setQuickExitCode(null);
    setQuickError("");

    try {
      const results = await Promise.all(
        allWorktreeIds.map((wtId) =>
          invoke<{
            command: string;
            label: string;
            stdout: string;
            stderr: string;
            exit_code: number;
          }>("run_agent_task", {
            worktreeId: wtId,
            command: quickCommand.trim(),
            label: `Bulk run (wt ${wtId})`,
            taskDesc: quickTask.trim(),
          }).catch((e) => ({
            command: quickCommand,
            label: `wt ${wtId}`,
            stdout: "",
            stderr: String(e),
            exit_code: -1,
          })),
        ),
      );
      const lines = results.flatMap((r) => [
        { stream: "stdout", line: `── ${r.label} (exit ${r.exit_code}) ──` },
        ...(r.stdout
          ? r.stdout
              .split("\n")
              .map((l: string) => ({ stream: "stdout", line: l }))
          : []),
        ...(r.stderr
          ? r.stderr
              .split("\n")
              .map((l: string) => ({ stream: "stderr", line: l }))
          : []),
      ]);
      setQuickLines(lines);
      const allPassed = results.every((r) => r.exit_code === 0);
      setQuickExitCode(allPassed ? 0 : 1);
    } catch (e) {
      setQuickError(String(e));
    } finally {
      setQuickRunning(false);
    }
  }

  // ─── Run handlers ────────────────────────────────────────────────────────

  async function handleRun() {
    setRunError("");
    if (selectedPipelineId === "" || !taskDesc.trim()) {
      setRunError("Select a pipeline and provide a task description.");
      return;
    }
    setRunning(true);
    setActiveRun(null);
    setExpandedStep(null);
    setProgress("Starting pipeline...");

    // Subscribe to progress events
    unlistenRef.current?.();
    unlistenRef.current = await listen<{
      run_id: number;
      iteration: number;
      max_iterations: number;
      phase: string;
      status: string;
    }>("pipeline:progress", (event) => {
      const { iteration, max_iterations, phase, status } = event.payload;
      const iter = `Iteration ${iteration + 1}/${max_iterations}`;
      if (status === "running") {
        setProgress(`${iter} — ${phase} running...`);
      } else if (status === "approved") {
        setProgress(`${iter} — reviewer approved`);
      } else if (status === "rejected") {
        setProgress(`${iter} — reviewer requested changes`);
      } else {
        setProgress(`${iter} — ${phase} ${status}`);
      }
    });

    try {
      const result = await invoke<PipelineRun>("run_pipeline", {
        pipelineId: Number(selectedPipelineId),
        worktreeId,
        taskDesc: taskDesc.trim(),
      });
      setActiveRun(result);
      void loadRuns(Number(selectedPipelineId));
      // Notify when pipeline finishes
      if (
        !document.hasFocus() &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        new Notification("Pipeline completed", {
          body: `Status: ${result.status} (${result.iterations} iteration${result.iterations !== 1 ? "s" : ""})`,
          silent: false,
        });
      }
    } catch (e) {
      setRunError(String(e));
    } finally {
      setRunning(false);
      setProgress("");
      unlistenRef.current?.();
      unlistenRef.current = null;
    }
  }

  // ─── Export handler ───────────────────────────────────────────────────────

  async function handleExportRun(run: PipelineRun) {
    const lines: string[] = [
      `# Pipeline Run #${run.id}`,
      `Status: ${run.status}`,
      `Task: ${run.task_desc}`,
      `Iterations: ${run.iterations}`,
      `Started: ${run.started_at}`,
      `Finished: ${run.finished_at ?? "—"}`,
      "",
    ];
    for (const step of run.output) {
      lines.push(
        `## Iteration ${step.iteration + 1} — ${step.role} (exit ${step.exit_code})`,
      );
      if (step.stdout) {
        lines.push("### stdout", "```", step.stdout, "```", "");
      }
      if (step.stderr) {
        lines.push("### stderr", "```", step.stderr, "```", "");
      }
    }
    try {
      const path = await save({
        defaultPath: `pipeline-run-${run.id}.md`,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (path) {
        await invoke("save_text_file", { path, contents: lines.join("\n") });
      }
    } catch {
      // user cancelled or error — ignore
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function statusBadge(status: PipelineRun["status"]) {
    const cls = `map-badge map-badge--${status}`;
    const labels: Record<PipelineRun["status"], string> = {
      running: "Running",
      approved: "Approved",
      failed: "Failed",
      max_iterations: "Max iterations",
    };
    return <span className={cls}>{labels[status]}</span>;
  }

  function agentName_(id: number) {
    return agents.find((a) => a.id === id)?.name ?? `#${id}`;
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="map-overlay" onClick={onClose}>
      <div className="map-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="map-header">
          <span className="map-title">Multi-Agent Pipeline</span>
          <button className="map-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="map-tabs">
          {(["quick", "agents", "pipelines", "run"] as Tab[]).map((t) => (
            <button
              key={t}
              className={`map-tab ${tab === t ? "map-tab--active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "quick"
                ? "Quick Run"
                : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="map-body">
          {/* ── Quick Run tab ────────────────────────────────────────────── */}
          {tab === "quick" && (
            <div className="map-section">
              <div className="map-info">
                Run a single agent command on the current worktree without
                setting up a full pipeline. Great for one-off tasks.
              </div>

              <h3 className="map-section-title">Quick Run</h3>
              <div className="map-form">
                <select
                  className="map-select"
                  value={quickCommand}
                  onChange={(e) => setQuickCommand(e.target.value)}
                >
                  <option value="">-- Select a tool --</option>
                  {GENERATOR_PRESETS.filter((p) => p.command).map((p) => (
                    <option key={p.label} value={p.command}>
                      {p.label}
                    </option>
                  ))}
                  <option value="__custom">Custom command...</option>
                </select>
                {quickCommand === "__custom" && (
                  <input
                    className="map-input map-input--wide"
                    placeholder="Custom command"
                    value=""
                    onChange={(e) => setQuickCommand(e.target.value)}
                  />
                )}
                <textarea
                  className="map-textarea"
                  placeholder="Describe the task..."
                  rows={3}
                  value={quickTask}
                  onChange={(e) => setQuickTask(e.target.value)}
                />
                {quickError && <p className="map-error">{quickError}</p>}
                <button
                  className="map-btn map-btn--primary"
                  onClick={() => void handleQuickRun()}
                  disabled={quickRunning}
                >
                  {quickRunning ? "Running..." : "Run"}
                </button>
                {allWorktreeIds && allWorktreeIds.length > 1 && (
                  <button
                    className="map-btn map-btn--export"
                    onClick={() => void handleBulkRun()}
                    disabled={quickRunning}
                    title={`Run on all ${allWorktreeIds.length} worktrees`}
                  >
                    Run All ({allWorktreeIds.length})
                  </button>
                )}
              </div>

              {(quickLines.length > 0 || quickExitCode !== null) && (
                <div className="map-run-result">
                  <div className="map-run-result-header">
                    <span>Quick Run</span>
                    {quickExitCode !== null ? (
                      <span
                        className={`map-badge map-badge--${quickExitCode === 0 ? "approved" : "failed"}`}
                      >
                        exit {quickExitCode}
                      </span>
                    ) : (
                      <span className="map-badge map-badge--running">
                        running
                      </span>
                    )}
                  </div>
                  <div className="map-step-body">
                    <pre className="map-pre map-pre--stream">
                      {quickLines.map((l, i) => (
                        <span
                          key={i}
                          className={
                            l.stream === "stderr" ? "map-line--err" : ""
                          }
                        >
                          {l.line}
                          {"\n"}
                        </span>
                      ))}
                      {quickRunning && <span className="map-cursor">_</span>}
                    </pre>
                  </div>
                </div>
              )}

              <h3 className="map-section-title">Pipeline Templates</h3>
              <div className="map-info">
                One-click setup: creates agents and a pipeline automatically.
              </div>
              <div className="map-templates">
                {PIPELINE_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.label}
                    type="button"
                    className="map-template"
                    onClick={() => void handleApplyTemplate(tmpl)}
                    disabled={templateBusy}
                  >
                    <span className="map-template-label">{tmpl.label}</span>
                    <span className="map-template-desc">
                      {tmpl.description}
                    </span>
                  </button>
                ))}
              </div>
              {templateError && <p className="map-error">{templateError}</p>}
            </div>
          )}

          {/* ── Agents tab ────────────────────────────────────────────────── */}
          {tab === "agents" && (
            <div className="map-section">
              <div className="map-info">
                An agent is any CLI tool that can receive a task and produce
                output. Pick a preset below or enter a custom command. Create at
                least one <strong>generator</strong> (writes code) and one{" "}
                <strong>reviewer</strong> (approves or requests changes), then
                wire them together on the Pipelines tab.
              </div>

              <h3 className="map-section-title">Generator Presets</h3>
              <div className="map-presets">
                {GENERATOR_PRESETS.map((p) => (
                  <button
                    key={p.label + p.role}
                    type="button"
                    className={
                      "map-preset" +
                      (agentCommand === p.command &&
                      agentRole === "generator" &&
                      p.command
                        ? " map-preset--active"
                        : "")
                    }
                    onClick={() => {
                      setAgentCommand(p.command);
                      setAgentRole("generator");
                      if (!agentName && p.command)
                        setAgentName(p.label + " generator");
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <h3 className="map-section-title">Reviewer Presets</h3>
              <div className="map-presets">
                {REVIEWER_PRESETS.map((p) => (
                  <button
                    key={p.label + p.role}
                    type="button"
                    className={
                      "map-preset" +
                      (agentCommand === p.command &&
                      agentRole === "reviewer" &&
                      p.command
                        ? " map-preset--active"
                        : "")
                    }
                    onClick={() => {
                      setAgentCommand(p.command);
                      setAgentRole("reviewer");
                      if (!agentName && p.command)
                        setAgentName(p.label + " reviewer");
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <h3 className="map-section-title">Create Agent</h3>
              <div className="map-form">
                <input
                  className="map-input"
                  placeholder="Name"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                />
                <select
                  className="map-select"
                  value={agentRole}
                  onChange={(e) =>
                    setAgentRole(e.target.value as "generator" | "reviewer")
                  }
                >
                  <option value="generator">Generator</option>
                  <option value="reviewer">Reviewer</option>
                </select>
                <input
                  className="map-input map-input--wide"
                  placeholder="Command (e.g. claude --print)"
                  value={agentCommand}
                  onChange={(e) => setAgentCommand(e.target.value)}
                />
                {agentError && <p className="map-error">{agentError}</p>}
                <button
                  className="map-btn map-btn--primary"
                  onClick={() => void handleCreateAgent()}
                >
                  Add Agent
                </button>
              </div>

              <h3 className="map-section-title">Agents</h3>
              {agents.length === 0 ? (
                <p className="map-empty">No agents defined yet.</p>
              ) : (
                <table className="map-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Command</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((a) => (
                      <tr key={a.id}>
                        <td>{a.name}</td>
                        <td>
                          <span className={`map-badge map-badge--${a.role}`}>
                            {a.role}
                          </span>
                        </td>
                        <td className="map-mono">{a.command}</td>
                        <td>
                          <button
                            className="map-btn map-btn--danger"
                            onClick={() => void handleDeleteAgent(a.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Pipelines tab ─────────────────────────────────────────────── */}
          {tab === "pipelines" && (
            <div className="map-section">
              <div className="map-info">
                A pipeline pairs a generator with a reviewer and loops until the
                reviewer approves or max iterations is reached. The generator
                runs in the worktree and can edit files. The reviewer receives
                the task, generator output, and git diff via stdin.
              </div>
              <div className="map-config-actions">
                <button
                  className="map-btn map-btn--export"
                  onClick={() => void handleExportConfig()}
                  disabled={agents.length === 0 && pipelines.length === 0}
                >
                  Export Config
                </button>
                <label className="map-btn map-btn--export map-import-label">
                  Import Config
                  <input
                    type="file"
                    accept=".json"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleImportConfig(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              <h3 className="map-section-title">Create Pipeline</h3>
              <div className="map-form">
                <input
                  className="map-input"
                  placeholder="Pipeline name"
                  value={pipelineName}
                  onChange={(e) => setPipelineName(e.target.value)}
                />
                <select
                  className="map-select"
                  value={generatorId}
                  onChange={(e) =>
                    setGeneratorId(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                >
                  <option value="">-- Generator agent --</option>
                  {agents
                    .filter((a) => a.role === "generator")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
                <select
                  className="map-select"
                  value={reviewerId}
                  onChange={(e) =>
                    setReviewerId(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                >
                  <option value="">-- Reviewer agent --</option>
                  {agents
                    .filter((a) => a.role === "reviewer")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
                <label className="map-label">
                  Max iterations
                  <input
                    className="map-input map-input--sm"
                    type="number"
                    min={1}
                    max={10}
                    value={maxIterations}
                    onChange={(e) =>
                      setMaxIterations(Math.max(1, Number(e.target.value)))
                    }
                  />
                </label>
                {pipelineError && <p className="map-error">{pipelineError}</p>}
                <button
                  className="map-btn map-btn--primary"
                  onClick={() => void handleCreatePipeline()}
                >
                  Add Pipeline
                </button>
              </div>

              <h3 className="map-section-title">Pipelines</h3>
              {pipelines.length === 0 ? (
                <p className="map-empty">No pipelines defined yet.</p>
              ) : (
                <table className="map-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Generator</th>
                      <th>Reviewer</th>
                      <th>Max iters</th>
                      <th>History</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pipelines.map((p) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>{agentName_(p.generator_id)}</td>
                        <td>{agentName_(p.reviewer_id)}</td>
                        <td>{p.max_iterations}</td>
                        <td>
                          <div className="map-sparkline">
                            {(pipelineHistory[p.id] ?? []).map((r) => (
                              <span
                                key={r.id}
                                className={`map-spark-dot map-spark-dot--${r.status}`}
                                title={`#${r.id}: ${r.status}`}
                              />
                            ))}
                            {!pipelineHistory[p.id]?.length && (
                              <span className="map-muted">—</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <button
                            className="map-btn map-btn--danger"
                            onClick={() => void handleDeletePipeline(p.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Run tab ───────────────────────────────────────────────────── */}
          {tab === "run" && (
            <div className="map-section">
              <div className="map-info">
                Select a pipeline, describe the task, and hit Run. The generator
                will execute in the current worktree. You can export any
                run&apos;s full log to a file using the save button.
              </div>
              <h3 className="map-section-title">Run Pipeline</h3>
              <div className="map-form">
                <select
                  className="map-select"
                  value={selectedPipelineId}
                  onChange={(e) =>
                    setSelectedPipelineId(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                >
                  <option value="">-- Select pipeline --</option>
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <textarea
                  className="map-textarea"
                  placeholder="Describe the task for the generator agent…"
                  rows={4}
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                />
                {runError && <p className="map-error">{runError}</p>}
                <button
                  className="map-btn map-btn--primary"
                  onClick={() => void handleRun()}
                  disabled={running}
                >
                  {running ? "Running…" : "Run"}
                </button>
              </div>

              {running && progress && (
                <div className="map-progress">{progress}</div>
              )}

              {/* Current run result */}
              {activeRun && (
                <div className="map-run-result">
                  <div className="map-run-result-header">
                    <span>Run #{activeRun.id}</span>
                    {statusBadge(activeRun.status)}
                    <span className="map-muted">
                      {activeRun.iterations} iteration
                      {activeRun.iterations !== 1 ? "s" : ""}
                    </span>
                    <button
                      className="map-btn map-btn--export"
                      onClick={() => void handleExportRun(activeRun)}
                      title="Export run log to file"
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M8 2v8M4 7l4 4 4-4M2 13h12" />
                      </svg>
                      Save
                    </button>
                  </div>
                  <div className="map-steps">
                    {activeRun.output.map((step, idx) => (
                      <div key={idx} className="map-step">
                        <button
                          className="map-step-header"
                          onClick={() =>
                            setExpandedStep(expandedStep === idx ? null : idx)
                          }
                        >
                          <span className={`map-badge map-badge--${step.role}`}>
                            {step.role}
                          </span>
                          <span>Iteration {step.iteration + 1}</span>
                          <span className="map-muted">
                            exit {step.exit_code}
                          </span>
                          <span className="map-chevron">
                            {expandedStep === idx ? "▲" : "▼"}
                          </span>
                        </button>
                        {expandedStep === idx && (
                          <div className="map-step-body">
                            {step.stdout && (
                              <>
                                <p className="map-step-label">stdout</p>
                                <pre className="map-pre">{step.stdout}</pre>
                              </>
                            )}
                            {step.stderr && (
                              <>
                                <p className="map-step-label map-step-label--err">
                                  stderr
                                </p>
                                <pre className="map-pre map-pre--err">
                                  {step.stderr}
                                </pre>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* History */}
              {runs.length > 0 && (
                <>
                  <h3 className="map-section-title">History</h3>
                  <table className="map-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Status</th>
                        <th>Iters</th>
                        <th>Task</th>
                        <th>Started</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((r) => (
                        <tr
                          key={r.id}
                          className={
                            activeRun?.id === r.id ? "map-row--active" : ""
                          }
                          onClick={() => {
                            setActiveRun(r);
                            setExpandedStep(null);
                          }}
                          style={{ cursor: "pointer" }}
                        >
                          <td>#{r.id}</td>
                          <td>{statusBadge(r.status)}</td>
                          <td>{r.iterations}</td>
                          <td className="map-task-preview">
                            {r.task_desc.slice(0, 60)}
                            {r.task_desc.length > 60 ? "…" : ""}
                          </td>
                          <td className="map-muted">
                            {r.started_at.slice(0, 16).replace("T", " ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
