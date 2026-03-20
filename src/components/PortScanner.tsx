import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface PortResult {
  port: number;
  open: boolean;
  service: string;
}

interface PortScannerProps {
  onClose: () => void;
}

const DEFAULT_PORTS = [
  3000, 3001, 4000, 4444, 5173, 5174, 8080, 8888, 9999, 5432, 3306, 6379, 27017,
  11434,
];

export function PortScanner({ onClose }: PortScannerProps) {
  const [results, setResults] = useState<PortResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customPort, setCustomPort] = useState("");
  const [extraPorts, setExtraPorts] = useState<number[]>([]);

  const scan = useCallback(async (ports: number[]) => {
    setLoading(true);
    setError(null);
    try {
      const r = await invoke<PortResult[]>("scan_local_ports", { ports });
      setResults(r);
    } catch (e) {
      setError(String(e));
      setResults([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    scan([...DEFAULT_PORTS, ...extraPorts]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScan = useCallback(() => {
    scan([...DEFAULT_PORTS, ...extraPorts]);
  }, [scan, extraPorts]);

  const handleAddPort = useCallback(() => {
    const p = parseInt(customPort, 10);
    if (
      !isNaN(p) &&
      p > 0 &&
      p <= 65535 &&
      !DEFAULT_PORTS.includes(p) &&
      !extraPorts.includes(p)
    ) {
      setExtraPorts((prev) => [...prev, p]);
      setCustomPort("");
    }
  }, [customPort, extraPorts]);

  const openPorts = results.filter((r) => r.open);
  const closedPorts = results.filter((r) => !r.open);

  return (
    <div className="portscan-backdrop" onClick={onClose}>
      <div className="portscan-panel" onClick={(e) => e.stopPropagation()}>
        <div className="portscan-header">
          <h3 className="portscan-title">Port Scanner</h3>
          <div className="portscan-header-actions">
            <button
              className="portscan-scan-btn"
              onClick={handleScan}
              disabled={loading}
            >
              {loading ? "Scanning..." : "Scan"}
            </button>
            <button className="portscan-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        <div className="portscan-body">
          {error && <div className="portscan-error">{error}</div>}

          <div className="portscan-custom-row">
            <input
              className="portscan-custom-input"
              type="number"
              placeholder="Add port (1-65535)"
              value={customPort}
              min={1}
              max={65535}
              onChange={(e) => setCustomPort(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddPort();
              }}
            />
            <button
              className="portscan-add-btn"
              onClick={handleAddPort}
              disabled={!customPort.trim()}
            >
              Add
            </button>
            {extraPorts.length > 0 && (
              <span className="portscan-extra-label">
                +{extraPorts.length} custom
              </span>
            )}
          </div>

          {loading && (
            <div className="portscan-scanning">
              <div className="portscan-sweep" />
              <span>Scanning ports...</span>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="portscan-results">
              {openPorts.length > 0 && (
                <div className="portscan-section">
                  <h4 className="portscan-section-title">
                    Open ({openPorts.length})
                  </h4>
                  <table className="portscan-table">
                    <thead>
                      <tr>
                        <th>Port</th>
                        <th>Status</th>
                        <th>Service</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openPorts.map((r) => (
                        <tr key={r.port} className="portscan-row-open">
                          <td className="portscan-port">{r.port}</td>
                          <td>
                            <span className="portscan-dot portscan-dot-open" />
                            Open
                          </td>
                          <td className="portscan-service">{r.service}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="portscan-section">
                <h4 className="portscan-section-title">
                  Closed ({closedPorts.length})
                </h4>
                <table className="portscan-table">
                  <thead>
                    <tr>
                      <th>Port</th>
                      <th>Status</th>
                      <th>Service</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedPorts.map((r) => (
                      <tr key={r.port} className="portscan-row-closed">
                        <td className="portscan-port">{r.port}</td>
                        <td>
                          <span className="portscan-dot portscan-dot-closed" />
                          Closed
                        </td>
                        <td className="portscan-service">{r.service}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!loading && results.length === 0 && !error && (
            <div className="portscan-empty">
              Click &quot;Scan&quot; to check local ports.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
