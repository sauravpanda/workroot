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
  onClose: () => void;
}

type Tab = "agents" | "pipelines" | "run";

// ─── Component ───────────────────────────────────────────────────────────────

export function MultiAgentPipelinePanel({ worktreeId, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("agents");

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

  // Load agents
  const loadAgents = useCallback(async () => {
    try {
      const result = await invoke<AgentDef[]>("list_agents");
      setAgents(result);
    } catch {
      // ignore
    }
  }, []);

  // Load pipelines
  const loadPipelines = useCallback(async () => {
    try {
      const result = await invoke<PipelineDef[]>("list_pipelines");
      setPipelines(result);
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

  // Cleanup progress listener on unmount
  useEffect(() => {
    return () => {
      unlistenRef.current?.();
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
          {(["agents", "pipelines", "run"] as Tab[]).map((t) => (
            <button
              key={t}
              className={`map-tab ${tab === t ? "map-tab--active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="map-body">
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
