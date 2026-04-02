import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Recording {
  id: number;
  worktree_id: number;
  title: string;
  duration_ms: number;
  event_count: number;
  created_at: string;
}

interface RecordingEvent {
  id: number;
  recording_id: number;
  timestamp_ms: number;
  event_type: string; // "input" | "output"
  data: string;
}

type Mode = "list" | "replay";
type PlaybackSpeed = 1 | 2 | 4;

interface TerminalRecordingProps {
  worktreeId: number;
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TerminalRecording({
  worktreeId,
  onClose,
}: TerminalRecordingProps) {
  const [mode, setMode] = useState<Mode>("list");
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Replay state
  const [activeRecording, setActiveRecording] = useState<Recording | null>(
    null,
  );
  const [events, setEvents] = useState<RecordingEvent[]>([]);
  const [visibleEvents, setVisibleEvents] = useState<RecordingEvent[]>([]);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [progress, setProgress] = useState(0);
  const [isRecording, setIsRecording] = useState(false);

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Refs for playback
  const playbackRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const eventIndexRef = useRef<number>(0);
  const terminalRef = useRef<HTMLDivElement>(null);

  /* ---- Fetch recordings ---- */
  const loadRecordings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<Recording[]>("list_recordings", {
        worktreeId,
      });
      setRecordings(result);
    } catch (err) {
      setError(String(err));
      setRecordings([]);
    }
    setLoading(false);
  }, [worktreeId]);

  useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  /* ---- Start recording ---- */
  const handleStartRecording = useCallback(async () => {
    setIsRecording(true);
    try {
      await invoke("start_recording", { worktreeId });
      await loadRecordings();
    } catch (err) {
      setError(String(err));
    }
    setIsRecording(false);
  }, [worktreeId, loadRecordings]);

  /* ---- Delete recording ---- */
  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await invoke("delete_recording", { recordingId: id });
        setDeleteConfirmId(null);
        await loadRecordings();
      } catch (err) {
        setError(String(err));
      }
    },
    [loadRecordings],
  );

  /* ---- Enter replay mode ---- */
  const handleReplay = useCallback(async (recording: Recording) => {
    setActiveRecording(recording);
    setMode("replay");
    setVisibleEvents([]);
    setProgress(0);
    setPlaying(false);
    eventIndexRef.current = 0;

    try {
      const result = await invoke<RecordingEvent[]>("get_recording_events", {
        recordingId: recording.id,
      });
      setEvents(result);
    } catch (err) {
      setError(String(err));
      setEvents([]);
    }
  }, []);

  /* ---- Playback logic ---- */
  const stopPlayback = useCallback(() => {
    if (playbackRef.current !== null) {
      cancelAnimationFrame(playbackRef.current);
      playbackRef.current = null;
    }
    setPlaying(false);
  }, []);

  const tick = useCallback(() => {
    if (!activeRecording || events.length === 0) return;

    const elapsed = (performance.now() - startTimeRef.current) * speed;
    const duration = activeRecording.duration_ms;
    const currentProgress = Math.min(elapsed / duration, 1);
    setProgress(currentProgress);

    // Show events up to current elapsed time
    const newVisible: RecordingEvent[] = [];
    let idx = 0;
    while (idx < events.length && events[idx].timestamp_ms <= elapsed) {
      newVisible.push(events[idx]);
      idx++;
    }
    eventIndexRef.current = idx;
    setVisibleEvents(newVisible);

    // Auto-scroll terminal
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }

    if (currentProgress >= 1) {
      setPlaying(false);
      playbackRef.current = null;
      return;
    }

    playbackRef.current = requestAnimationFrame(tick);
  }, [activeRecording, events, speed]);

  const startPlayback = useCallback(() => {
    if (events.length === 0) return;

    // If at end, restart
    if (progress >= 1) {
      setVisibleEvents([]);
      eventIndexRef.current = 0;
      setProgress(0);
    }

    startTimeRef.current =
      performance.now() -
      (progress * (activeRecording?.duration_ms ?? 0)) / speed;
    setPlaying(true);
  }, [events, progress, activeRecording, speed]);

  useEffect(() => {
    if (playing) {
      playbackRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (playbackRef.current !== null) {
        cancelAnimationFrame(playbackRef.current);
      }
    };
  }, [playing, tick]);

  const togglePlayback = useCallback(() => {
    if (playing) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }, [playing, stopPlayback, startPlayback]);

  const handleSpeedChange = useCallback(
    (newSpeed: PlaybackSpeed) => {
      if (playing && activeRecording) {
        // Recalculate start time for new speed
        const elapsed = (performance.now() - startTimeRef.current) * speed;
        startTimeRef.current = performance.now() - elapsed / newSpeed;
      }
      setSpeed(newSpeed);
    },
    [playing, activeRecording, speed],
  );

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!activeRecording) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      );
      const targetMs = ratio * activeRecording.duration_ms;

      // Show events up to target time
      const newVisible = events.filter((ev) => ev.timestamp_ms <= targetMs);
      setVisibleEvents(newVisible);
      eventIndexRef.current = newVisible.length;
      setProgress(ratio);

      if (playing) {
        startTimeRef.current = performance.now() - targetMs / speed;
      }
    },
    [activeRecording, events, playing, speed],
  );

  const handleBackToList = useCallback(() => {
    stopPlayback();
    setMode("list");
    setActiveRecording(null);
    setEvents([]);
    setVisibleEvents([]);
  }, [stopPlayback]);

  /* ---- Cleanup on unmount ---- */
  useEffect(() => {
    return () => {
      if (playbackRef.current !== null) {
        cancelAnimationFrame(playbackRef.current);
      }
    };
  }, []);

  /* ---- Render ---- */
  return (
    <div className="trec-backdrop" onClick={onClose}>
      <div className="trec-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="trec-header">
          <div className="trec-header__left">
            {mode === "replay" && (
              <button className="trec-back-btn" onClick={handleBackToList}>
                {"\u2190"}
              </button>
            )}
            <h3 className="trec-title">
              {mode === "list"
                ? "Terminal Recordings"
                : (activeRecording?.title ?? "Replay")}
            </h3>
            {isRecording && (
              <span className="trec-recording-indicator">
                <span className="trec-recording-dot" />
                REC
              </span>
            )}
          </div>
          <button className="trec-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {error && <div className="trec-error">{error}</div>}

        {mode === "list" ? (
          /* ---- List Mode ---- */
          <div className="trec-list-container">
            <div className="trec-actions">
              <button
                className="trec-start-btn"
                onClick={handleStartRecording}
                disabled={isRecording}
              >
                <span className="trec-recording-dot trec-recording-dot--static" />
                {isRecording ? "Starting..." : "Start Recording"}
              </button>
            </div>

            {loading ? (
              <div className="trec-empty">Loading recordings...</div>
            ) : recordings.length === 0 ? (
              <div className="trec-empty">
                No recordings yet. Start one to capture your terminal session.
              </div>
            ) : (
              <div className="trec-list">
                {recordings.map((rec) => (
                  <div key={rec.id} className="trec-item">
                    <div className="trec-item__info">
                      <span className="trec-item__title">{rec.title}</span>
                      <div className="trec-item__meta">
                        <span className="trec-item__duration">
                          {formatDuration(rec.duration_ms)}
                        </span>
                        <span className="trec-item__separator">{"\u00B7"}</span>
                        <span className="trec-item__events">
                          {rec.event_count} events
                        </span>
                        <span className="trec-item__separator">{"\u00B7"}</span>
                        <span className="trec-item__date">
                          {formatDate(rec.created_at)}
                        </span>
                      </div>
                    </div>
                    <div className="trec-item__actions">
                      <button
                        className="trec-play-btn"
                        onClick={() => handleReplay(rec)}
                        title="Play"
                      >
                        {"\u25B6"}
                      </button>
                      {deleteConfirmId === rec.id ? (
                        <div className="trec-delete-confirm">
                          <button
                            className="trec-delete-yes"
                            onClick={() => handleDelete(rec.id)}
                          >
                            Delete
                          </button>
                          <button
                            className="trec-delete-no"
                            onClick={() => setDeleteConfirmId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          className="trec-delete-btn"
                          onClick={() => setDeleteConfirmId(rec.id)}
                          title="Delete"
                        >
                          {"\u2715"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ---- Replay Mode ---- */
          <div className="trec-replay-container">
            <div className="trec-terminal" ref={terminalRef}>
              {visibleEvents.length === 0 ? (
                <div className="trec-terminal__empty">
                  {events.length === 0
                    ? "No events to replay."
                    : "Press play to start replay."}
                </div>
              ) : (
                visibleEvents.map((ev, i) => (
                  <div
                    key={i}
                    className={`trec-terminal__line ${ev.event_type === "input" ? "trec-terminal__line--input" : "trec-terminal__line--output"}`}
                  >
                    <span className="trec-terminal__prefix">
                      {ev.event_type === "input" ? "$" : ">"}
                    </span>
                    <span className="trec-terminal__text">{ev.data}</span>
                  </div>
                ))
              )}
            </div>

            {/* Playback controls */}
            <div className="trec-controls">
              <button
                className="trec-controls__play"
                onClick={togglePlayback}
                disabled={events.length === 0}
              >
                {playing ? "\u23F8" : "\u25B6"}
              </button>

              <div
                className="trec-controls__progress"
                onClick={handleProgressClick}
              >
                <div
                  className="trec-controls__progress-fill"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>

              <div className="trec-controls__time">
                {activeRecording
                  ? formatDuration(progress * activeRecording.duration_ms)
                  : "0:00"}
                {" / "}
                {activeRecording
                  ? formatDuration(activeRecording.duration_ms)
                  : "0:00"}
              </div>

              <div className="trec-controls__speed">
                {([1, 2, 4] as PlaybackSpeed[]).map((s) => (
                  <button
                    key={s}
                    className={`trec-speed-pill ${speed === s ? "trec-speed-pill--active" : ""}`}
                    onClick={() => handleSpeedChange(s)}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
