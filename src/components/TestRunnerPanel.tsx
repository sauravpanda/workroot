import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/test-runner-panel.css";

interface TestFramework {
  name: string;
  command: string;
}

interface TestResult {
  name: string;
  status: "pass" | "fail" | "skip";
  duration_ms: number | null;
  error: string | null;
  children: TestResult[];
}

interface TestRunnerPanelProps {
  cwd: string;
  onClose: () => void;
}

function TestNode({ node, depth }: { node: TestResult; depth: number }) {
  const [expanded, setExpanded] = useState(
    node.status === "fail" || node.children.length > 0,
  );

  const statusClass =
    node.status === "pass"
      ? "testrun-status-pass"
      : node.status === "fail"
        ? "testrun-status-fail"
        : "testrun-status-skip";

  const statusChar =
    node.status === "pass"
      ? "\u2713"
      : node.status === "fail"
        ? "\u2717"
        : "\u2014";

  const hasDetails = node.error || node.children.length > 0;

  return (
    <div className="testrun-node" style={{ paddingLeft: `${depth * 16}px` }}>
      <button
        className={`testrun-node-row ${hasDetails ? "testrun-clickable" : ""}`}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <span className={`testrun-node-status ${statusClass}`}>
          {statusChar}
        </span>
        <span className="testrun-node-name">{node.name}</span>
        {node.duration_ms !== null && (
          <span className="testrun-node-time">{node.duration_ms}ms</span>
        )}
        {hasDetails && (
          <span className="testrun-node-toggle">
            {expanded ? "\u25BC" : "\u25B6"}
          </span>
        )}
      </button>
      {expanded && node.error && (
        <pre className="testrun-error">{node.error}</pre>
      )}
      {expanded &&
        node.children.map((child, i) => (
          <TestNode key={i} node={child} depth={depth + 1} />
        ))}
    </div>
  );
}

export function TestRunnerPanel({ cwd, onClose }: TestRunnerPanelProps) {
  const [frameworks, setFrameworks] = useState<TestFramework[]>([]);
  const [results, setResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState(false);
  const [selectedFramework, setSelectedFramework] = useState<string | null>(
    null,
  );

  const handleDetect = useCallback(async () => {
    setDetecting(true);
    try {
      const fws = await invoke<TestFramework[]>("detect_test_frameworks", {
        cwd,
      });
      setFrameworks(fws);
      if (fws.length > 0) setSelectedFramework(fws[0].name);
      setDetected(true);
    } catch {
      setFrameworks([]);
      setDetected(true);
    }
    setDetecting(false);
  }, [cwd]);

  const handleRun = useCallback(async () => {
    if (!selectedFramework) return;
    setLoading(true);
    try {
      const r = await invoke<TestResult[]>("run_tests", {
        cwd,
        framework: selectedFramework,
      });
      setResults(r);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, [cwd, selectedFramework]);

  const passCount = results.filter((r) => r.status === "pass").length;
  const failCount = results.filter((r) => r.status === "fail").length;
  const skipCount = results.filter((r) => r.status === "skip").length;

  return (
    <div className="testrun-backdrop" onClick={onClose}>
      <div className="testrun-panel" onClick={(e) => e.stopPropagation()}>
        <div className="testrun-header">
          <h3 className="testrun-title">Test Runner</h3>
          <button className="testrun-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="testrun-controls">
          {!detected ? (
            <button
              className="testrun-detect-btn"
              onClick={handleDetect}
              disabled={detecting}
            >
              {detecting ? "Detecting..." : "Detect Frameworks"}
            </button>
          ) : (
            <>
              <select
                className="testrun-select"
                value={selectedFramework ?? ""}
                onChange={(e) => setSelectedFramework(e.target.value)}
              >
                {frameworks.length === 0 ? (
                  <option value="">No frameworks found</option>
                ) : (
                  frameworks.map((fw) => (
                    <option key={fw.name} value={fw.name}>
                      {fw.name}
                    </option>
                  ))
                )}
              </select>
              <button
                className="testrun-run-btn"
                onClick={handleRun}
                disabled={loading || !selectedFramework}
              >
                {loading ? "Running..." : "Run Tests"}
              </button>
            </>
          )}
        </div>

        <div className="testrun-body">
          {results.length > 0 && (
            <div className="testrun-summary">
              <span className="testrun-badge testrun-badge-pass">
                {passCount} passed
              </span>
              <span className="testrun-badge testrun-badge-fail">
                {failCount} failed
              </span>
              <span className="testrun-badge testrun-badge-skip">
                {skipCount} skipped
              </span>
            </div>
          )}

          <div className="testrun-results">
            {loading ? (
              <div className="testrun-empty">Running tests...</div>
            ) : results.length === 0 ? (
              <div className="testrun-empty">
                {detected
                  ? "No test results yet. Click Run Tests."
                  : "Detect frameworks to get started."}
              </div>
            ) : (
              results.map((r, i) => <TestNode key={i} node={r} depth={0} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
