import { useState, useRef, useEffect } from "react";

interface TrafficEntry {
  id: number;
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

interface RequestInspectorProps {
  entry: TrafficEntry;
}

function statusClass(code: number | null): string {
  if (!code) return "";
  if (code >= 200 && code < 300) return "s2xx";
  if (code >= 300 && code < 400) return "s3xx";
  if (code >= 400 && code < 500) return "s4xx";
  return "s5xx";
}

function formatBody(body: string | null): string {
  if (!body) return "(empty)";
  try {
    const parsed = JSON.parse(body);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return body;
  }
}

function buildCurl(entry: TrafficEntry): string {
  let curl = `curl -X ${entry.method} '${entry.url}'`;
  if (entry.request_headers) {
    for (const line of entry.request_headers.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) {
        curl += ` \\\n  -H '${trimmed}'`;
      }
    }
  }
  if (entry.request_body) {
    curl += ` \\\n  -d '${entry.request_body.replace(/'/g, "'\\''")}'`;
  }
  return curl;
}

export function RequestInspector({ entry }: RequestInspectorProps) {
  const [tab, setTab] = useState<"request" | "response">("response");
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const copyAsCurl = async () => {
    try {
      await navigator.clipboard.writeText(buildCurl(entry));
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  };

  return (
    <div className="request-inspector">
      <div className="inspector-header">
        <div className="inspector-method-status">
          <span className="inspector-method">{entry.method}</span>
          {entry.status_code && (
            <span
              className={`inspector-status ${statusClass(entry.status_code)}`}
            >
              {entry.status_code}
            </span>
          )}
        </div>
        {entry.duration_ms !== null && (
          <span className="inspector-duration">{entry.duration_ms}ms</span>
        )}
      </div>

      <div className="inspector-url">{entry.url}</div>

      <div className="inspector-tabs">
        <button
          className={`inspector-tab ${tab === "request" ? "active" : ""}`}
          onClick={() => setTab("request")}
        >
          Request
        </button>
        <button
          className={`inspector-tab ${tab === "response" ? "active" : ""}`}
          onClick={() => setTab("response")}
        >
          Response
        </button>
      </div>

      <div className="inspector-body">
        {tab === "request" ? (
          <>
            {entry.request_headers && (
              <>
                <div className="inspector-section-title">Headers</div>
                <div className="inspector-headers">{entry.request_headers}</div>
              </>
            )}
            <div className="inspector-section-title">Body</div>
            <div>{formatBody(entry.request_body)}</div>
            <button className="inspector-copy-btn" onClick={copyAsCurl}>
              {copied ? "Copied!" : "Copy as cURL"}
            </button>
          </>
        ) : (
          <>
            {entry.response_headers && (
              <>
                <div className="inspector-section-title">Headers</div>
                <div className="inspector-headers">
                  {entry.response_headers}
                </div>
              </>
            )}
            <div className="inspector-section-title">Body</div>
            <div>{formatBody(entry.response_body)}</div>
          </>
        )}
      </div>
    </div>
  );
}
