import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/activity-timeline.css";

interface ActivityEvent {
  id: number;
  event_type: string;
  title: string;
  detail: string;
  timestamp: string;
}

interface ActivityTimelineProps {
  onClose: () => void;
}

const EVENT_ICONS: Record<string, string> = {
  commit: "\u25CF",
  push: "\u2191",
  pull: "\u2193",
  merge: "\u21C4",
  branch: "\u2387",
  build: "\u25B6",
  test: "\u2714",
  deploy: "\u2601",
  review: "\u2709",
  issue: "\u25CB",
};

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActivityTimeline({ onClose }: ActivityTimelineProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("all");

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<ActivityEvent[]>("get_activity_timeline", {
        limit: 50,
        offset: 0,
      });
      setEvents(result);
    } catch (e) {
      setError(String(e));
      setEvents([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const eventTypes = [
    "all",
    ...Array.from(new Set(events.map((e) => e.event_type))),
  ];
  const filteredEvents =
    filterType === "all"
      ? events
      : events.filter((e) => e.event_type === filterType);

  return (
    <div className="timeline-backdrop" onClick={onClose}>
      <div className="timeline-panel" onClick={(e) => e.stopPropagation()}>
        <div className="timeline-header">
          <h3 className="timeline-title">Activity Timeline</h3>
          <div className="timeline-header-actions">
            <select
              className="timeline-filter"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              {eventTypes.map((t) => (
                <option key={t} value={t}>
                  {t === "all" ? "All Events" : t}
                </option>
              ))}
            </select>
            <button className="timeline-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        <div className="timeline-body">
          {error && <div className="timeline-error">{error}</div>}

          {loading ? (
            <div className="timeline-empty">Loading activity...</div>
          ) : filteredEvents.length === 0 ? (
            <div className="timeline-empty">No activity events found.</div>
          ) : (
            <div className="timeline-list">
              {filteredEvents.map((event) => (
                <div key={event.id} className="timeline-event">
                  <div className="timeline-line-col">
                    <span className="timeline-icon">
                      {EVENT_ICONS[event.event_type] || "\u25CF"}
                    </span>
                    <span className="timeline-line" />
                  </div>
                  <div className="timeline-event-content">
                    <div className="timeline-event-header">
                      <span className="timeline-event-type">
                        {event.event_type}
                      </span>
                      <span className="timeline-event-time">
                        {formatTimestamp(event.timestamp)}
                      </span>
                    </div>
                    <span className="timeline-event-title">{event.title}</span>
                    {event.detail && (
                      <span className="timeline-event-detail">
                        {event.detail}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
