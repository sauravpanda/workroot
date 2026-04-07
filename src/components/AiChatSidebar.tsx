import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AiChatSidebarProps {
  open: boolean;
  onClose: () => void;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface ModelInfo {
  name: string;
}

type ConnectionStatus = "connected" | "disconnected" | "checking";

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AiChatSidebar({ open, onClose }: AiChatSidebarProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("checking");
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [endpoint, setEndpoint] = useState("http://localhost:11434");
  const [endpointSaved, setEndpointSaved] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const healthCheckGenRef = useRef(0);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

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
    const gen = ++healthCheckGenRef.current;
    setConnectionStatus("checking");
    try {
      await invoke("ai_check_health");
      if (gen !== healthCheckGenRef.current) return;
      setConnectionStatus("connected");
      loadModels();
    } catch {
      if (gen !== healthCheckGenRef.current) return;
      setConnectionStatus("disconnected");
      setModels([]);
    }
  }, [loadModels]);

  // Check health and load models when opened
  useEffect(() => {
    if (!open) return;
    checkHealth();
  }, [open, checkHealth]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading || connectionStatus !== "connected") return;

    const userMessage: ChatMessage = {
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const history = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await invoke<string>("ai_chat_send", {
        model: selectedModel,
        messages: history,
      });

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: response,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, connectionStatus, messages, selectedModel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleSaveEndpoint = useCallback(async () => {
    try {
      await invoke("set_setting", {
        key: "ai_endpoint",
        value: endpoint.trim(),
      });
      setEndpointSaved(true);
      setTimeout(() => setEndpointSaved(false), 2000);
      checkHealth();
    } catch {
      // ignore
    }
  }, [endpoint, checkHealth]);

  const handleClearChat = useCallback(() => {
    setMessages([]);
  }, []);

  const formatTime = useCallback((ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, []);

  if (!open) return null;

  return (
    <div className="ai-chat__sidebar">
      {/* Header */}
      <div className="ai-chat__header">
        <div className="ai-chat__header-left">
          <h3 className="ai-chat__title">AI Chat</h3>
          <StatusIndicator status={connectionStatus} />
        </div>
        <div className="ai-chat__header-actions">
          <button
            className="ai-chat__icon-btn"
            onClick={handleClearChat}
            title="Clear chat"
            aria-label="Clear chat"
          >
            <TrashIcon />
          </button>
          <button
            className="ai-chat__icon-btn"
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
            aria-label="Settings"
          >
            <GearIcon />
          </button>
          <button
            className="ai-chat__icon-btn"
            onClick={onClose}
            title="Close"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="ai-chat__settings">
          <label className="ai-chat__settings-label">Endpoint URL</label>
          <div className="ai-chat__settings-row">
            <input
              className="ai-chat__settings-input"
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="http://localhost:11434"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveEndpoint();
              }}
            />
            <button
              className="ai-chat__settings-save"
              onClick={handleSaveEndpoint}
            >
              {endpointSaved ? "Saved" : "Save"}
            </button>
          </div>
          <button className="ai-chat__settings-reconnect" onClick={checkHealth}>
            Reconnect
          </button>
        </div>
      )}

      {/* Model selector */}
      {connectionStatus === "connected" && models.length > 0 && (
        <div className="ai-chat__model-selector">
          <select
            className="ai-chat__model-select"
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

      {/* Messages area */}
      <div className="ai-chat__messages">
        {connectionStatus === "disconnected" && messages.length === 0 && (
          <div className="ai-chat__empty">
            <div className="ai-chat__empty-icon">
              <DisconnectedIcon />
            </div>
            <h4 className="ai-chat__empty-title">
              Connect to Ollama or LM Studio
            </h4>
            <div className="ai-chat__empty-instructions">
              <p>1. Install Ollama or LM Studio</p>
              <p>2. Start the local server</p>
              <p>
                3. Set the endpoint URL in settings (default:{" "}
                <code>http://localhost:11434</code>)
              </p>
              <p>4. Click Reconnect</p>
            </div>
          </div>
        )}

        {connectionStatus === "connected" && messages.length === 0 && (
          <div className="ai-chat__empty">
            <div className="ai-chat__empty-icon">
              <ChatIcon />
            </div>
            <h4 className="ai-chat__empty-title">Start a conversation</h4>
            <p className="ai-chat__empty-subtitle">
              Ask questions, get help with code, or brainstorm ideas.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={`${msg.timestamp}-${i}`}
            className={`ai-chat__message ai-chat__message--${msg.role}`}
          >
            <div className="ai-chat__bubble">
              <MessageContent content={msg.content} />
            </div>
            <span className="ai-chat__timestamp">
              {formatTime(msg.timestamp)}
            </span>
          </div>
        ))}

        {loading && (
          <div className="ai-chat__message ai-chat__message--assistant">
            <div className="ai-chat__bubble">
              <div className="ai-chat__loading">
                <span className="ai-chat__dot" />
                <span className="ai-chat__dot" />
                <span className="ai-chat__dot" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="ai-chat__input-area">
        <div className="ai-chat__input-wrap">
          <span className="ai-chat__prompt-char">&gt;</span>
          <textarea
            ref={inputRef}
            className="ai-chat__input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              connectionStatus === "connected"
                ? "Send a message..."
                : "Connect to start chatting"
            }
            disabled={connectionStatus !== "connected" || loading}
            rows={1}
          />
          <button
            className="ai-chat__send-btn"
            onClick={handleSend}
            disabled={
              !input.trim() || loading || connectionStatus !== "connected"
            }
            title="Send message"
            aria-label="Send message"
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Message content renderer (handles code blocks)                     */
/* ------------------------------------------------------------------ */

function MessageContent({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const inner = part.slice(3, -3);
          const newlineIdx = inner.indexOf("\n");
          const code = newlineIdx >= 0 ? inner.slice(newlineIdx + 1) : inner;
          return (
            <pre key={i} className="ai-chat__code-block">
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
                  <code key={j} className="ai-chat__inline-code">
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
    <span className={`ai-chat__status ai-chat__status--${status}`}>
      <span className="ai-chat__status-dot" />
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

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 1.5V3M8 13V14.5M1.5 8H3M13 8H14.5M3.05 3.05L4.11 4.11M11.89 11.89L12.95 12.95M3.05 12.95L4.11 11.89M11.89 4.11L12.95 3.05"
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

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M2 8L14 2L8 14L7 9L2 8Z"
        stroke="currentColor"
        strokeWidth="1.3"
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

function ChatIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 6C4 4.9 4.9 4 6 4H18C19.1 4 20 4.9 20 6V14C20 15.1 19.1 16 18 16H8L4 20V6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9 9H15M9 12H13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
