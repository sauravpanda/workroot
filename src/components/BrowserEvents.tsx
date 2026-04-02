import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/browser-events.css";

interface BrowserEvent {
  id: number;
  event_type: string;
  message: string;
  url: string | null;
  status_code: number | null;
  details: string;
  timestamp: string;
}

interface RelatedLog {
  process_id: number;
  stream: string;
  content: string;
  timestamp: string;
}

interface CorrelatedEvent {
  browser_event: BrowserEvent;
  server_logs: RelatedLog[];
}

interface BrowserEventsProps {
  worktreeId: number;
  onClose: () => void;
}

function statusClass(code: number | null): string {
  if (!code) return "";
  if (code >= 200 && code < 300) return "browser-events__status--2xx";
  if (code >= 300 && code < 400) return "browser-events__status--3xx";
  if (code >= 400 && code < 500) return "browser-events__status--4xx";
  return "browser-events__status--5xx";
}

function eventTypeLabel(type: string): string {
  switch (type) {
    case "error":
      return "ERR";
    case "network_failure":
      return "NET";
    default:
      return type.toUpperCase().slice(0, 3);
  }
}

function eventTypeClass(type: string): string {
  switch (type) {
    case "error":
      return "browser-events__type-badge--error";
    case "network_failure":
      return "browser-events__type-badge--network";
    default:
      return "";
  }
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}

function extractPath(url: string | null): string {
  if (!url) return "-";
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function BrowserEvents({ worktreeId, onClose }: BrowserEventsProps) {
  const [events, setEvents] = useState<BrowserEvent[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [correlated, setCorrelated] = useState<CorrelatedEvent | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  // Suppress unused variable warning -- worktreeId is accepted as a prop
  // for future filtering but the backend command doesn't use it yet.
  void worktreeId;

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const results = await invoke<BrowserEvent[]>("get_browser_events", {
        limit: 200,
      });
      setEvents(results);
    } catch (err) {
      console.error("Failed to load browser events:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
    const interval = setInterval(loadEvents, 5000);
    return () => clearInterval(interval);
  }, [loadEvents]);

  const handleSelect = async (event: BrowserEvent) => {
    setSelectedId(event.id);
    setDetailLoading(true);
    try {
      const result = await invoke<CorrelatedEvent>("get_correlated_event", {
        eventId: event.id,
      });
      setCorrelated(result);
    } catch (err) {
      console.error("Failed to load correlated event:", err);
      setCorrelated(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const filteredEvents = events.filter((e) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (e.url && e.url.toLowerCase().includes(q)) ||
      e.message.toLowerCase().includes(q)
    );
  });

  if (!loading && events.length === 0 && !searchQuery) {
    return (
      <div className="browser-events">
        <div className="browser-events__header">
          <span className="browser-events__title">Browser Events</span>
          <button className="browser-events__close-btn" onClick={onClose}>
            x
          </button>
        </div>
        <div className="browser-events__empty">
          <div className="browser-events__empty-icon">~</div>
          <p>No browser events recorded</p>
          <p className="browser-events__empty-hint">
            Events from the browser extension will appear here
          </p>
        </div>
      </div>
    );
  }

  const details = correlated
    ? tryParseJson(correlated.browser_event.details)
    : null;

  return (
    <div className="browser-events">
      <div className="browser-events__header">
        <span className="browser-events__title">Browser Events</span>
        <div className="browser-events__header-actions">
          <button className="browser-events__refresh-btn" onClick={loadEvents}>
            Refresh
          </button>
          <button className="browser-events__close-btn" onClick={onClose}>
            x
          </button>
        </div>
      </div>

      <div className="browser-events__toolbar">
        <input
          type="text"
          className="browser-events__search"
          placeholder="Filter by URL or message..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <span className="browser-events__count">
          {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="browser-events__body">
        <div className="browser-events__list">
          <div className="browser-events__list-header">
            <span className="browser-events__col-type">Type</span>
            <span className="browser-events__col-url">URL</span>
            <span className="browser-events__col-status">Status</span>
            <span className="browser-events__col-time">Time</span>
          </div>
          {loading && events.length === 0 ? (
            <div className="browser-events__loading">Loading...</div>
          ) : (
            filteredEvents.map((event) => (
              <div
                key={event.id}
                className={`browser-events__row ${selectedId === event.id ? "browser-events__row--active" : ""}`}
                onClick={() => handleSelect(event)}
              >
                <span className="browser-events__col-type">
                  <span
                    className={`browser-events__type-badge ${eventTypeClass(event.event_type)}`}
                  >
                    {eventTypeLabel(event.event_type)}
                  </span>
                </span>
                <span
                  className="browser-events__col-url"
                  title={event.url || event.message}
                >
                  {event.url ? extractPath(event.url) : event.message}
                </span>
                <span
                  className={`browser-events__col-status ${statusClass(event.status_code)}`}
                >
                  {event.status_code ?? "-"}
                </span>
                <span className="browser-events__col-time">
                  {formatTimestamp(event.timestamp)}
                </span>
              </div>
            ))
          )}
        </div>

        {selectedId !== null && (
          <div className="browser-events__detail">
            {detailLoading ? (
              <div className="browser-events__detail-loading">Loading...</div>
            ) : correlated ? (
              <>
                <div className="browser-events__detail-header">
                  <span
                    className={`browser-events__type-badge ${eventTypeClass(correlated.browser_event.event_type)}`}
                  >
                    {eventTypeLabel(correlated.browser_event.event_type)}
                  </span>
                  {correlated.browser_event.status_code && (
                    <span
                      className={`browser-events__detail-status ${statusClass(correlated.browser_event.status_code)}`}
                    >
                      {correlated.browser_event.status_code}
                    </span>
                  )}
                </div>

                <div className="browser-events__detail-url">
                  {correlated.browser_event.url || "No URL"}
                </div>

                <div className="browser-events__detail-section">
                  <div className="browser-events__detail-section-title">
                    Message
                  </div>
                  <div className="browser-events__detail-message">
                    {correlated.browser_event.message}
                  </div>
                </div>

                <div className="browser-events__detail-section">
                  <div className="browser-events__detail-section-title">
                    Timestamp
                  </div>
                  <div className="browser-events__detail-meta">
                    {correlated.browser_event.timestamp}
                  </div>
                </div>

                {details && (
                  <div className="browser-events__detail-section">
                    <div className="browser-events__detail-section-title">
                      Details
                    </div>
                    <pre className="browser-events__detail-json">
                      {JSON.stringify(details, null, 2)}
                    </pre>
                  </div>
                )}

                {correlated.server_logs.length > 0 && (
                  <div className="browser-events__detail-section">
                    <div className="browser-events__detail-section-title">
                      Related Server Logs ({correlated.server_logs.length})
                    </div>
                    <div className="browser-events__logs">
                      {correlated.server_logs.map((log, i) => (
                        <div key={i} className="browser-events__log-entry">
                          <span className="browser-events__log-pid">
                            [{log.process_id}]
                          </span>
                          <span
                            className={`browser-events__log-stream browser-events__log-stream--${log.stream}`}
                          >
                            {log.stream}
                          </span>
                          <span className="browser-events__log-content">
                            {log.content}
                          </span>
                          <span className="browser-events__log-time">
                            {formatTimestamp(log.timestamp)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {correlated.server_logs.length === 0 && (
                  <div className="browser-events__detail-section">
                    <div className="browser-events__detail-section-title">
                      Related Server Logs
                    </div>
                    <div className="browser-events__detail-meta">
                      No server logs within the correlation window
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="browser-events__detail-loading">
                Could not load event details
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
