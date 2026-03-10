import { useState, useCallback } from "react";
import { applyDensity, saveDensity, type DensityMode } from "../themes/density";

interface DensityPickerProps {
  currentMode: DensityMode;
  onModeChange: (mode: DensityMode) => void;
  onClose: () => void;
}

const DENSITY_OPTIONS: {
  mode: DensityMode;
  label: string;
  description: string;
}[] = [
  {
    mode: "compact",
    label: "Compact",
    description: "Tighter spacing, smaller text — fits more on screen",
  },
  {
    mode: "comfortable",
    label: "Comfortable",
    description: "Balanced spacing and readability",
  },
  {
    mode: "spacious",
    label: "Spacious",
    description: "Generous padding, larger text — easy on the eyes",
  },
];

export function DensityPicker({
  currentMode,
  onModeChange,
  onClose,
}: DensityPickerProps) {
  const [hoveredMode, setHoveredMode] = useState<DensityMode | null>(null);

  const handleSelect = useCallback(
    async (mode: DensityMode) => {
      applyDensity(mode);
      await saveDensity(mode);
      onModeChange(mode);
      onClose();
    },
    [onModeChange, onClose],
  );

  const handleHover = useCallback(
    (mode: DensityMode | null) => {
      setHoveredMode(mode);
      if (mode) {
        applyDensity(mode);
      } else {
        applyDensity(currentMode);
      }
    },
    [currentMode],
  );

  return (
    <div
      className="density-backdrop"
      onClick={() => {
        applyDensity(currentMode);
        onClose();
      }}
    >
      <div className="density-panel" onClick={(e) => e.stopPropagation()}>
        <div className="density-header">
          <h3 className="density-title">Layout Density</h3>
          <button
            className="density-close"
            onClick={() => {
              applyDensity(currentMode);
              onClose();
            }}
          >
            &times;
          </button>
        </div>

        <div className="density-grid">
          {DENSITY_OPTIONS.map((opt) => (
            <DensityCard
              key={opt.mode}
              mode={opt.mode}
              label={opt.label}
              description={opt.description}
              isActive={opt.mode === currentMode}
              isHovered={opt.mode === hoveredMode}
              onSelect={handleSelect}
              onHover={handleHover}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DensityCard({
  mode,
  label,
  description,
  isActive,
  isHovered,
  onSelect,
  onHover,
}: {
  mode: DensityMode;
  label: string;
  description: string;
  isActive: boolean;
  isHovered: boolean;
  onSelect: (mode: DensityMode) => void;
  onHover: (mode: DensityMode | null) => void;
}) {
  const gap = mode === "compact" ? 2 : mode === "comfortable" ? 4 : 6;
  const barHeight = mode === "compact" ? 2 : mode === "comfortable" ? 3 : 4;
  const padding = mode === "compact" ? 4 : mode === "comfortable" ? 6 : 10;

  return (
    <button
      className={`density-card ${isActive ? "density-card-active" : ""} ${isHovered ? "density-card-hovered" : ""}`}
      onClick={() => onSelect(mode)}
      onMouseEnter={() => onHover(mode)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="density-preview" style={{ padding, gap }}>
        <div
          className="density-preview-bar"
          style={{ height: barHeight, width: "80%" }}
        />
        <div
          className="density-preview-bar"
          style={{ height: barHeight, width: "60%" }}
        />
        <div
          className="density-preview-bar"
          style={{ height: barHeight, width: "90%" }}
        />
        <div
          className="density-preview-bar"
          style={{ height: barHeight, width: "45%" }}
        />
        <div
          className="density-preview-bar"
          style={{ height: barHeight, width: "70%" }}
        />
      </div>
      <div className="density-card-footer">
        <span className="density-card-name">{label}</span>
        <span className="density-card-desc">{description}</span>
        {isActive && <span className="density-card-check">&#10003;</span>}
      </div>
    </button>
  );
}
