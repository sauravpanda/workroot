import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as Popover from "@radix-ui/react-popover";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { open as openShell } from "@tauri-apps/plugin-shell";
import { useAgentDetail } from "../hooks/useAgentDetail";
import { clientFor, type ThreadEvent, type Turn } from "../lib/helm-api";
import "../styles/agent-detail.css";

interface AgentDetailPaneProps {
  machineId: number | null;
  agentId: string | null;
  onClose: () => void;
  /** Called after a successful DELETE so the parent can drop selection
   *  before the next poll catches up. */
  onDeleted?: () => void;
}

const TERMINAL_STATES = new Set(["done", "failed"]);
// States where the agent is actively doing something — used to surface a
// "thinking" / typing-bubble at the bottom of the events list.
const ACTIVE_STATES = new Set(["working", "planning", "queued"]);

const ACTIVE_STATE_LABEL: Record<string, string> = {
  working: "Agent is working",
  planning: "Agent is planning",
  queued: "Agent is queued",
};

// How many lines to keep visible from a long stdout/result before truncating.
// We show the first half + last half, joined by an ellipsis row.
const RESULT_PREVIEW_LINES = 14;

// Distance from the bottom (px) within which we still consider the user
// "at the bottom." Slack uses ~24; matches visual intuition.
const STICKY_THRESHOLD_PX = 24;

type ToolUseEv = Extract<ThreadEvent, { kind: "tool_use" }>;
type ToolResultEv = Extract<ThreadEvent, { kind: "tool_result" }>;

type RenderItem =
  | {
      type: "message";
      key: string;
      role: "user" | "assistant" | "thinking";
      text: string;
      at: string;
    }
  | {
      type: "tool";
      key: string;
      toolUse: ToolUseEv;
      toolResult: ToolResultEv | null;
    }
  | { type: "turn"; key: string; turn: Turn };

