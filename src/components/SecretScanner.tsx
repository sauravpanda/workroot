import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/secret-scanner.css";

interface SecretFinding {
  file: string;
  line: number;
  secret_type: string;
  snippet: string;
  acknowledged: boolean;
}

interface SecretScannerProps {
  cwd: string;
  onClose: () => void;
}

export function SecretScanner({ cwd, onClose }: SecretScannerProps) {
  const [findings, setFindings] = useState<SecretFinding[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<SecretFinding[]>("scan_for_secrets", {
        cwd,
      });
      setFindings(result);
      setScanned(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Scan failed unexpectedly.";
      setError(message);
      setScanned(false);
    }
    setLoading(false);
  }, [cwd]);

  const handleAcknowledge = useCallback((index: number) => {
    setFindings((prev) =>
      prev.map((f, i) => (i === index ? { ...f, acknowledged: true } : f)),
    );
  }, []);

  const activeFindings = findings.filter((f) => !f.acknowledged);
  const acknowledgedFindings = findings.filter((f) => f.acknowledged);

  return (
    <div className="secretscan-backdrop" onClick={onClose}>
      <div className="secretscan-panel" onClick={(e) => e.stopPropagation()}>
        <div className="secretscan-header">
          <h3 className="secretscan-title">Secret Scanner</h3>
          <div className="secretscan-header-actions">
            <button
              className="secretscan-run-btn"
              onClick={handleScan}
              disabled={loading}
            >
              {loading ? "Scanning..." : "Scan"}
            </button>
            <button className="secretscan-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        <div className="secretscan-body">
          {error ? (
            <div className="secretscan-empty secretscan-error">
              <span>Scan failed: {error}</span>
              <button
                className="secretscan-retry-btn"
                onClick={handleScan}
                disabled={loading}
              >
                Retry
              </button>
            </div>
          ) : !scanned && !loading ? (
            <div className="secretscan-empty">
              Click &quot;Scan&quot; to check for exposed secrets.
            </div>
          ) : loading ? (
            <div className="secretscan-empty">Scanning for secrets...</div>
          ) : findings.length === 0 ? (
            <div className="secretscan-empty secretscan-clean">
              No secrets detected.
            </div>
          ) : (
            <>
              {activeFindings.length > 0 && (
                <div className="secretscan-section">
                  <div className="secretscan-section-label">
                    Findings ({activeFindings.length})
                  </div>
                  {activeFindings.map((f, idx) => {
                    const realIdx = findings.indexOf(f);
                    return (
                      <div key={idx} className="secretscan-finding">
                        <div className="secretscan-finding-info">
                          <span className="secretscan-type">
                            {f.secret_type}
                          </span>
                          <span className="secretscan-location">
                            {f.file}:{f.line}
                          </span>
                          <code className="secretscan-snippet">
                            {f.snippet}
                          </code>
                        </div>
                        <button
                          className="secretscan-ack-btn"
                          onClick={() => handleAcknowledge(realIdx)}
                        >
                          Ignore
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {acknowledgedFindings.length > 0 && (
                <div className="secretscan-section">
                  <div className="secretscan-section-label secretscan-ack-label">
                    Acknowledged ({acknowledgedFindings.length})
                  </div>
                  {acknowledgedFindings.map((f, idx) => (
                    <div
                      key={idx}
                      className="secretscan-finding secretscan-finding-ack"
                    >
                      <div className="secretscan-finding-info">
                        <span className="secretscan-type">{f.secret_type}</span>
                        <span className="secretscan-location">
                          {f.file}:{f.line}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
