import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import "../styles/log-viewer.css";

interface LogLine {
  id: number;
  process_id: number;
  stream: string;
  content: string;
  timestamp: string;
}

interface LogLineEvent {
  process_id: number;
  stream: string;
  content: string;
  timestamp: string;
}

interface LogViewerProps {
  processId: number;
}

export function LogViewer({ processId }: LogViewerProps) {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LogLine[] | null>(null);
  const [filter, setFilter] = useState<"all" | "stdout" | "stderr">("all");
  const [follow, setFollow] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  // Load initial logs
  useEffect(() => {
    invoke<LogLine[]>("get_process_logs", {
      processId,
      limit: 1000,
    })
      .then(setLogs)
      .catch(console.error);
  }, [processId]);

  // Listen for real-time log events
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    listen<LogLineEvent>("process-log", (event) => {
      const line = event.payload;
      if (line.process_id === processId) {
        setLogs((prev) => [
          ...prev,
          {
            id: Date.now(),
            process_id: line.process_id,
            stream: line.stream,
            content: line.content,
            timestamp: line.timestamp,
          },
        ]);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [processId]);

  // Auto-scroll to bottom when follow mode is on
  useEffect(() => {
    if (follow && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, follow]);

  // Detect manual scroll
  const handleScroll = useCallback(() => {
    const container = logContainerRef.current;
    if (!container) return;

    const atBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      50;
    if (!atBottom && follow) {
      userScrolledUp.current = true;
      setFollow(false);
    } else if (atBottom && userScrolledUp.current) {
      userScrolledUp.current = false;
      setFollow(true);
    }
  }, [follow]);

  // Search logs
  const handleSearch = useCallback(
    async (query: string) => {
      setSearchQuery(query);
      if (!query.trim()) {
        setSearchResults(null);
        return;
      }
      try {
        const results = await invoke<LogLine[]>("search_process_logs", {
          processId,
          query,
        });
        setSearchResults(results);
      } catch (err) {
        console.error("Search failed:", err);
      }
    },
    [processId],
  );

  // Clear logs
  const handleClear = useCallback(async () => {
    try {
      await invoke("clear_process_logs", { processId });
      setLogs([]);
      setSearchResults(null);
    } catch (err) {
      console.error("Clear failed:", err);
    }
  }, [processId]);

  // Determine which logs to display
  const displayLogs = searchResults ?? logs;
  const filteredLogs =
    filter === "all"
      ? displayLogs
      : displayLogs.filter((l) => l.stream === filter);

  // Highlight search matches in content
  const highlightContent = (content: string) => {
    if (!searchQuery.trim()) return content;
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = content.split(new RegExp(`(${escaped})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === searchQuery.toLowerCase() ? (
        <mark key={i} className="log-highlight">
          {part}
        </mark>
      ) : (
        part
      ),
    );
  };

  return (
    <div className="log-viewer">
      <div className="log-toolbar">
        <input
          type="text"
          className="log-search"
          placeholder="Search logs..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
        />
        <div className="log-filters">
          <button
            className={`log-filter-btn ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            className={`log-filter-btn ${filter === "stdout" ? "active" : ""}`}
            onClick={() => setFilter("stdout")}
          >
            stdout
          </button>
          <button
            className={`log-filter-btn ${filter === "stderr" ? "active" : ""}`}
            onClick={() => setFilter("stderr")}
          >
            stderr
          </button>
        </div>
        <label className="log-toggle">
          <input
            type="checkbox"
            checked={showTimestamps}
            onChange={(e) => setShowTimestamps(e.target.checked)}
          />
          Timestamps
        </label>
        <label className="log-toggle">
          <input
            type="checkbox"
            checked={follow}
            onChange={(e) => setFollow(e.target.checked)}
          />
          Follow
        </label>
        <button className="log-clear-btn" onClick={handleClear}>
          Clear
        </button>
      </div>

      <div className="log-output" ref={logContainerRef} onScroll={handleScroll}>
        {filteredLogs.length === 0 ? (
          <div className="log-empty">No log output yet</div>
        ) : (
          filteredLogs.map((line) => (
            <div
              key={line.id}
              className={`log-line ${line.stream === "stderr" ? "log-stderr" : "log-stdout"}`}
            >
              {showTimestamps && (
                <span className="log-timestamp">{line.timestamp}</span>
              )}
              <span className="log-content">
                {highlightContent(line.content)}
              </span>
            </div>
          ))
        )}
      </div>

      {searchResults && (
        <div className="log-search-status">
          {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}{" "}
          found
        </div>
      )}
    </div>
  );
}
