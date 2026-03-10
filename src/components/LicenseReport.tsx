import { useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/license-report.css";

interface LicenseEntry {
  package_name: string;
  version: string;
  license: string;
  category: "permissive" | "copyleft" | "unknown";
}

interface LicenseReportProps {
  cwd: string;
  onClose: () => void;
}

export function LicenseReport({ cwd, onClose }: LicenseReportProps) {
  const [entries, setEntries] = useState<LicenseEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);

  const handleScan = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<LicenseEntry[]>("check_licenses", { cwd });
      setEntries(result);
      setScanned(true);
    } catch {
      setEntries([]);
      setScanned(true);
    }
    setLoading(false);
  }, [cwd]);

  const grouped = useMemo(() => {
    const groups: Record<string, LicenseEntry[]> = {
      permissive: [],
      copyleft: [],
      unknown: [],
    };
    for (const entry of entries) {
      const cat = groups[entry.category];
      if (cat) cat.push(entry);
    }
    return groups;
  }, [entries]);

  const CATEGORY_META: Record<string, { label: string; className: string }> = {
    permissive: { label: "Permissive", className: "license-cat-permissive" },
    copyleft: { label: "Copyleft", className: "license-cat-copyleft" },
    unknown: { label: "Unknown", className: "license-cat-unknown" },
  };

  return (
    <div className="license-backdrop" onClick={onClose}>
      <div className="license-panel" onClick={(e) => e.stopPropagation()}>
        <div className="license-header">
          <h3 className="license-title">License Report</h3>
          <div className="license-header-actions">
            <button
              className="license-run-btn"
              onClick={handleScan}
              disabled={loading}
            >
              {loading ? "Scanning..." : "Check Licenses"}
            </button>
            <button className="license-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        <div className="license-body">
          {!scanned && !loading ? (
            <div className="license-empty">
              Click &quot;Check Licenses&quot; to scan dependencies.
            </div>
          ) : loading ? (
            <div className="license-empty">Scanning licenses...</div>
          ) : entries.length === 0 ? (
            <div className="license-empty">No license data found.</div>
          ) : (
            Object.entries(grouped).map(([category, items]) => {
              if (items.length === 0) return null;
              const meta = CATEGORY_META[category];
              return (
                <div key={category} className="license-group">
                  <div
                    className={`license-group-label ${meta?.className ?? ""}`}
                  >
                    {meta?.label ?? category} ({items.length})
                  </div>
                  <table className="license-table">
                    <thead>
                      <tr>
                        <th className="license-th">Package</th>
                        <th className="license-th">Version</th>
                        <th className="license-th">License</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((entry) => (
                        <tr
                          key={`${entry.package_name}@${entry.version}`}
                          className="license-row"
                        >
                          <td className="license-td license-pkg">
                            {entry.package_name}
                          </td>
                          <td className="license-td license-ver">
                            {entry.version}
                          </td>
                          <td className="license-td license-lic">
                            {entry.license}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
