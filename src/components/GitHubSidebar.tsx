import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RepoPull {
  number: number;
  title: string;
  html_url: string;
  state: string;
  draft: boolean;
  user_login: string;
  updated_at: string;
  head_branch: string;
  labels: string[];
}

interface RepoIssue {
  number: number;
  title: string;
  html_url: string;
  state: string;
  user_login: string;
  updated_at: string;
  labels: Array<{ name: string; color: string }>;
}

interface RepoEvent {
  id: string;
  event_type: string;
  actor_login: string;
  created_at: string;
  payload_action: string | null;
  payload_title: string | null;
  payload_number: number | null;
}

type Tab = "prs" | "issues" | "activity";

interface GitHubSidebarProps {
  projectId: number | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));

  if (diffSec < 60) return "just now";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "\u2026" : text;
}

function openUrl(url: string): void {
  // Try Tauri shell open first, fall back to window.open
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tauri = (window as any).__TAURI__;
    if (tauri?.shell?.open) {
      tauri.shell.open(url);
      return;
    }
  } catch {
    // ignore
  }
  window.open(url, "_blank", "noopener");
}

function isAuthError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return (
    msg.includes("auth") ||
    msg.includes("token") ||
    msg.includes("unauthorized") ||
    msg.includes("401") ||
    msg.includes("not authenticated") ||
    // 404 from GitHub API without a token likely means a private repo
    msg.includes("404")
  );
}

function eventIcon(eventType: string, action: string | null): string {
  switch (eventType) {
    case "PushEvent":
      return "\u2191"; // up arrow
    case "PullRequestEvent":
      if (action === "opened") return "\u271A"; // heavy plus
      if (action === "closed") return "\u2715"; // multiplication x
      if (action === "merged" || action === "closed") return "\u2713"; // check
      return "\u21C4"; // left-right arrows
    case "IssuesEvent":
      if (action === "opened") return "\u25CB"; // circle
      if (action === "closed") return "\u25CF"; // filled circle
      return "\u25CB";
    case "IssueCommentEvent":
      return "\u275D"; // quote
    case "PullRequestReviewEvent":
      return "\u2606"; // star
    case "CreateEvent":
      return "+";
    case "DeleteEvent":
      return "\u2212"; // minus
    case "ForkEvent":
      return "\u2442"; // fork
    case "WatchEvent":
      return "\u2605"; // filled star
    default:
      return "\u00B7"; // middle dot
  }
}