function formatCost(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function safeJsonParse(s: string): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function prettyJson(s: string): string {
  const parsed = safeJsonParse(s);
  if (parsed === null) return s;
  try {
    return JSON.stringify(parsed, null, 2);
  } catch {
    return s;
  }
}

function buildItems(detail: {
  thread_events?: ThreadEvent[];
  turns: Turn[];
}): RenderItem[] {
  const events = detail.thread_events ?? [];
  if (events.length === 0) {
    return detail.turns.map((t, i) => ({
      type: "turn",
      key: `turn:${i}:${t.at}`,
      turn: t,
    }));
  }

  // Index results by their tool_use_id so the renderer can pair them.
  const resultById = new Map<string, ToolResultEv>();
  for (const e of events) {
    if (e.kind === "tool_result") resultById.set(e.tool_use_id, e);
  }

  const items: RenderItem[] = [];
  for (const e of events) {
    if (e.kind === "tool_result") continue; // emitted alongside its tool_use
    if (e.kind === "tool_use") {
      items.push({
        type: "tool",
        key: `tool:${e.id}`,
        toolUse: e,
        toolResult: resultById.get(e.id) ?? null,
      });
    } else {
      items.push({
        type: "message",
        key: `${e.kind}:${e.at}`,
        role: e.kind,
        text: e.text,
        at: e.at,
      });
    }
  }
  return items;
}

// One-line summary for a tool call, derived from the tool name + parsed args.
// The point is intent over arguments — the args live behind the chevron.
function toolSummary(t: ToolUseEv): { kind: string; summary: string } {
  const args = asRecord(safeJsonParse(t.input)) ?? {};
  const name = t.tool;
  const lower = name.toLowerCase();

  if (lower === "bash" || lower.includes("shell")) {
    const cmd = asString(args.command);
    return { kind: "bash", summary: cmd ? `$ ${cmd}` : "$" };
  }
  if (lower === "read") {
    const fp = asString(args.file_path) || asString(args.path);
    const offset = typeof args.offset === "number" ? args.offset : null;
    const limit = typeof args.limit === "number" ? args.limit : null;
    const range =
      offset != null && limit != null
        ? ` (lines ${offset}–${offset + limit})`
        : "";
    return { kind: "read", summary: `${fp}${range}` };
  }
  if (lower === "write") {
    const fp = asString(args.file_path) || asString(args.path);
    return { kind: "write", summary: fp };
  }
  if (lower === "edit") {
    const fp = asString(args.file_path) || asString(args.path);
    return { kind: "edit", summary: fp };
  }
  if (lower === "grep") {
    const pat = asString(args.pattern);
    const path = asString(args.path);
    return {
      kind: "grep",
      summary: path ? `"${pat}" in ${path}` : `"${pat}"`,
    };
  }
  if (lower === "glob") {
    const pat = asString(args.pattern);
    return { kind: "glob", summary: pat };
  }
  if (lower === "webfetch" || lower === "web_fetch") {
    return { kind: "web", summary: asString(args.url) };
  }
  if (lower === "websearch" || lower === "web_search") {
    return { kind: "web", summary: asString(args.query) };
  }
  if (lower.startsWith("mcp__") || lower.includes(":")) {
    return { kind: "mcp", summary: t.title || lower };
  }
  return { kind: "generic", summary: t.title || name };
}

// Trim a long result body for the collapsed view: keep the first half and
// last half, drop the middle behind a "… N lines hidden" marker. Returns
// the trimmed text and how many lines were hidden.
function trimResult(
  text: string,
  maxLines: number,
): { display: string; hiddenCount: number } {
  const lines = text.split("\n");
  if (lines.length <= maxLines) {
    return { display: text, hiddenCount: 0 };
  }
  const half = Math.floor(maxLines / 2);
  const head = lines.slice(0, half);
  const tail = lines.slice(lines.length - half);
  const hidden = lines.length - head.length - tail.length;
  const display = [...head, `… ${hidden} lines hidden …`, ...tail].join("\n");
  return { display, hiddenCount: hidden };
}

// ----- subcomponents -----

function MessageItem({
  role,
  text,
  expanded,
  onToggle,
}: {
  role: "user" | "assistant" | "thinking";
  text: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (role === "thinking") {
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    return (
      <div className="agent-detail__msg agent-detail__msg--thinking">
        <button
          type="button"
          className="agent-detail__msg-toggle"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span className="agent-detail__chevron">{expanded ? "▾" : "▸"}</span>
          thinking ({wordCount} words)
        </button>
        {expanded && <div className="agent-detail__msg-body">{text}</div>}
      </div>
    );
  }
  return (
    <div
      className={
        role === "user"
          ? "agent-detail__msg agent-detail__msg--user"
          : "agent-detail__msg agent-detail__msg--assistant"
      }
    >
      <div className="agent-detail__msg-body">{text}</div>
    </div>
  );
}

function ToolItem({
  toolUse,
  toolResult,
  expanded,
  onToggle,
}: {
  toolUse: ToolUseEv;
  toolResult: ToolResultEv | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { kind, summary } = useMemo(() => toolSummary(toolUse), [toolUse]);
  const hasError = toolResult?.is_error === true;
  const trimmed = useMemo(
    () =>
      toolResult
        ? trimResult(toolResult.preview, RESULT_PREVIEW_LINES)
        : { display: "", hiddenCount: 0 },
    [toolResult],
  );

  const wrapClass = [
    "agent-detail__tool",
    `agent-detail__tool--${kind}`,
    hasError ? "is-error" : "",
    !toolResult ? "is-pending" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapClass}>
      <button
        type="button"
        className="agent-detail__tool-head"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="agent-detail__chevron">{expanded ? "▾" : "▸"}</span>
        <span className="agent-detail__tool-name">{toolUse.tool}</span>
        <span className="agent-detail__tool-summary">{summary}</span>
        {!toolResult && (
          <span className="agent-detail__tool-pending">running…</span>
        )}
        {hasError && <span className="agent-detail__tool-err-tag">error</span>}
      </button>

      {expanded && (
        <div className="agent-detail__tool-args">
          <pre>{prettyJson(toolUse.input)}</pre>
        </div>
      )}

      {toolResult && (
        <div className="agent-detail__tool-result">
          <pre>{expanded ? toolResult.preview : trimmed.display}</pre>
          {!expanded && trimmed.hiddenCount > 0 && (
            <button
              type="button"
              className="agent-detail__tool-show-all"
              onClick={onToggle}
            >
              show all ({trimmed.hiddenCount} more lines)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TurnItem({ turn }: { turn: Turn }) {
  return (
    <div
      className={
        turn.role === "user"
          ? "agent-detail__msg agent-detail__msg--user"
          : "agent-detail__msg agent-detail__msg--assistant"
      }
    >
      <div className="agent-detail__msg-body">{turn.content}</div>
    </div>
  );
}

// ----- main component -----

export function AgentDetailPane({
  machineId,
  agentId,
  onClose,
  onDeleted,
}: AgentDetailPaneProps) {
  const { detail, machine, loading, error, refresh } = useAgentDetail(
    machineId,
    agentId,
  );
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<"reply" | "kill" | "delete" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Per-item expansion state. Keyed by the stable RenderItem.key so a 3 s
  // poll re-render doesn't wipe what the user has open.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggleExpanded = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const items = useMemo<RenderItem[]>(
    () => (detail ? buildItems(detail) : []),
    [detail],
  );

  // ---- auto-scroll plumbing ----
  // The events container scrolls; the rest of the pane is fixed. We follow
  // the Slack/iMessage pattern: only auto-scroll when the user is already
  // at the bottom; otherwise count "unseen" items and surface a pill.
  const eventsRef = useRef<HTMLDivElement>(null);
  const userAtBottomRef = useRef(true);
  // Fingerprint = item.key + (for tool pairs) whether the result has arrived,
  // so a tool that finishes is treated as a *new* signal even though its key
  // didn't change.
  const seenFingerprintsRef = useRef<Set<string>>(new Set());
  const [unseen, setUnseen] = useState(0);

  const fingerprint = useCallback((it: RenderItem): string => {
    if (it.type === "tool") {
      return `${it.key}|${it.toolResult ? "res" : "pend"}`;
    }
    return it.key;
  }, []);

  const markAllSeen = useCallback(() => {
    const set = seenFingerprintsRef.current;
    for (const it of items) set.add(fingerprint(it));
    setUnseen(0);
  }, [items, fingerprint]);

  const scrollToBottom = useCallback(() => {
    const el = eventsRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    userAtBottomRef.current = true;
    markAllSeen();
  }, [markAllSeen]);

  const onEventsScroll = useCallback(() => {
    const el = eventsRef.current;
    if (!el) return;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < STICKY_THRESHOLD_PX;
    userAtBottomRef.current = atBottom;
    if (atBottom && unseen !== 0) markAllSeen();
  }, [unseen, markAllSeen]);

  // Reset everything when the user picks a different agent.
  useEffect(() => {
    seenFingerprintsRef.current = new Set();
    userAtBottomRef.current = true;
    setUnseen(0);
    setExpanded(new Set());
  }, [machineId, agentId]);

  // After every render that changes items: scroll if at bottom, else count
  // the new ones into `unseen`. Runs in useLayoutEffect so we measure the
  // post-DOM scrollHeight before paint.
  useLayoutEffect(() => {
    if (items.length === 0) return;
    const el = eventsRef.current;
    if (!el) return;

    const seen = seenFingerprintsRef.current;
    const isFirstPaint = seen.size === 0;

    if (isFirstPaint) {
      // Initial render of a freshly selected agent — jump to bottom and
      // mark everything seen.
      el.scrollTop = el.scrollHeight;
      for (const it of items) seen.add(fingerprint(it));
      userAtBottomRef.current = true;
      return;
    }

    if (userAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      for (const it of items) seen.add(fingerprint(it));
      if (unseen !== 0) setUnseen(0);
      return;
    }

    let added = 0;
    for (const it of items) {
      if (!seen.has(fingerprint(it))) added += 1;
    }
    if (added !== unseen) setUnseen(added);
    // Don't add to `seen` here — these are the ones the pill is counting.
    // They'll get marked seen when the user scrolls back to bottom or
    // clicks the pill.
  }, [items, fingerprint, unseen]);

  if (machineId === null || agentId === null) {
    return (
      <aside className="agent-detail">
        <p className="agent-detail__empty">Select an agent to inspect.</p>
      </aside>
    );
  }

  // Open the system file picker and append "[attached: <abs path>]" to
  // the reply text. The daemon's /reply endpoint accepts only a string
  // body, so we can't actually upload bytes — but inserting the absolute
  // path is enough for the agent to use its Read tool on the file
  // (works for code, text, JSON, images Claude can see, etc).
  const attachFiles = async () => {
    let picked: string | string[] | null = null;
    try {
      picked = await openDialog({ multiple: true });
    } catch (e) {
      setActionError(`Attach failed: ${e}`);
      return;
    }
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    if (paths.length === 0) return;
    const lines = paths.map((p) => `[attached: ${p}]`).join("\n");
    setReply((prev) => (prev.trim() ? `${prev}\n${lines}\n` : `${lines}\n`));
  };

  const sendReply = async () => {
    if (!machine || !detail || !reply.trim()) return;
    setBusy("reply");
    setActionError(null);
    try {
      await clientFor(machine).replyAgent(detail.id, reply);
      setReply("");
      refresh();
    } catch (e) {
      setActionError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const kill = async () => {
    if (!machine || !detail) return;
    if (!window.confirm(`Kill agent "${detail.name}"?`)) return;
    setBusy("kill");
    setActionError(null);
    try {
      await clientFor(machine).killAgent(detail.id);
      refresh();
    } catch (e) {
      setActionError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      setActionError(`Copy failed: ${e}`);
    }
  };

  const openPath = async (path: string) => {
    try {
      await openShell(path);
    } catch (e) {
      setActionError(`Open failed: ${e}`);
    }
  };

  const remove = async () => {
    if (!machine || !detail) return;
    if (
      !window.confirm(
        `Delete agent "${detail.name}"? This removes the worktree, logs, and DB row.`,
      )
    )
      return;
    setBusy("delete");
    setActionError(null);
    try {
      await clientFor(machine).deleteAgent(detail.id);
      onDeleted?.();
      onClose();
    } catch (e) {
      setActionError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const isTerminal = detail ? TERMINAL_STATES.has(detail.state) : false;
  // Replying to a terminal Claude agent resumes it (the daemon supports
  // this — same behavior the helm phone app uses). Codex backends are
  // still gated since their session-resume story differs.
  const canReply = !!detail && detail.backend === "claude";
  const hasTranscript = items.length > 0;

  return (
    <aside className="agent-detail">
      <header className="agent-detail__header">
        {detail && (
          <span
            className={`agent-detail__state-pill agent-detail__state-pill--${detail.state}`}
            title={detail.state}
          >
            {detail.state}
          </span>
        )}
        <span className="agent-detail__name" title={detail?.name ?? undefined}>
          {detail?.name ?? "Loading…"}
        </span>
        {detail && (
          <>
            <span className="agent-detail__sep">·</span>
            <span
              className="agent-detail__crumb"
              title={`${detail.repo}:${detail.branch}`}
            >
              {detail.repo}:{detail.branch}
            </span>
            <span className="agent-detail__sep">@</span>
            <span
              className="agent-detail__crumb"
              title={machine?.label ?? detail.machine_name}
            >
              {machine?.label ?? detail.machine_name}
            </span>
          </>
        )}
        <span className="agent-detail__spacer" />
        {detail && (
          <Popover.Root>
            <Popover.Trigger asChild>
              <button
                className="agent-detail__icon-btn"
                aria-label="More actions"
                title="More actions"
              >
                ⋯
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="agent-detail__menu"
                sideOffset={4}
                align="end"
              >
                <button
                  type="button"
                  className="agent-detail__menu-item"
                  onClick={() => void kill()}
                  disabled={isTerminal || busy !== null}
                >
                  {busy === "kill" ? "Killing…" : "Kill"}
                </button>
                <button
                  type="button"
                  className="agent-detail__menu-item agent-detail__menu-item--danger"
                  onClick={() => void remove()}
                  disabled={!isTerminal || busy !== null}
                  title={
                    isTerminal
                      ? "Delete agent"
                      : "Kill the agent before deleting"
                  }
                >
                  {busy === "delete" ? "Deleting…" : "Delete"}
                </button>
                <div className="agent-detail__menu-sep" />
                <button
                  type="button"
                  className="agent-detail__menu-item"
                  onClick={() => void copyText(detail.id)}
                >
                  Copy agent ID
                </button>
                {detail.worktree_path && (
                  <>
                    <button
                      type="button"
                      className="agent-detail__menu-item"
                      onClick={() => void copyText(detail.worktree_path)}
                    >
                      Copy worktree path
                    </button>
                    <button
                      type="button"
                      className="agent-detail__menu-item"
                      onClick={() => void openPath(detail.worktree_path)}
                    >
                      Open worktree in Finder
                    </button>
                  </>
                )}
                {detail.pr_url && (
                  <button
                    type="button"
                    className="agent-detail__menu-item"
                    onClick={() => void openPath(detail.pr_url!)}
                  >
                    Open PR
                  </button>
                )}
                <div className="agent-detail__menu-sep" />
                <button
                  type="button"
                  className="agent-detail__menu-item"
                  onClick={() => refresh()}
                >
                  Refresh
                </button>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        )}
        <button
          className="agent-detail__icon-btn"
          onClick={onClose}
          aria-label="Close pane"
          title="Close pane"
        >
          ×
        </button>
      </header>

      {actionError && <p className="agent-detail__error">{actionError}</p>}
      {error && <p className="agent-detail__error">{error}</p>}

      {detail?.pending_question && (
        <div className="agent-detail__pending">
          <span className="agent-detail__pending-label">Pending question</span>
          {detail.pending_question}
        </div>
      )}

      {detail?.pr_url && (
        <a
          className="agent-detail__pr"
          href={detail.pr_url}
          target="_blank"
          rel="noreferrer"
        >
          {detail.pr_url}
        </a>
      )}

      <div className="agent-detail__events-wrap">
        <div
          className="agent-detail__events"
          ref={eventsRef}
          onScroll={onEventsScroll}
        >
          {loading && !detail ? (
            <p className="agent-detail__loading">Loading…</p>
          ) : !hasTranscript && detail ? (
            <p className="agent-detail__empty">
              No transcript yet — agent hasn't produced output.
            </p>
          ) : (
            items.map((it) => {
              if (it.type === "turn") {
                return <TurnItem key={it.key} turn={it.turn} />;
              }
              if (it.type === "message") {
                return (
                  <MessageItem
                    key={it.key}
                    role={it.role}
                    text={it.text}
                    expanded={expanded.has(it.key)}
                    onToggle={() => toggleExpanded(it.key)}
                  />
                );
              }
              return (
                <ToolItem
                  key={it.key}
                  toolUse={it.toolUse}
                  toolResult={it.toolResult}
                  expanded={expanded.has(it.key)}
                  onToggle={() => toggleExpanded(it.key)}
                />
              );
            })
          )}
          {detail && ACTIVE_STATES.has(detail.state) && (
            <div
              className="agent-detail__working"
              aria-live="polite"
              aria-label={ACTIVE_STATE_LABEL[detail.state] ?? "Agent is busy"}
            >
              <span className="agent-detail__working-dots">
                <span />
                <span />
                <span />
              </span>
              <span className="agent-detail__working-label">
                {ACTIVE_STATE_LABEL[detail.state] ?? "working"}
              </span>
            </div>
          )}
        </div>

        {unseen > 0 && (
          <button
            type="button"
            className="agent-detail__new-pill"
            onClick={scrollToBottom}
            aria-label={`Scroll to ${unseen} new events`}
          >
            ↓ {unseen} new
          </button>
        )}
      </div>

      {detail?.usage && (
        <div className="agent-detail__usage">
          <span>
            in {formatTokens(detail.usage.input_tokens)} · out{" "}
            {formatTokens(detail.usage.output_tokens)}
          </span>
          <span>
            cache w {formatTokens(detail.usage.cache_write_tokens)} · r{" "}
            {formatTokens(detail.usage.cache_read_tokens)}
          </span>
          <span>{formatCost(detail.usage.cost_usd)}</span>
        </div>
      )}

      {canReply && (
        <div className="agent-detail__reply">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (
                (e.metaKey || e.ctrlKey) &&
                e.key === "Enter" &&
                reply.trim()
              ) {
                e.preventDefault();
                void sendReply();
              }
            }}
            placeholder={
              isTerminal ? "Reply to resume the agent…" : "Reply to the agent…"
            }
            disabled={busy !== null}
          />
          <div className="agent-detail__reply-row">
            <span className="agent-detail__reply-hint">
              ⌘/Ctrl + Enter to send
            </span>
            <div className="agent-detail__reply-actions">
              <button
                type="button"
                className="agent-detail__action-btn agent-detail__attach-btn"
                onClick={() => void attachFiles()}
                disabled={busy !== null}
                title="Attach a file — its absolute path is appended so the agent can Read it"
              >
                Attach
              </button>
              <button
                className="agent-detail__action-btn"
                onClick={() => void sendReply()}
                disabled={!reply.trim() || busy !== null}
              >
                {busy === "reply" ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
