import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface WebhookEvent {
  id: number;
  source: string;
  event_type: string;
  payload: string;
  received_at: string;
}

interface WebhookEventsProps {
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const WEBHOOK_URL = "http://localhost:9999/webhook";

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));

  if (diffSec < 60) return "just now";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function sourceBorderColor(source: string): string {
  const lower = source.toLowerCase();
  if (lower === "github") return "#24292f";
  if (lower === "ci" || lower === "jenkins" || lower === "circleci")
    return "#3b82f6";
  return "#555";
}

function sourceDisplayClass(source: string): string {
  const lower = source.toLowerCase();
  if (lower === "github") return "whook-source--github";
  if (lower === "ci" || lower === "jenkins" || lower === "circleci")
    return "whook-source--ci";
  return "whook-source--unknown";
}

/* ---- Simple JSON syntax highlighting ---- */

interface JsonToken {
  type: "key" | "string" | "number" | "boolean" | "null" | "punctuation";
  text: string;
}

function tokenizeJson(raw: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  // Simple regex-based tokenizer for display purposes
  const regex =
    /("(?:\\.|[^"\\])*")\s*:|("(?:\\.|[^"\\])*")|(-?\d+\.?\d*(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)|([{}[\]:,])/g;
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = regex.exec(raw)) !== null) {
    // Add any whitespace/other text between tokens
    if (match.index > lastIndex) {
      tokens.push({
        type: "punctuation",
        text: raw.slice(lastIndex, match.index),
      });
    }

    if (match[1] !== undefined) {
      // Key (string followed by colon)
      tokens.push({ type: "key", text: match[1] });
      // find the colon
      const colonIdx = raw.indexOf(":", match.index + match[1].length);
      if (colonIdx >= 0) {
        tokens.push({
          type: "punctuation",
          text: raw.slice(match.index + match[1].length, colonIdx + 1),
        });
        regex.lastIndex = colonIdx + 1;
      }
    } else if (match[2] !== undefined) {
      tokens.push({ type: "string", text: match[2] });
    } else if (match[3] !== undefined) {
      tokens.push({ type: "number", text: match[3] });
    } else if (match[4] !== undefined) {
      tokens.push({ type: "boolean", text: match[4] });
    } else if (match[5] !== undefined) {
      tokens.push({ type: "null", text: match[5] });
    } else if (match[6] !== undefined) {
      tokens.push({ type: "punctuation", text: match[6] });
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < raw.length) {
    tokens.push({ type: "punctuation", text: raw.slice(lastIndex) });
  }

  return tokens;
}

function formatPayload(payload: string): string {
  try {
    const parsed: unknown = JSON.parse(payload);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return payload;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function WebhookEvents({ onClose }: WebhookEventsProps) {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  /* ---- Fetch events ---- */
  const loadEvents = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const result = await invoke<WebhookEvent[]>("get_webhook_events", {});
      setEvents(result);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
    if (showSpinner) setLoading(false);
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  /* ---- Auto-refresh every 10 seconds ---- */
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      loadEvents(false);
    }, 10_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadEvents]);

  /* ---- Toggle expand ---- */
  const toggleExpand = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  /* ---- Copy webhook URL ---- */
  const handleCopyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(WEBHOOK_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard may not be available
    }
  }, []);

  /* ---- Clear all ---- */
  const handleClearAll = useCallback(async () => {
    try {
      await invoke("clear_webhook_events", {});
      setEvents([]);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  return (
    <div className="whook-backdrop" onClick={onClose}>
      <div className="whook-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="whook-header">
          <h3 className="whook-title">Webhook Events</h3>
          <button className="whook-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* URL bar */}
        <div className="whook-url-bar">
          <span className="whook-url-label">Endpoint</span>
          <code className="whook-url-value">{WEBHOOK_URL}</code>
          <button className="whook-url-copy" onClick={handleCopyUrl}>
            {copied ? "Copied!" : "Copy"}
          </button>
          {events.length > 0 && (
            <button className="whook-clear-btn" onClick={handleClearAll}>
              Clear All
            </button>
          )}
        </div>

        {error && <div className="whook-error">{error}</div>}

        {/* Events list */}
        <div className="whook-body">
          {loading ? (
            <div className="whook-empty">Loading events...</div>
          ) : events.length === 0 ? (
            <div className="whook-empty-state">
              <div className="whook-empty-state__icon">{"\u2139"}</div>
              <div className="whook-empty-state__text">
                Listening for webhooks on port 9999
              </div>
              <div className="whook-empty-state__hint">
                Send POST requests to <code>{WEBHOOK_URL}</code>
              </div>
            </div>
          ) : (
            <div className="whook-list">
              {events.map((event) => {
                const isExpanded = expandedIds.has(event.id);
                const formatted = formatPayload(event.payload);
                const tokens = tokenizeJson(formatted);

                return (
                  <div
                    key={event.id}
                    className="whook-event"
                    style={{
                      borderLeftColor: sourceBorderColor(event.source),
                    }}
                  >
                    <button
                      className="whook-event__header"
                      onClick={() => toggleExpand(event.id)}
                    >
                      <span
                        className={`whook-event__chevron ${isExpanded ? "whook-event__chevron--open" : ""}`}
                      >
                        {"\u25B6"}
                      </span>
                      <span
                        className={`whook-source-badge ${sourceDisplayClass(event.source)}`}
                      >
                        {event.source}
                      </span>
                      <span className="whook-event__type">
                        {event.event_type}
                      </span>
                      <span className="whook-event__time">
                        {relativeTime(event.received_at)}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="whook-event__payload">
                        <pre className="whook-json">
                          {tokens.map((token, i) => (
                            <span
                              key={i}
                              className={`whook-json__${token.type}`}
                            >
                              {token.text}
                            </span>
                          ))}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
