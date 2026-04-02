import "../styles/dashboard.css";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DashboardProps {
  projectId: number | null;
  onAction: (action: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Quick-action card descriptors                                      */
/* ------------------------------------------------------------------ */

interface CardDescriptor {
  action: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const CARDS: CardDescriptor[] = [
  {
    action: "terminal",
    title: "Open Terminal",
    description: "Launch a shell in your project",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="2 4 6 8 2 12" />
        <line x1="8" y1="12" x2="14" y2="12" />
      </svg>
    ),
  },
  {
    action: "git",
    title: "Git Changes",
    description: "View diffs, stage, and commit",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="8" cy="3" r="1.5" />
        <circle cx="8" cy="13" r="1.5" />
        <circle cx="13" cy="8" r="1.5" />
        <path d="M8 4.5v3.5c0 1.1.9 2 2 2h1.5" />
        <line x1="8" y1="8" x2="8" y2="11.5" />
      </svg>
    ),
  },
  {
    action: "ai",
    title: "AI Chat",
    description: "Ask questions about your code",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 2l2 3.5L4 7" />
        <path d="M12 2l-2 3.5L12 7" />
        <path d="M5.5 10.5c0 0 1.2 1.5 2.5 1.5s2.5-1.5 2.5-1.5" />
        <circle cx="8" cy="8" r="6.5" />
      </svg>
    ),
  },
  {
    action: "search",
    title: "Search Everything",
    description: "Find files, code, and commands",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="6.5" cy="6.5" r="4.5" />
        <line x1="10" y1="10" x2="14" y2="14" />
      </svg>
    ),
  },
  {
    action: "security",
    title: "Security Audit",
    description: "Scan for vulnerabilities",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 1L2 4v4c0 3.5 2.5 6.5 6 7.5 3.5-1 6-4 6-7.5V4L8 1z" />
        <polyline points="5.5 8 7 9.5 10.5 6" />
      </svg>
    ),
  },
  {
    action: "docker",
    title: "Docker",
    description: "Manage containers and images",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="1" y="7" width="14" height="6" rx="1" />
        <rect x="3" y="4" width="3" height="3" />
        <rect x="6.5" y="4" width="3" height="3" />
        <rect x="6.5" y="1" width="3" height="3" />
        <rect x="10" y="4" width="3" height="3" />
      </svg>
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Shortcut descriptors                                               */
/* ------------------------------------------------------------------ */

interface ShortcutDescriptor {
  keys: string;
  label: string;
}

const SHORTCUTS: ShortcutDescriptor[] = [
  { keys: "\u2318K", label: "Command Palette" },
  { keys: "\u2318J", label: "AI Chat" },
  { keys: "\u2318P", label: "Search" },
  { keys: "\u2318E", label: "Explorer" },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Dashboard({ projectId, onAction }: DashboardProps) {
  return (
    <div className="dashboard">
      {/* -- Header -- */}
      <div className="dashboard-header">
        <h1 className="dashboard-title">Welcome to Workroot</h1>
        <p className="dashboard-subtitle">Local Intelligence Platform</p>
        {projectId !== null && (
          <div className="dashboard-project">
            <span className="dashboard-project-dot" />
            Project #{projectId}
          </div>
        )}
      </div>

      {/* -- Quick Actions Grid -- */}
      <div className="dashboard-grid">
        {CARDS.map((card) => (
          <div
            key={card.action}
            className="dashboard-card"
            role="button"
            tabIndex={0}
            onClick={() => onAction(card.action)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onAction(card.action);
              }
            }}
          >
            <div className="dashboard-card-icon">{card.icon}</div>
            <div className="dashboard-card-content">
              <span className="dashboard-card-title">{card.title}</span>
              <p className="dashboard-card-desc">{card.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* -- Keyboard Shortcuts -- */}
      <div className="dashboard-shortcuts">
        {SHORTCUTS.map((s, i) => (
          <span key={s.keys} className="dashboard-shortcut">
            {i > 0 && <span className="dashboard-shortcut-sep">&middot;</span>}
            <kbd>{s.keys}</kbd>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
