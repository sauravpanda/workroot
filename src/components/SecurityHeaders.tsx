import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/security-headers.css";

interface HeaderCheck {
  header: string;
  present: boolean;
  value: string | null;
  recommendation: string;
}

interface SecurityHeadersProps {
  onClose: () => void;
}

export function SecurityHeaders({ onClose }: SecurityHeadersProps) {
  const [url, setUrl] = useState("");
  const [checks, setChecks] = useState<HeaderCheck[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);

  const handleScan = useCallback(async () => {
    if (!url.trim()) return;
    setLoading(true);
    try {
      const result = await invoke<HeaderCheck[]>("check_security_headers", {
        url: url.trim(),
      });
      setChecks(result);
      setScanned(true);
    } catch {
      setChecks([]);
      setScanned(true);
    }
    setLoading(false);
  }, [url]);

  const presentCount = checks.filter((c) => c.present).length;
  const missingCount = checks.filter((c) => !c.present).length;

  return (
    <div className="secheaders-backdrop" onClick={onClose}>
      <div className="secheaders-panel" onClick={(e) => e.stopPropagation()}>
        <div className="secheaders-header">
          <h3 className="secheaders-title">Security Headers</h3>
          <button className="secheaders-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="secheaders-controls">
          <input
            className="secheaders-url"
            type="text"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleScan();
            }}
          />
          <button
            className="secheaders-scan-btn"
            onClick={handleScan}
            disabled={loading || !url.trim()}
          >
            {loading ? "Scanning..." : "Scan"}
          </button>
        </div>

        <div className="secheaders-body">
          {!scanned && !loading ? (
            <div className="secheaders-empty">
              Enter a URL and click Scan to check security headers.
            </div>
          ) : loading ? (
            <div className="secheaders-empty">Checking headers...</div>
          ) : checks.length === 0 ? (
            <div className="secheaders-empty">Could not retrieve headers.</div>
          ) : (
            <>
              <div className="secheaders-summary">
                <span className="secheaders-badge secheaders-present">
                  {presentCount} present
                </span>
                <span className="secheaders-badge secheaders-missing">
                  {missingCount} missing
                </span>
              </div>

              <div className="secheaders-list">
                {checks.map((check) => (
                  <div
                    key={check.header}
                    className={`secheaders-item ${check.present ? "" : "secheaders-item-missing"}`}
                  >
                    <span
                      className={`secheaders-status-icon ${check.present ? "secheaders-icon-ok" : "secheaders-icon-bad"}`}
                    >
                      {check.present ? "\u2713" : "\u2717"}
                    </span>
                    <div className="secheaders-item-info">
                      <span className="secheaders-name">{check.header}</span>
                      {check.present && check.value && (
                        <code className="secheaders-value">{check.value}</code>
                      )}
                      {!check.present && (
                        <span className="secheaders-rec">
                          {check.recommendation}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
