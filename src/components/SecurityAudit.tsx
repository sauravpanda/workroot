import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/security-audit.css";

interface Vulnerability {
  package_name: string;
  version: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  advisory_url: string | null;
}

interface AuditResult {
  critical: number;
  high: number;
  medium: number;
  low: number;
  vulnerabilities: Vulnerability[];
}

interface SecurityAuditProps {
  cwd: string;
  onClose: () => void;
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function SecurityAudit({ cwd, onClose }: SecurityAuditProps) {
  const [result, setResult] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await invoke<AuditResult>("audit_dependencies", { cwd });
      r.vulnerabilities.sort(
        (a, b) =>
          (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4),
      );
      setResult(r);
    } catch (e) {
      setError(String(e));
      setResult(null);
    }
    setLoading(false);
  }, [cwd]);

  return (
    <div className="secaudit-backdrop" onClick={onClose}>
      <div className="secaudit-panel" onClick={(e) => e.stopPropagation()}>
        <div className="secaudit-header">
          <h3 className="secaudit-title">Security Audit</h3>
          <div className="secaudit-header-actions">
            <button
              className="secaudit-run-btn"
              onClick={handleRun}
              disabled={loading}
            >
              {loading ? "Scanning..." : "Run Audit"}
            </button>
            <button className="secaudit-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        <div className="secaudit-body">
          {error && <div className="secaudit-error">{error}</div>}

          {result ? (
            <>
              <div className="secaudit-summary">
                <div className="secaudit-count secaudit-critical">
                  <span className="secaudit-count-num">{result.critical}</span>
                  <span className="secaudit-count-label">Critical</span>
                </div>
                <div className="secaudit-count secaudit-high">
                  <span className="secaudit-count-num">{result.high}</span>
                  <span className="secaudit-count-label">High</span>
                </div>
                <div className="secaudit-count secaudit-medium">
                  <span className="secaudit-count-num">{result.medium}</span>
                  <span className="secaudit-count-label">Medium</span>
                </div>
                <div className="secaudit-count secaudit-low">
                  <span className="secaudit-count-num">{result.low}</span>
                  <span className="secaudit-count-label">Low</span>
                </div>
              </div>

              <div className="secaudit-list">
                {result.vulnerabilities.length === 0 ? (
                  <div className="secaudit-empty">
                    No vulnerabilities found.
                  </div>
                ) : (
                  result.vulnerabilities.map((v, i) => (
                    <div key={i} className="secaudit-vuln">
                      <span
                        className={`secaudit-severity secaudit-sev-${v.severity}`}
                      >
                        {v.severity}
                      </span>
                      <div className="secaudit-vuln-info">
                        <span className="secaudit-pkg">
                          {v.package_name}@{v.version}
                        </span>
                        <span className="secaudit-desc">{v.description}</span>
                      </div>
                      {v.advisory_url && (
                        <a
                          className="secaudit-link"
                          href={v.advisory_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Details
                        </a>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          ) : !loading ? (
            <div className="secaudit-empty">
              Click &quot;Run Audit&quot; to scan dependencies for
              vulnerabilities.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