function eventDescription(event: RepoEvent): string {
  const { event_type, payload_action, payload_title, payload_number } = event;

  switch (event_type) {
    case "PushEvent":
      return "pushed commits";
    case "PullRequestEvent":
      return `${payload_action ?? "updated"} PR${payload_number ? " #" + payload_number : ""}${payload_title ? ": " + truncate(payload_title, 40) : ""}`;
    case "IssuesEvent":
      return `${payload_action ?? "updated"} issue${payload_number ? " #" + payload_number : ""}${payload_title ? ": " + truncate(payload_title, 40) : ""}`;
    case "IssueCommentEvent":
      return `commented on${payload_number ? " #" + payload_number : ""}`;
    case "PullRequestReviewEvent":
      return `reviewed PR${payload_number ? " #" + payload_number : ""}`;
    case "CreateEvent":
      return `created ${payload_action ?? "ref"}`;
    case "DeleteEvent":
      return `deleted ${payload_action ?? "ref"}`;
    case "ForkEvent":
      return "forked the repo";
    case "WatchEvent":
      return "starred the repo";
    default:
      return event_type.replace("Event", "").toLowerCase();
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface DeviceCodeInfo {
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval: number;
}

export function GitHubSidebar({ projectId }: GitHubSidebarProps) {
  const [activeTab, setActiveTab] = useState<Tab>("prs");
  const [collapsed, setCollapsed] = useState(false);

  // Local sign-in state — managed here so we can call fetchData directly on success
  const [patInput, setPatInput] = useState("");
  const [showPatForm, setShowPatForm] = useState(false);
  const [deviceCode, setDeviceCode] = useState<DeviceCodeInfo | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  // Data
  const [pulls, setPulls] = useState<RepoPull[]>([]);
  const [issues, setIssues] = useState<RepoIssue[]>([]);
  const [events, setEvents] = useState<RepoEvent[]>([]);

  // State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  /* ---- Fetch data for the active tab ---- */
  const fetchData = useCallback(
    async (tab: Tab, showSpinner = true) => {
      if (projectId === null) return;

      if (showSpinner) setLoading(true);
      setError(null);
      setAuthError(false);

      try {
        switch (tab) {
          case "prs": {
            const data = await invoke<RepoPull[]>("list_repo_pulls", {
              projectId,
            });
            setPulls(data);
            break;
          }
          case "issues": {
            const data = await invoke<RepoIssue[]>("list_repo_issues", {
              projectId,
            });
            setIssues(data);
            break;
          }
          case "activity": {
            const data = await invoke<RepoEvent[]>("get_repo_activity", {
              projectId,
            });
            setEvents(data);
            break;
          }
        }
      } catch (err) {
        if (isAuthError(err)) {
          setAuthError(true);
        } else {
          setError(String(err));
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [projectId],
  );

  /* ---- On tab / project change, fetch fresh data ---- */
  useEffect(() => {
    fetchData(activeTab);
  }, [activeTab, fetchData]);

  /* ---- Sign-in handlers — call fetchData directly on success ---- */
  const handleDeviceFlow = useCallback(async () => {
    setSigningIn(true);
    setSignInError(null);
    try {
      const dc = await invoke<DeviceCodeInfo>("github_start_device_flow");
      setDeviceCode(dc);
      setSigningIn(false);
      invoke("github_poll_for_token", {
        deviceCode: dc.device_code,
        interval: dc.interval,
      })
        .then(() => {
          setDeviceCode(null);
          setAuthError(false);
          fetchData(activeTab);
        })
        .catch((err: unknown) => {
          setDeviceCode(null);
          setSignInError(String(err));
        });
    } catch (err: unknown) {
      setSigningIn(false);
      setSignInError(String(err));
    }
  }, [activeTab, fetchData]);

  const handlePatSubmit = useCallback(async () => {
    if (!patInput.trim()) return;
    setSigningIn(true);
    setSignInError(null);
    try {
      await invoke("github_store_pat", { token: patInput.trim() });
      setPatInput("");
      setShowPatForm(false);
      setAuthError(false);
      fetchData(activeTab);
    } catch (err: unknown) {
      setSignInError(String(err));
    } finally {
      setSigningIn(false);
    }
  }, [patInput, activeTab, fetchData]);

  /* ---- Auto-refresh every 60 seconds ---- */
  useEffect(() => {
    if (projectId === null) return;

    intervalRef.current = setInterval(() => {
      fetchData(activeTab, false);
    }, 60_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeTab, fetchData, projectId]);

  /* ---- Manual refresh ---- */
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData(activeTab);
  }, [activeTab, fetchData]);

  /* ---- Collapsed state ---- */
  if (collapsed) {
    return (
      <div className="gh-sidebar gh-sidebar--collapsed">
        <button
          className="gh-sidebar__expand-btn"
          onClick={() => setCollapsed(false)}
          title="Expand GitHub sidebar"
        >
          {"\u276E"}
        </button>
      </div>
    );
  }

  /* ---- Null project ---- */
  if (projectId === null) {
    return (
      <div className="gh-sidebar">
        <div className="gh-sidebar__header">
          <span className="gh-sidebar__title">GitHub</span>
          <div className="gh-sidebar__header-actions">
            <button
              className="gh-sidebar__icon-btn"
              onClick={() => setCollapsed(true)}
              title="Collapse"
            >
              {"\u276F"}
            </button>
          </div>
        </div>
        <div className="gh-sidebar__empty">Select a project</div>
      </div>
    );
  }

  return (
    <div className="gh-sidebar">
      {/* Header */}
      <div className="gh-sidebar__header">
        <span className="gh-sidebar__title">GitHub</span>
        <div className="gh-sidebar__header-actions">
          <button
            className={`gh-sidebar__icon-btn${refreshing ? " gh-sidebar__icon-btn--spin" : ""}`}
            onClick={handleRefresh}
            title="Refresh"
            disabled={loading}
          >
            {"\u21BB"}
          </button>
          <button
            className="gh-sidebar__icon-btn"
            onClick={() => setCollapsed(true)}
            title="Collapse"
          >
            {"\u276F"}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="gh-sidebar__tabs">
        {(["prs", "issues", "activity"] as const).map((tab) => (
          <button
            key={tab}
            className={`gh-sidebar__tab${activeTab === tab ? " gh-sidebar__tab--active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "prs" ? "PRs" : tab === "issues" ? "Issues" : "Activity"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="gh-sidebar__content">
        {authError ? (
          <div className="gh-sidebar__auth-panel">
            <svg
              width="28"
              height="28"
              viewBox="0 0 28 28"
              fill="none"
              aria-hidden="true"
              style={{ margin: "0 auto 8px", display: "block" }}
            >
              <circle
                cx="14"
                cy="10"
                r="4.5"
                stroke="var(--text-muted)"
                strokeWidth="1.5"
              />
              <path
                d="M5 24c0-4.97 4.03-9 9-9s9 4.03 9 9"
                stroke="var(--text-muted)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <p className="gh-sidebar__auth-msg">
              Sign in to GitHub to view {activeTab} for this private repo.
            </p>

            {deviceCode ? (
              <div className="gh-sidebar__device-flow">
                <p className="gh-sidebar__device-hint">
                  Go to <strong>github.com/login/device</strong> and enter:
                </p>
                <div className="gh-sidebar__device-code">
                  {deviceCode.user_code}
                </div>
                <p className="gh-sidebar__device-waiting">
                  Waiting for authorization…
                </p>
              </div>
            ) : showPatForm ? (
              <div className="gh-sidebar__pat-form">
                <input
                  type="password"
                  className="gh-sidebar__pat-input"
                  placeholder="ghp_xxxxxxxxxxxx"
                  value={patInput}
                  onChange={(e) => setPatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handlePatSubmit();
                  }}
                  autoFocus
                />
                {signInError && (
                  <p className="gh-sidebar__auth-error">{signInError}</p>
                )}
                <div className="gh-sidebar__pat-actions">
                  <button
                    className="gh-sidebar__signin-btn"
                    onClick={handlePatSubmit}
                    disabled={!patInput.trim() || signingIn}
                  >
                    {signingIn ? "Saving…" : "Save Token"}
                  </button>
                  <button
                    className="gh-sidebar__signin-btn gh-sidebar__signin-btn--secondary"
                    onClick={() => {
                      setShowPatForm(false);
                      setSignInError(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="gh-sidebar__signin-options">
                {signInError && (
                  <p className="gh-sidebar__auth-error">{signInError}</p>
                )}
                <button
                  className="gh-sidebar__signin-btn"
                  onClick={handleDeviceFlow}
                  disabled={signingIn}
                >
                  {signingIn ? "Starting…" : "Sign in with GitHub"}
                </button>
                <button
                  className="gh-sidebar__signin-btn gh-sidebar__signin-btn--secondary"
                  onClick={() => setShowPatForm(true)}
                >
                  Use Access Token
                </button>
              </div>
            )}
          </div>
        ) : loading && !refreshing ? (
          <div className="gh-sidebar__loading">Loading...</div>
        ) : error ? (
          <div className="gh-sidebar__error">{error}</div>
        ) : (
          <>
            {activeTab === "prs" && <PullsList pulls={pulls} />}
            {activeTab === "issues" && <IssuesList issues={issues} />}
            {activeTab === "activity" && <ActivityList events={events} />}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function PullsList({ pulls }: { pulls: RepoPull[] }) {
  if (pulls.length === 0) {
    return <div className="gh-sidebar__empty">No open pull requests</div>;
  }

  return (
    <div className="gh-sidebar__list">
      {pulls.map((pr) => (
        <button
          key={pr.number}
          className="gh-sidebar__row"
          onClick={() => openUrl(pr.html_url)}
          title={pr.title}
        >
          <span className="gh-sidebar__row-left">
            <span
              className={`gh-sidebar__status-dot gh-sidebar__status-dot--${prStatusClass(pr)}`}
            />
            <span className="gh-sidebar__number">#{pr.number}</span>
            <span className="gh-sidebar__row-title">
              {truncate(pr.title, 48)}
            </span>
          </span>
          <span className="gh-sidebar__row-right">
            {pr.draft && (
              <span className="gh-sidebar__badge gh-sidebar__badge--draft">
                draft
              </span>
            )}
            <span className="gh-sidebar__meta">{pr.user_login}</span>
            <span className="gh-sidebar__time">
              {relativeTime(pr.updated_at)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function prStatusClass(pr: RepoPull): string {
  if (pr.draft) return "gray";
  if (pr.state === "closed") return "red";
  // Infer from labels as a rough heuristic for CI status
  const lower = pr.labels.map((l) => l.toLowerCase());
  if (lower.some((l) => l.includes("fail") || l.includes("error")))
    return "red";
  if (lower.some((l) => l.includes("pending") || l.includes("wip")))
    return "yellow";
  return "green";
}

function IssuesList({ issues }: { issues: RepoIssue[] }) {
  if (issues.length === 0) {
    return <div className="gh-sidebar__empty">No open issues</div>;
  }

  return (
    <div className="gh-sidebar__list">
      {issues.map((issue) => (
        <button
          key={issue.number}
          className="gh-sidebar__row"
          onClick={() => openUrl(issue.html_url)}
          title={issue.title}
        >
          <span className="gh-sidebar__row-left">
            <span
              className={`gh-sidebar__status-dot gh-sidebar__status-dot--${issue.state === "open" ? "green" : "red"}`}
            />
            <span className="gh-sidebar__number">#{issue.number}</span>
            {issue.labels.length > 0 && (
              <span className="gh-sidebar__label-dots">
                {issue.labels.slice(0, 3).map((label, i) => (
                  <span
                    key={i}
                    className="gh-sidebar__label-dot"
                    style={{ backgroundColor: `#${label.color}` }}
                    title={label.name}
                  />
                ))}
              </span>
            )}
            <span className="gh-sidebar__row-title">
              {truncate(issue.title, 44)}
            </span>
          </span>
          <span className="gh-sidebar__row-right">
            <span className="gh-sidebar__meta">{issue.user_login}</span>
            <span className="gh-sidebar__time">
              {relativeTime(issue.updated_at)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function ActivityList({ events }: { events: RepoEvent[] }) {
  if (events.length === 0) {
    return <div className="gh-sidebar__empty">No recent activity</div>;
  }

  return (
    <div className="gh-sidebar__list">
      {events.map((event) => (
        <div key={event.id} className="gh-sidebar__event">
          <span className="gh-sidebar__event-icon">
            {eventIcon(event.event_type, event.payload_action)}
          </span>
          <span className="gh-sidebar__event-body">
            <span className="gh-sidebar__event-actor">{event.actor_login}</span>{" "}
            <span className="gh-sidebar__event-desc">
              {eventDescription(event)}
            </span>
          </span>
          <span className="gh-sidebar__time">
            {relativeTime(event.created_at)}
          </span>
        </div>
      ))}
    </div>
  );
}
