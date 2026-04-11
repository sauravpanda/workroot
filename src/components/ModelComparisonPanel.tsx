import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/model-comparison.css";

interface AgentTaskResult {
  command: string;
  label: string;
  stdout: string;
  stderr: string;
  exit_code: number;
}

interface Props {
  worktreeId: number;
  onClose: () => void;
}

export function ModelComparisonPanel({ worktreeId, onClose }: Props) {
  const [taskDesc, setTaskDesc] = useState("");
  const [labelA, setLabelA] = useState("Agent A");
  const [commandA, setCommandA] = useState("");
  const [labelB, setLabelB] = useState("Agent B");
  const [commandB, setCommandB] = useState("");
  const [resultA, setResultA] = useState<AgentTaskResult | null>(null);
  const [resultB, setResultB] = useState<AgentTaskResult | null>(null);
  const [runningA, setRunningA] = useState(false);
  const [runningB, setRunningB] = useState(false);
  const [error, setError] = useState("");

  const runComparison = useCallback(async () => {
    if (!taskDesc.trim() || !commandA.trim() || !commandB.trim()) {
      setError("Please fill in the task description and both commands.");
      return;
    }
    setError("");
    setResultA(null);
    setResultB(null);
    setRunningA(true);
    setRunningB(true);

    // Run both agents concurrently
    const [resA, resB] = await Promise.allSettled([
      invoke<AgentTaskResult>("run_agent_task", {
        worktreeId,
        command: commandA,
        label: labelA || "Agent A",
        taskDesc,
      }),
      invoke<AgentTaskResult>("run_agent_task", {
        worktreeId,
        command: commandB,
        label: labelB || "Agent B",
        taskDesc,
      }),
    ]);

    setRunningA(false);
    setRunningB(false);

    if (resA.status === "fulfilled") {
      setResultA(resA.value);
    } else {
      setResultA({
        command: commandA,
        label: labelA || "Agent A",
        stdout: "",
        stderr: String(resA.reason),
        exit_code: -1,
      });
    }

    if (resB.status === "fulfilled") {
      setResultB(resB.value);
    } else {
      setResultB({
        command: commandB,
        label: labelB || "Agent B",
        stdout: "",
        stderr: String(resB.reason),
        exit_code: -1,
      });
    }
  }, [worktreeId, taskDesc, commandA, commandB, labelA, labelB]);

  const hasResults = resultA !== null || resultB !== null;

  return (
    <div className="mc-panel">
      <div className="mc-header">
        <div className="mc-header-left">
          <span className="mc-title">Model Comparison</span>
          <span className="mc-subtitle">
            Run the same task with two agents and compare outputs
          </span>
        </div>
        <button className="mc-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="mc-body">
        {/* Task description */}
        <div className="mc-section">
          <label className="mc-label" htmlFor="mc-task">
            Task Description
          </label>
          <textarea
            id="mc-task"
            className="mc-textarea"
            rows={3}
            placeholder="Describe the task to give both agents (passed as $TASK environment variable)"
            value={taskDesc}
            onChange={(e) => setTaskDesc(e.target.value)}
          />
        </div>

        {/* Agent config */}
        <div className="mc-agents-row">
          <div className="mc-agent-config">
            <div className="mc-agent-header">
              <input
                className="mc-agent-label"
                value={labelA}
                onChange={(e) => setLabelA(e.target.value)}
                placeholder="Agent A label"
              />
            </div>
            <input
              className="mc-agent-command"
              placeholder="CLI command (e.g. claude-code --print)"
              value={commandA}
              onChange={(e) => setCommandA(e.target.value)}
            />
          </div>
          <div className="mc-vs">vs</div>
          <div className="mc-agent-config">
            <div className="mc-agent-header">
              <input
                className="mc-agent-label"
                value={labelB}
                onChange={(e) => setLabelB(e.target.value)}
                placeholder="Agent B label"
              />
            </div>
            <input
              className="mc-agent-command"
              placeholder="CLI command (e.g. codex --quiet)"
              value={commandB}
              onChange={(e) => setCommandB(e.target.value)}
            />
          </div>
        </div>

        {error && <div className="mc-error">{error}</div>}

        <button
          className="mc-run-btn"
          onClick={runComparison}
          disabled={runningA || runningB}
        >
          {runningA || runningB ? "Running…" : "Run Comparison"}
        </button>

        {/* Results */}
        {(hasResults || runningA || runningB) && (
          <div className="mc-results-row">
            <div className="mc-result-col">
              <div className="mc-result-header">
                <span className="mc-result-label">{labelA || "Agent A"}</span>
                {resultA !== null && (
                  <span
                    className={
                      "mc-exit-badge" +
                      (resultA.exit_code === 0
                        ? " mc-exit-badge--ok"
                        : " mc-exit-badge--err")
                    }
                  >
                    exit {resultA.exit_code}
                  </span>
                )}
                {runningA && <span className="mc-running-badge">Running…</span>}
              </div>
              {resultA && (
                <div className="mc-output">
                  {resultA.stdout && (
                    <pre className="mc-stdout">{resultA.stdout}</pre>
                  )}
                  {resultA.stderr && (
                    <pre className="mc-stderr">{resultA.stderr}</pre>
                  )}
                  {!resultA.stdout && !resultA.stderr && (
                    <span className="mc-empty">(no output)</span>
                  )}
                </div>
              )}
            </div>
            <div className="mc-result-divider" />
            <div className="mc-result-col">
              <div className="mc-result-header">
                <span className="mc-result-label">{labelB || "Agent B"}</span>
                {resultB !== null && (
                  <span
                    className={
                      "mc-exit-badge" +
                      (resultB.exit_code === 0
                        ? " mc-exit-badge--ok"
                        : " mc-exit-badge--err")
                    }
                  >
                    exit {resultB.exit_code}
                  </span>
                )}
                {runningB && <span className="mc-running-badge">Running…</span>}
              </div>
              {resultB && (
                <div className="mc-output">
                  {resultB.stdout && (
                    <pre className="mc-stdout">{resultB.stdout}</pre>
                  )}
                  {resultB.stderr && (
                    <pre className="mc-stderr">{resultB.stderr}</pre>
                  )}
                  {!resultB.stdout && !resultB.stderr && (
                    <span className="mc-empty">(no output)</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
