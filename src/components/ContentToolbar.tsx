import "../styles/content-toolbar.css";

interface ContentToolbarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  worktreeName: string;
  projectName?: string;
}

const TABS = [
  {
    id: "terminal",
    label: "Terminal",
    icon: (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
        <path d="M4.5 6l2.5 2-2.5 2" />
        <path d="M8.5 10.5h3" />
      </svg>
    ),
  },
  {
    id: "changes",
    label: "Changes",
    icon: (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 2v12" />
        <path d="M4 6l4-4 4 4" />
        <path d="M3 10h10" />
      </svg>
    ),
  },
  {
    id: "pr",
    label: "PR",
    icon: (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="5" cy="3.5" r="1.5" />
        <circle cx="5" cy="12.5" r="1.5" />
        <circle cx="11" cy="12.5" r="1.5" />
        <path d="M5 5v6" />
        <path d="M11 5v6" />
        <path d="M11 5c0-1.5-1-2-3-2" />
      </svg>
    ),
  },
  {
    id: "tests",
    label: "Tests",
    icon: (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3.5 8.5l3 3 6-7" />
      </svg>
    ),
  },
  {
    id: "security",
    label: "Security",
    icon: (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 1.5L2.5 4v4c0 3.5 2.5 5.5 5.5 6.5 3-1 5.5-3 5.5-6.5V4L8 1.5z" />
      </svg>
    ),
  },
  {
    id: "docker",
    label: "Docker",
    icon: (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="1.5" y="6" width="13" height="7" rx="1" />
        <path d="M4 6V4.5a1 1 0 011-1h6a1 1 0 011 1V6" />
        <path d="M5.5 9h0" />
        <path d="M8 9h0" />
        <path d="M10.5 9h0" />
      </svg>
    ),
  },
] as const;

export function ContentToolbar({
  activeTab,
  onTabChange,
  worktreeName,
  projectName,
}: ContentToolbarProps) {
  return (
    <div className="content-toolbar">
      <div className="content-toolbar__breadcrumb">
        {projectName && (
          <>
            <span className="content-toolbar__breadcrumb-project">
              {projectName}
            </span>
            <span className="content-toolbar__breadcrumb-separator">/</span>
          </>
        )}
        <span className="content-toolbar__breadcrumb-worktree">
          {worktreeName}
        </span>
      </div>

      <div className="content-toolbar__divider" />

      <div className="content-toolbar__tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`content-toolbar__tab${activeTab === tab.id ? " content-toolbar__tab--active" : ""}`}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            <span className="content-toolbar__tab-icon">{tab.icon}</span>
            <span className="content-toolbar__tab-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
