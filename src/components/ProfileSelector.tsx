import { useState, useCallback } from "react";
import * as Select from "@radix-ui/react-select";
import * as Popover from "@radix-ui/react-popover";
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
  }, [activeProfileId, profiles, onDuplicate]);

  const handleDelete = useCallback(() => {
    if (activeProfileId === null) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    onDelete(activeProfileId);
    setConfirmingDelete(false);
  }, [activeProfileId, onDelete, confirmingDelete]);

  return (
    <div className="profile-selector">
      <div className="profile-selector-row">
        <Select.Root
          value={activeProfileId !== null ? String(activeProfileId) : undefined}
          onValueChange={(val) => onSelect(Number(val))}
        >
          <Select.Trigger className="profile-select-trigger">
            <Select.Value placeholder="Select a profile..." />
            <Select.Icon className="profile-select-icon">
              <ChevronDown />
            </Select.Icon>
          </Select.Trigger>

          <Select.Portal>
            <Select.Content
              className="profile-select-content"
              position="popper"
              sideOffset={4}
            >
              <Select.Viewport className="profile-select-viewport">
                {profiles.length === 0 ? (
                  <div className="profile-select-empty">No profiles</div>
                ) : (
                  profiles.map((p) => (
                    <Select.Item
                      key={p.id}
                      value={String(p.id)}
                      className="profile-select-item"
                    >
                      <Select.ItemIndicator className="profile-select-indicator">
                        <CheckIcon />
                      </Select.ItemIndicator>
                      <Select.ItemText>{p.name}</Select.ItemText>
                    </Select.Item>
                  ))
                )}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>

        <button
          className="profile-icon-btn"
          onClick={() => setShowCreate(true)}
          title="New profile"
        >
          <PlusIcon />
        </button>

        {activeProfileId !== null && (
          <Popover.Root>
            <Popover.Trigger asChild>
              <button className="profile-icon-btn" title="Profile actions">
                <DotsIcon />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="profile-popover-content"
                sideOffset={4}
                align="end"
              >
                <button
                  className="profile-popover-item"
                  onClick={handleDuplicate}
                >
                  <CopyIcon />
                  Duplicate
                </button>
                <div className="profile-popover-separator" />
                <button
                  className="profile-popover-item profile-popover-danger"
                  onClick={handleDelete}
                >
                  <TrashIcon />
                  {confirmingDelete ? "Confirm delete?" : "Delete"}
                </button>
                {confirmingDelete && (
                  <button
                    className="profile-popover-item"
                    onClick={() => setConfirmingDelete(false)}
                  >
                    Cancel
                  </button>
                )}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
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

/* ── Inline SVG icons (no extra deps) ── */

function ChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M3 4.5L6 7.5L9 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M2.5 6L5 8.5L9.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M7 3V11M3 7H11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="3.5" r="1" fill="currentColor" />
      <circle cx="7" cy="7" r="1" fill="currentColor" />
      <circle cx="7" cy="10.5" r="1" fill="currentColor" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect
        x="4.5"
        y="4.5"
        width="7"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M8.5 4.5V2.5C8.5 1.67 7.83 1 7 1H2.5C1.67 1 1 1.67 1 2.5V7C1 7.83 1.67 8.5 2.5 8.5H4.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path
        d="M2 3.5H11M4.5 3.5V2.5C4.5 1.95 4.95 1.5 5.5 1.5H7.5C8.05 1.5 8.5 1.95 8.5 2.5V3.5M5.5 6V9.5M7.5 6V9.5M3 3.5L3.5 10.5C3.5 11.05 3.95 11.5 4.5 11.5H8.5C9.05 11.5 9.5 11.05 9.5 10.5L10 3.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
