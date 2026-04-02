import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/error-diagnosis.css";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ErrorDiagnosisProps {
  open: boolean;
  onClose: () => void;
}

interface ModelInfo {
  name: string;
}

type ConnectionStatus = "connected" | "disconnected" | "checking";

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ErrorDiagnosis({ open, onClose }: ErrorDiagnosisProps) {
  const [errorMessage, setErrorMessage] = useState("");
  const [context, setContext] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("checking");
  const [diagnosing, setDiagnosing] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  // Focus textarea when opened
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [open]);

  const loadModels = useCallback(async () => {
    try {
      const result = await invoke<string[]>("ai_chat_list_models");
      const modelList = result.map((name) => ({ name }));
      setModels(modelList);
      if (modelList.length > 0 && !selectedModel) {
        setSelectedModel(modelList[0].name);
      }
    } catch {
      setModels([]);
    }
  }, [selectedModel]);

  const checkHealth = useCallback(async () => {
    setConnectionStatus("checking");
    try {
      await invoke("ai_check_health");
      setConnectionStatus("connected");
      loadModels();
    } catch {
      setConnectionStatus("disconnected");
      setModels([]);
    }
  }, [loadModels]);

  // Check health and load models when opened
  useEffect(() => {
    if (!open) return;
    checkHealth();
  }, [open, checkHealth]);

  // Scroll output into view when diagnosis updates
  useEffect(() => {
    if (diagnosis) {
      outputRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [diagnosis]);

  const handleDiagnose = useCallback(async () => {
    const trimmed = errorMessage.trim();
    if (!trimmed || diagnosing || connectionStatus !== "connected") return;

    setDiagnosing(true);
    setDiagnosis("");

    try {
      const response = await invoke<string>("ai_diagnose_error", {
        model: selectedModel,
        errorMessage: trimmed,
        context: context.trim() || null,
      });
      setDiagnosis(response);
    } catch (err) {
      setDiagnosis(
        `Error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setDiagnosing(false);
    }
  }, [errorMessage, context, diagnosing, connectionStatus, selectedModel]);

  const handleClear = useCallback(() => {
    setErrorMessage("");
    setContext("");
    setDiagnosis("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleDiagnose();
      }
    },
    [handleDiagnose],
  );

  if (!open) return null;

  return (
    <div className="error-diagnosis__sidebar">
      {/* Header */}
      <div className="error-diagnosis__header">
        <div className="error-diagnosis__header-left">
          <h3 className="error-diagnosis__title">Error Diagnosis</h3>
          <StatusIndicator status={connectionStatus} />
        </div>
        <div className="error-diagnosis__header-actions">
          <button
            className="error-diagnosis__icon-btn"
            onClick={handleClear}
            title="Clear"
          >
            <TrashIcon />
          </button>
          <button
            className="error-diagnosis__icon-btn"
            onClick={checkHealth}
            title="Reconnect"
          >
            <RefreshIcon />
          </button>
          <button
            className="error-diagnosis__icon-btn"
            onClick={onClose}
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Model selector */}
      {connectionStatus === "connected" && models.length > 0 && (
        <div className="error-diagnosis__model-selector">
          <select
            className="error-diagnosis__model-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Content area */}
      <div className="error-diagnosis__content">
        {/* Disconnected state */}
        {connectionStatus === "disconnected" && (
          <div className="error-diagnosis__disconnected">
            <div className="error-diagnosis__disconnected-icon">
              <DisconnectedIcon />
            </div>
            <h4 className="error-diagnosis__disconnected-title">
              Connect to Ollama or LM Studio
            </h4>
            <div className="error-diagnosis__instructions">
              <p>1. Install Ollama or LM Studio</p>
              <p>2. Start the local server</p>
              <p>
                3. Default endpoint: <code>http://localhost:11434</code>
              </p>
              <p>4. Click the refresh button above to reconnect</p>
            </div>
          </div>
        )}

        {/* Connected state — input form */}
        {connectionStatus !== "disconnected" && (
          <>
            {/* Error input */}
            <div className="error-diagnosis__input-section">
              <label className="error-diagnosis__label">Error Message</label>
              <textarea
                ref={textareaRef}
                className="error-diagnosis__textarea"
                value={errorMessage}
                onChange={(e) => setErrorMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Paste your error message here..."
                rows={6}
                disabled={connectionStatus !== "connected"}
              />
            </div>

            {/* Context input */}
            <div className="error-diagnosis__input-section">
              <label className="error-diagnosis__label">
                Context{" "}
                <span className="error-diagnosis__label-hint">(optional)</span>
              </label>
              <textarea
                className="error-diagnosis__textarea error-diagnosis__textarea--small"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Add relevant context (e.g., language, framework, what you were doing)..."
                rows={3}
                disabled={connectionStatus !== "connected"}
              />
            </div>

            {/* Diagnose button */}
            <button
              className="error-diagnosis__diagnose-btn"
              onClick={handleDiagnose}
              disabled={
                !errorMessage.trim() ||
                diagnosing ||
                connectionStatus !== "connected"
              }
            >
              {diagnosing ? (
                <span className="error-diagnosis__btn-loading">
                  <span className="error-diagnosis__btn-spinner" />
                  Diagnosing...
                </span>
              ) : (
                <span className="error-diagnosis__btn-content">
                  <DiagnoseIcon />
                  Diagnose
                </span>
              )}
            </button>

            <div className="error-diagnosis__shortcut-hint">
              <kbd>Cmd</kbd>+<kbd>Enter</kbd> to diagnose
            </div>

            {/* Diagnosis output */}
            {diagnosis && (
              <div className="error-diagnosis__output" ref={outputRef}>
                <div className="error-diagnosis__output-header">
                  <DiagnosisIcon />
                  <span>Diagnosis</span>
                </div>
                <div className="error-diagnosis__output-body">
                  <DiagnosisContent content={diagnosis} />
                </div>
              </div>
            )}

            {/* Loading indicator */}
            {diagnosing && !diagnosis && (
              <div className="error-diagnosis__loading">
                <span className="error-diagnosis__dot" />
                <span className="error-diagnosis__dot" />
                <span className="error-diagnosis__dot" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Diagnosis content renderer (handles code blocks)                   */
/* ------------------------------------------------------------------ */

function DiagnosisContent({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const inner = part.slice(3, -3);
          const newlineIdx = inner.indexOf("\n");
          const code = newlineIdx >= 0 ? inner.slice(newlineIdx + 1) : inner;
          return (
            <pre key={i} className="error-diagnosis__code-block">
              <code>{code}</code>
            </pre>
          );
        }
        // Handle inline code
        const inlineParts = part.split(/(`[^`]+`)/g);
        return (
          <span key={i}>
            {inlineParts.map((ip, j) => {
              if (ip.startsWith("`") && ip.endsWith("`")) {
                return (
                  <code key={j} className="error-diagnosis__inline-code">
                    {ip.slice(1, -1)}
                  </code>
                );
              }
              return <span key={j}>{ip}</span>;
            })}
          </span>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function StatusIndicator({ status }: { status: ConnectionStatus }) {
  const label =
    status === "connected"
      ? "Connected"
      : status === "checking"
        ? "Checking..."
        : "Disconnected";

  return (
    <span
      className={`error-diagnosis__status error-diagnosis__status--${status}`}
    >
      <span className="error-diagnosis__status-dot" />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M3 3L11 11M11 3L3 11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 4H13M6 4V3C6 2.45 6.45 2 7 2H9C9.55 2 10 2.45 10 3V4M5 4V13C5 13.55 5.45 14 6 14H10C10.55 14 11 13.55 11 13V4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M13.5 8A5.5 5.5 0 1 1 8 2.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M13 3V6H10"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DisconnectedIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />
      <path
        d="M8 12H16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DiagnoseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 2L2 14H14L8 2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M8 6V9"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
    </svg>
  );
}

function DiagnosisIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect
        x="3"
        y="2"
        width="10"
        height="12"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M6 5H10M6 8H10M6 11H8"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
