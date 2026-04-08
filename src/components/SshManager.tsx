import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/ssh-manager.css";
import { Dialog, DialogContent } from "./ui/dialog";

interface SshConnection {
  id: number;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: "key" | "password";
  key_path: string | null;
  jump_host: string | null;
}

interface SshManagerProps {
  onClose: () => void;
  onConnect: (command: string) => void;
}

interface FormState {
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: "key" | "password";
  key_path: string;
  jump_host: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  host: "",
  port: 22,
  username: "",
  auth_type: "key",
  key_path: "",
  jump_host: "",
};

export function SshManager({ onClose, onConnect }: SshManagerProps) {
  const [connections, setConnections] = useState<SshConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, boolean>>({});

  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<SshConnection[]>("list_ssh_connections");
      setConnections(result);
    } catch {
      setConnections([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const handleSubmit = useCallback(async () => {
    if (!form.name.trim() || !form.host.trim() || !form.username.trim()) return;
    try {
      if (editingId !== null) {
        await invoke("update_ssh_connection", {
          id: editingId,
          name: form.name.trim(),
          host: form.host.trim(),
          port: form.port,
          username: form.username.trim(),
          auth_type: form.auth_type,
          key_path: form.key_path.trim() || null,
          jump_host: form.jump_host.trim() || null,
        });
      } else {
        await invoke("create_ssh_connection", {
          name: form.name.trim(),
          host: form.host.trim(),
          port: form.port,
          username: form.username.trim(),
          auth_type: form.auth_type,
          key_path: form.key_path.trim() || null,
          jump_host: form.jump_host.trim() || null,
        });
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      setEditingId(null);
      await loadConnections();
    } catch {
      // save failed
    }
  }, [form, editingId, loadConnections]);

  const handleEdit = useCallback((conn: SshConnection) => {
    setEditingId(conn.id);
    setForm({
      name: conn.name,
      host: conn.host,
      port: conn.port,
      username: conn.username,
      auth_type: conn.auth_type,
      key_path: conn.key_path ?? "",
      jump_host: conn.jump_host ?? "",
    });
    setShowForm(true);
  }, []);

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await invoke("delete_ssh_connection", { id });
        await loadConnections();
      } catch {
        // delete failed
      }
    },
    [loadConnections],
  );

  const handleConnect = useCallback(
    async (id: number) => {
      try {
        const command = await invoke<string>("build_ssh_command", { id });
        onConnect(command);
      } catch {
        // build command failed
      }
    },
    [onConnect],
  );

  const handleTest = useCallback(async (conn: SshConnection) => {
    setTestingId(conn.id);
    try {
      const success = await invoke<boolean>("test_ssh_connection", {
        host: conn.host,
        port: conn.port,
      });
      setTestResults((prev) => ({ ...prev, [conn.id]: success }));
    } catch {
      setTestResults((prev) => ({ ...prev, [conn.id]: false }));
    }
    setTestingId(null);
  }, []);

  const handleCancel = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }, []);

  const updateField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="ssh-panel" aria-label="SSH Connections">
        <div className="ssh-header">
          <h3 className="ssh-title">SSH Connection Manager</h3>
          <div className="ssh-header-actions">
            <button
              className="ssh-add-btn"
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY_FORM);
                setShowForm(true);
              }}
            >
              + Add Connection
            </button>
            <button className="ssh-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        {showForm && (
          <div className="ssh-form">
            <div className="ssh-form-row">
              <input
                className="ssh-input"
                type="text"
                placeholder="Connection name"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                spellCheck={false}
              />
            </div>
            <div className="ssh-form-row ssh-form-row-multi">
              <input
                className="ssh-input ssh-input-flex"
                type="text"
                placeholder="Host"
                value={form.host}
                onChange={(e) => updateField("host", e.target.value)}
                spellCheck={false}
              />
              <input
                className="ssh-input ssh-input-port"
                type="number"
                placeholder="Port"
                value={form.port}
                onChange={(e) =>
                  updateField("port", parseInt(e.target.value) || 22)
                }
              />
              <input
                className="ssh-input ssh-input-flex"
                type="text"
                placeholder="Username"
                value={form.username}
                onChange={(e) => updateField("username", e.target.value)}
                spellCheck={false}
              />
            </div>
            <div className="ssh-form-row ssh-form-row-multi">
              <label className="ssh-radio-label">
                <input
                  type="radio"
                  name="authType"
                  checked={form.auth_type === "key"}
                  onChange={() => updateField("auth_type", "key")}
                />
                <span>Key</span>
              </label>
              <label className="ssh-radio-label">
                <input
                  type="radio"
                  name="authType"
                  checked={form.auth_type === "password"}
                  onChange={() => updateField("auth_type", "password")}
                />
                <span>Password</span>
              </label>
              {form.auth_type === "key" && (
                <input
                  className="ssh-input ssh-input-flex"
                  type="text"
                  placeholder="Key path (e.g. ~/.ssh/id_rsa)"
                  value={form.key_path}
                  onChange={(e) => updateField("key_path", e.target.value)}
                  spellCheck={false}
                />
              )}
            </div>
            <div className="ssh-form-row">
              <input
                className="ssh-input"
                type="text"
                placeholder="Jump host (optional, e.g. user@bastion:22)"
                value={form.jump_host}
                onChange={(e) => updateField("jump_host", e.target.value)}
                spellCheck={false}
              />
            </div>
            <div className="ssh-form-actions">
              <button className="ssh-cancel-btn" onClick={handleCancel}>
                Cancel
              </button>
              <button
                className="ssh-save-btn"
                onClick={handleSubmit}
                disabled={
                  !form.name.trim() ||
                  !form.host.trim() ||
                  !form.username.trim()
                }
              >
                {editingId !== null ? "Update" : "Save"}
              </button>
            </div>
          </div>
        )}

        <div className="ssh-list">
          {loading ? (
            <div className="ssh-empty">Loading connections...</div>
          ) : connections.length === 0 ? (
            <div className="ssh-empty">
              No SSH connections configured. Click &quot;Add Connection&quot; to
              create one.
            </div>
          ) : (
            connections.map((conn) => {
              const tested = conn.id in testResults;
              const testPassed = testResults[conn.id];
              return (
                <div
                  key={conn.id}
                  className={`ssh-conn ${tested ? (testPassed ? "ssh-conn-ok" : "ssh-conn-fail") : ""}`}
                >
                  <div className="ssh-conn-icon">&gt;_</div>
                  <div className="ssh-conn-info">
                    <div className="ssh-conn-name">{conn.name}</div>
                    <div className="ssh-conn-detail">
                      <span className="ssh-conn-addr">
                        {conn.username}@{conn.host}:{conn.port}
                      </span>
                      <span
                        className={`ssh-conn-badge ssh-badge-${conn.auth_type}`}
                      >
                        {conn.auth_type}
                      </span>
                      {conn.jump_host && (
                        <span className="ssh-conn-jump">
                          via {conn.jump_host}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ssh-conn-status">
                    {tested &&
                      (testPassed ? (
                        <span className="ssh-test-pass">&#10003;</span>
                      ) : (
                        <span className="ssh-test-fail">&#10007;</span>
                      ))}
                  </div>
                  <div className="ssh-conn-actions">
                    <button
                      className="ssh-action-btn"
                      onClick={() => handleConnect(conn.id)}
                    >
                      Connect
                    </button>
                    <button
                      className="ssh-action-btn"
                      onClick={() => handleTest(conn)}
                      disabled={testingId === conn.id}
                    >
                      {testingId === conn.id ? "Testing..." : "Test"}
                    </button>
                    <button
                      className="ssh-action-btn"
                      onClick={() => handleEdit(conn)}
                    >
                      Edit
                    </button>
                    <button
                      className="ssh-action-btn ssh-action-danger"
                      onClick={() => handleDelete(conn.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
