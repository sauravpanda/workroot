import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RequestInspector } from "./RequestInspector";
import "../styles/network-tab.css";

interface TrafficEntry {
  id: number;
  process_id: number | null;
  method: string;
  url: string;
  status_code: number | null;
  request_headers: string | null;
  request_body: string | null;
  response_headers: string | null;
  response_body: string | null;
  duration_ms: number | null;
  timestamp: string;
}

function statusClass(code: number | null): string {
  if (!code) return "";
  if (code >= 200 && code < 300) return "s2xx";
  if (code >= 300 && code < 400) return "s3xx";
  if (code >= 400 && code < 500) return "s4xx";
  return "s5xx";
}

function formatSize(body: string | null): string {
  if (!body) return "-";
  const bytes = new Blob([body]).size;
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function extractPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

export function NetworkTab() {
  const [entries, setEntries] = useState<TrafficEntry[]>([]);
  const [selected, setSelected] = useState<TrafficEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [loading, setLoading] = useState(false);

  const loadTraffic = useCallback(async () => {
    setLoading(true);
    try {
      const results = await invoke<TrafficEntry[]>("get_network_traffic", {
        method: methodFilter || null,
        urlPattern: searchQuery || null,
        statusMin: null,
        statusMax: null,
        limit: 500,
      });
      setEntries(results);
    } catch (err) {
      console.error("Failed to load traffic:", err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, methodFilter]);

  useEffect(() => {
    loadTraffic();
    // Auto-refresh every 5 seconds
    const interval = setInterval(loadTraffic, 5000);
    return () => clearInterval(interval);
  }, [loadTraffic]);

  const handleClear = async () => {
    try {
      await invoke("clear_network_traffic");
      setEntries([]);
      setSelected(null);
    } catch (err) {
      console.error("Failed to clear traffic:", err);
    }
  };

  if (!loading && entries.length === 0 && !searchQuery && !methodFilter) {
    return (
      <div className="network-empty">
        <div className="network-empty-icon">~</div>
        <p>No network traffic captured</p>
        <p className="network-empty-hint">
          Traffic through the forward proxy (port 8888) appears here
        </p>
      </div>
    );
  }

  return (
    <div className="network-tab">
      <div className="network-toolbar">
        <input
          type="text"
          className="network-search"
          placeholder="Filter by URL..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className="network-method-filter"
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
        >
          <option value="">All Methods</option>
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="PATCH">PATCH</option>
          <option value="DELETE">DELETE</option>
        </select>
        <button className="network-clear-btn" onClick={handleClear}>
          Clear
        </button>
        <span className="network-count">{entries.length} requests</span>
      </div>

      <div className="network-body">
        <div className="network-list">
          <div className="network-list-header">
            <span className="network-col-method">Method</span>
            <span className="network-col-url">URL</span>
            <span className="network-col-status">Status</span>
            <span className="network-col-duration">Time</span>
            <span className="network-col-size">Size</span>
          </div>
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={`network-row ${selected?.id === entry.id ? "active" : ""}`}
              onClick={() => setSelected(entry)}
            >
              <span className="network-col-method">{entry.method}</span>
              <span className="network-col-url" title={entry.url}>
                {extractPath(entry.url)}
              </span>
              <span
                className={`network-col-status ${statusClass(entry.status_code)}`}
              >
                {entry.status_code ?? "-"}
              </span>
              <span className="network-col-duration">
                {entry.duration_ms !== null ? `${entry.duration_ms}ms` : "-"}
              </span>
              <span className="network-col-size">
                {formatSize(entry.response_body)}
              </span>
            </div>
          ))}
        </div>

        {selected && <RequestInspector entry={selected} />}
      </div>
    </div>
  );
}
