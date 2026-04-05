import { useCallback, useEffect, useRef } from "react";
import "../styles/project-tabs.css";

export interface ProjectTab {
  id: number;
  name: string;
}

interface ProjectTabBarProps {
  tabs: ProjectTab[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onClose: (id: number) => void;
}

export function ProjectTabBar({
  tabs,
  activeId,
  onSelect,
  onClose,
}: ProjectTabBarProps) {
  const tabsRef = useRef<HTMLDivElement>(null);

  // Scroll active tab into view when it changes
  useEffect(() => {
    const el = tabsRef.current?.querySelector(
      ".project-tab--active",
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);

  const handleClose = useCallback(
    (e: React.MouseEvent, id: number) => {
      e.stopPropagation();
      onClose(id);
    },
    [onClose],
  );

  if (tabs.length === 0) return null;

  return (
    <div className="project-tab-bar" ref={tabsRef}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`project-tab${tab.id === activeId ? " project-tab--active" : ""}`}
          onClick={() => onSelect(tab.id)}
          type="button"
          title={tab.name}
        >
          <span className="project-tab__name">{tab.name}</span>
          {tabs.length > 1 && (
            <span
              className="project-tab__close"
              role="button"
              aria-label={`Close ${tab.name}`}
              onClick={(e) => handleClose(e, tab.id)}
            >
              ×
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
