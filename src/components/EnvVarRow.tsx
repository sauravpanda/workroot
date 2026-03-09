import { useState, useCallback } from "react";
import type { DecryptedEnvVar } from "../hooks/useEnvVault";

interface EnvVarRowProps {
  envVar: DecryptedEnvVar;
  onUpdate: (id: number, key: string, value: string) => void;
  onDelete: (id: number) => void;
}

export function EnvVarRow({ envVar, onUpdate, onDelete }: EnvVarRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showValue, setShowValue] = useState(false);
  const [editKey, setEditKey] = useState(envVar.key);
  const [editValue, setEditValue] = useState(envVar.value);

  const handleSave = useCallback(() => {
    if (editKey.trim()) {
      onUpdate(envVar.id, editKey.trim(), editValue);
      setIsEditing(false);
    }
  }, [envVar.id, editKey, editValue, onUpdate]);

  const handleCancel = useCallback(() => {
    setEditKey(envVar.key);
    setEditValue(envVar.value);
    setIsEditing(false);
  }, [envVar.key, envVar.value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSave();
      if (e.key === "Escape") handleCancel();
    },
    [handleSave, handleCancel],
  );

  if (isEditing) {
    return (
      <div className="env-var-row env-var-editing">
        <input
          className="env-var-key-input"
          value={editKey}
          onChange={(e) => setEditKey(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="KEY"
          autoFocus
        />
        <input
          className="env-var-value-input"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="value"
        />
        <div className="env-var-actions">
          <button className="env-var-save-btn" onClick={handleSave}>
            Save
          </button>
          <button className="env-var-cancel-btn" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="env-var-row">
      <span className="env-var-key">{envVar.key}</span>
      <span className="env-var-value" onClick={() => setShowValue(!showValue)}>
        {showValue
          ? envVar.value
          : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}
      </span>
      <div className="env-var-actions">
        <button
          className="env-var-edit-btn"
          onClick={() => setIsEditing(true)}
          title="Edit"
        >
          Edit
        </button>
        <button
          className="env-var-delete-btn"
          onClick={() => onDelete(envVar.id)}
          title="Delete"
        >
          Del
        </button>
      </div>
    </div>
  );
}
