import { useState, useCallback } from "react";
import type { EnvProfile } from "../hooks/useEnvVault";

interface ProfileSelectorProps {
  profiles: EnvProfile[];
  activeProfileId: number | null;
  onSelect: (id: number) => void;
  onCreate: (name: string) => void;
  onDelete: (id: number) => void;
  onDuplicate: (sourceId: number, newName: string) => void;
}

export function ProfileSelector({
  profiles,
  activeProfileId,
  onSelect,
  onCreate,
  onDelete,
  onDuplicate,
}: ProfileSelectorProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [showMenu, setShowMenu] = useState(false);

  const handleCreate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (newName.trim()) {
        onCreate(newName.trim());
        setNewName("");
        setShowCreate(false);
      }
    },
    [newName, onCreate],
  );

  const handleDuplicate = useCallback(() => {
    if (activeProfileId === null) return;
    const activeProfile = profiles.find((p) => p.id === activeProfileId);
    if (!activeProfile) return;
    onDuplicate(activeProfileId, `${activeProfile.name} (copy)`);
    setShowMenu(false);
  }, [activeProfileId, profiles, onDuplicate]);

  const handleDelete = useCallback(() => {
    if (activeProfileId === null) return;
    setShowMenu(false);
    onDelete(activeProfileId);
  }, [activeProfileId, onDelete]);

  return (
    <div className="profile-selector">
      <div className="profile-selector-row">
        <select
          className="profile-dropdown"
          value={activeProfileId ?? ""}
          onChange={(e) => onSelect(Number(e.target.value))}
        >
          {profiles.length === 0 && <option value="">No profiles</option>}
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <button
          className="profile-new-btn"
          onClick={() => setShowCreate(true)}
          title="New profile"
        >
          +
        </button>

        {activeProfileId !== null && (
          <div className="profile-menu-wrapper">
            <button
              className="profile-menu-btn"
              onClick={() => setShowMenu(!showMenu)}
              title="Profile actions"
            >
              &#8943;
            </button>
            {showMenu && (
              <>
                <div
                  className="context-menu-backdrop"
                  onClick={() => setShowMenu(false)}
                />
                <div className="context-menu profile-context-menu">
                  <button
                    className="context-menu-item"
                    onClick={handleDuplicate}
                  >
                    Duplicate
                  </button>
                  <div className="context-menu-separator" />
                  <button
                    className="context-menu-item destructive"
                    onClick={handleDelete}
                  >
                    Delete Profile
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {showCreate && (
        <form className="profile-create-form" onSubmit={handleCreate}>
          <input
            className="profile-create-input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Profile name..."
            autoFocus
          />
          <button type="submit" className="profile-create-submit">
            Create
          </button>
          <button
            type="button"
            className="profile-create-cancel"
            onClick={() => setShowCreate(false)}
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
