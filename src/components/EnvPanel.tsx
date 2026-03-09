import { useState, useCallback } from "react";
import { useEnvVault } from "../hooks/useEnvVault";
import { EnvVarRow } from "./EnvVarRow";
import { ProfileSelector } from "./ProfileSelector";

interface EnvPanelProps {
  projectId: number;
}

export function EnvPanel({ projectId }: EnvPanelProps) {
  const {
    profiles,
    activeProfileId,
    setActiveProfileId,
    envVars,
    isLoading,
    error,
    createProfile,
    deleteProfile,
    duplicateProfile,
    addEnvVar,
    updateEnvVar,
    deleteEnvVar,
  } = useEnvVault(projectId);

  const [showAddVar, setShowAddVar] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const handleAddVar = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (newKey.trim()) {
        addEnvVar(newKey.trim(), newValue);
        setNewKey("");
        setNewValue("");
        setShowAddVar(false);
      }
    },
    [newKey, newValue, addEnvVar],
  );

  return (
    <div className="env-panel">
      <div className="env-panel-header">
        <h3 className="env-panel-title">Environment Variables</h3>
      </div>

      {error && <div className="env-panel-error">{error}</div>}

      <ProfileSelector
        profiles={profiles}
        activeProfileId={activeProfileId}
        onSelect={setActiveProfileId}
        onCreate={createProfile}
        onDelete={deleteProfile}
        onDuplicate={duplicateProfile}
      />

      {activeProfileId === null ? (
        <div className="env-panel-empty">
          Create a profile to start managing environment variables.
        </div>
      ) : (
        <div className="env-var-list">
          {isLoading && <div className="env-panel-loading">Loading...</div>}

          {!isLoading && envVars.length === 0 && !showAddVar && (
            <div className="env-panel-empty">
              No variables in this profile. Add one to get started.
            </div>
          )}

          {envVars.map((v) => (
            <EnvVarRow
              key={v.id}
              envVar={v}
              onUpdate={updateEnvVar}
              onDelete={deleteEnvVar}
            />
          ))}

          {showAddVar ? (
            <form className="env-var-add-form" onSubmit={handleAddVar}>
              <input
                className="env-var-key-input"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="KEY"
                autoFocus
              />
              <input
                className="env-var-value-input"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="value"
              />
              <div className="env-var-actions">
                <button type="submit" className="env-var-save-btn">
                  Add
                </button>
                <button
                  type="button"
                  className="env-var-cancel-btn"
                  onClick={() => setShowAddVar(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              className="env-var-add-btn"
              onClick={() => setShowAddVar(true)}
            >
              + Add Variable
            </button>
          )}
        </div>
      )}
    </div>
  );
}
