import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as Popover from "@radix-ui/react-popover";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { open as openShell } from "@tauri-apps/plugin-shell";
import AnsiConvert from "ansi-to-html";
import { useAgentDetail } from "../hooks/useAgentDetail";
import {
  clientFor,
  type HelmMachine,
  type ThreadEvent,
  type Turn,
} from "../lib/helm-api";
import { escapeHtml, getLanguageFromPath, highlightCode } from "../lib/syntax";
import "../styles/agent-detail.css";

interface AgentDetailPaneProps {
  /** Resolved machine the agent runs on. Parent (AgentsTab) does the
   *  lookup once from the shared machines list and passes it in —
   *  saves an N+1 list_helm_machines invoke per pane per poll. */
  machine: HelmMachine | null;
  agentId: string | null;
  onClose: () => void;
  /** Called after a successful DELETE so the parent can drop selection
   *  before the next poll catches up. */
  onDeleted?: () => void;
  /** Pin state, controlled by the parent (AgentsTab). When undefined,
   *  the Pin menu item + the indicator are hidden — the standalone /
   *  legacy single-pane usage doesn't need the concept. */
  pinned?: boolean;
  onTogglePin?: () => void;
}

const TERMINAL_STATES = new Set(["done", "failed"]);
// States where the agent is *supposed* to be doing something — used to
// surface the typing-bubble at the bottom of the events list. The bubble
// is *also* gated on recent activity (see WORKING_STALE_MS): if the
// daemon's state says working but updated_at hasn't moved in a while,
// the state is stale and we suppress the bubble.
const ACTIVE_STATES = new Set(["working", "planning", "queued"]);

// If updated_at hasn't advanced in this long, treat the active state
// as stale and hide the bubble. Polling is 3 s, so a real working agent
// refreshes well within this window.
const WORKING_STALE_MS = 60_000;

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

// ---- linkify helpers ----
//
// Auto-detect URLs in transcript text and tool output so the user can
// click them. We use two separate paths because some text reaches React
// as plain strings (assistant/user messages) and some reaches the DOM
// already as HTML (highlight.js output, ANSI-converted Bash output).
//
// Plain-text path: split into React nodes, anchors get a real onClick
// that routes to openShell. HTML path: regex-rewrite URLs into anchors
// tagged with data-external; a single onClick handler on the events
// container catches their bubbled clicks (event delegation).

const URL_RE = /\bhttps?:\/\/[^\s<>"'`)\]]+/g;

// Strip trailing punctuation that shouldn't be part of the URL
// ("see https://x.com." or "(https://x.com)" — common in prose).
function stripTrailingPunct(url: string): { url: string; trailing: string } {
  const m = url.match(/[.,;:!?)]+$/);
  if (!m) return { url, trailing: "" };
  return { url: url.slice(0, -m[0].length), trailing: m[0] };
}

function openExternal(href: string): void {
  void openShell(href).catch(() => {});
}

function linkifyText(text: string): ReactNode {
  if (!text || text.indexOf("http") === -1) return text;
  const parts: ReactNode[] = [];
  let lastIdx = 0;
  let key = 0;
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index!;
    const { url, trailing } = stripTrailingPunct(match[0]);
    if (start > lastIdx) parts.push(text.slice(lastIdx, start));
    parts.push(
      <a
        key={key++}
        href={url}
        className="agent-detail__link"
        onClick={(e) => {
          e.preventDefault();
          openExternal(url);
        }}
      >
        {url}
      </a>,
    );
    if (trailing) parts.push(trailing);
    lastIdx = start + match[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}

// Markdown ```lang\n...\n``` code fences. Assistant messages routinely
// wrap code/diffs/configs this way; rendering them as plain mono
// dropped all the syntax color the user expected. Parser is regex —
// nested fences aren't a real concern in agent transcripts.
const FENCE_RE = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;

type MdSegment =
  | { type: "text"; body: string }
  | { type: "code"; lang: string | null; body: string };

function splitMarkdownFences(text: string): MdSegment[] {
  if (!text || text.indexOf("```") === -1) {
    return [{ type: "text", body: text }];
  }
  const out: MdSegment[] = [];
  let lastIdx = 0;
  // matchAll preserves indexes across iterations (regex /g).
  for (const m of text.matchAll(FENCE_RE)) {
    const start = m.index!;
    if (start > lastIdx) {
      out.push({ type: "text", body: text.slice(lastIdx, start) });
    }
    out.push({
      type: "code",
      lang: m[1] || null,
      body: m[2].replace(/\n$/, ""),
    });
    lastIdx = start + m[0].length;
  }
  if (lastIdx < text.length) {
    out.push({ type: "text", body: text.slice(lastIdx) });
  }
  return out.length > 0 ? out : [{ type: "text", body: text }];
}

// Wrap bare URLs in HTML with anchor tags. Skip URLs already inside an
// attribute value (e.g. `href="..."` from highlight.js output) by
// requiring a non-attribute character right before the URL.
function linkifyHtml(html: string): string {
  return html.replace(
    /(^|[^="'`>])\b(https?:\/\/[^\s<>"'`)\]]+)/g,
    (_, lead: string, raw: string) => {
      const { url, trailing } = stripTrailingPunct(raw);
      return `${lead}<a href="${url}" class="agent-detail__link" data-external="true">${url}</a>${trailing}`;
    },
  );
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
        {expanded && (
          <div className="agent-detail__msg-body">{linkifyText(text)}</div>
        )}
      </div>
    );
  }
  // Assistant messages routinely wrap code in ```lang fences; parse
  // them out and render each fenced block as a CodeBlock so syntax
  // highlighting fires inside the message body. Plain prose between
  // fences still gets linkifyText for clickable URLs.
  const segments = splitMarkdownFences(text);
  return (
    <div
      className={
        role === "user"
          ? "agent-detail__msg agent-detail__msg--user"
          : "agent-detail__msg agent-detail__msg--assistant"
      }
    >
      <div className="agent-detail__msg-body">
        {segments.map((seg, i) =>
          seg.type === "code" ? (
            <CodeBlock key={i} code={seg.body} language={seg.lang} />
          ) : (
            <span key={i}>{linkifyText(seg.body)}</span>
          ),
        )}
      </div>
    </div>
  );
}

// Highlighted code block — used for Write content, Read result body,
// and the generic tool args/result panes. `language` from the file
// path when known, else highlight.js auto-detect.
function CodeBlock({
  code,
  language,
}: {
  code: string;
  language?: string | null;
}) {
  const html = useMemo(
    () => linkifyHtml(highlightCode(code, language ?? null)),
    [code, language],
  );
  return (
    <pre className="agent-detail__code">
      <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}

// Edit tool args rendered as a unified-style diff. Old lines red,
// new lines green, file path + line counts in the header. Falls back
// to JSON if the args don't look like an Edit shape.
function EditDiff({ input }: { input: string }) {
  const obj = asRecord(safeJsonParse(input)) ?? {};
  const filePath = asString(obj.file_path) || asString(obj.path);
  const oldStr = asString(obj.old_string);
  const newStr = asString(obj.new_string);
  const lang = getLanguageFromPath(filePath);

  if (!filePath || (!oldStr && !newStr)) {
    return <CodeBlock code={prettyJson(input)} language="json" />;
  }

  const oldLines = oldStr ? oldStr.split("\n") : [];
  const newLines = newStr ? newStr.split("\n") : [];

  return (
    <div className="agent-detail__diff">
      <div className="agent-detail__diff-file">
        <span className="agent-detail__diff-path">{filePath}</span>
        <span className="agent-detail__diff-stats">
          <span className="agent-detail__diff-stat agent-detail__diff-stat--del">
            −{oldLines.length}
          </span>
          <span className="agent-detail__diff-stat agent-detail__diff-stat--add">
            +{newLines.length}
          </span>
        </span>
      </div>
      <div className="agent-detail__diff-body">
        {oldLines.map((line, i) => (
          <div
            key={`o${i}`}
            className="agent-detail__diff-line agent-detail__diff-line--del"
          >
            <span className="agent-detail__diff-marker">−</span>
            <code
              className="hljs"
              dangerouslySetInnerHTML={{ __html: highlightCode(line, lang) }}
            />
          </div>
        ))}
        {newLines.map((line, i) => (
          <div
            key={`n${i}`}
            className="agent-detail__diff-line agent-detail__diff-line--add"
          >
            <span className="agent-detail__diff-marker">+</span>
            <code
              className="hljs"
              dangerouslySetInnerHTML={{ __html: highlightCode(line, lang) }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// Write tool args: file path header + the content as highlighted code.
function WriteCode({ input }: { input: string }) {
  const obj = asRecord(safeJsonParse(input)) ?? {};
  const filePath = asString(obj.file_path) || asString(obj.path);
  const content = asString(obj.content);
  if (!content) return <CodeBlock code={prettyJson(input)} language="json" />;
  const lang = getLanguageFromPath(filePath);
  return (
    <div className="agent-detail__write">
      {filePath && <div className="agent-detail__write-file">{filePath}</div>}
      <CodeBlock code={content} language={lang} />
    </div>
  );
}

// ANSI-to-HTML for Bash results so colored CLI output (rg, eslint,
// cargo, claude etc.) renders the way it does in a real terminal.
// The Convert instance is per-render — its only state is across
// chunks of one stream, which we don't have here.
function AnsiBlock({ text }: { text: string }) {
  const html = useMemo(() => {
    try {
      const conv = new AnsiConvert({ newline: false, escapeXML: true });
      return linkifyHtml(conv.toHtml(text));
    } catch {
      return linkifyHtml(escapeHtml(text));
    }
  }, [text]);
  return (
    <pre
      className="agent-detail__code agent-detail__code--ansi"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// Dispatch the args body based on tool name. Edit gets a diff view,
// Write gets a code-with-file-path view, anything else falls back to
// JSON pretty-print.
function ToolArgs({ toolUse }: { toolUse: ToolUseEv }) {
  const lower = toolUse.tool.toLowerCase();
  if (lower === "edit") {
    return (
      <div className="agent-detail__tool-args">
        <EditDiff input={toolUse.input} />
      </div>
    );
  }
  if (lower === "write") {
    return (
      <div className="agent-detail__tool-args">
        <WriteCode input={toolUse.input} />
      </div>
    );
  }
  return (
    <div className="agent-detail__tool-args">
      <CodeBlock code={prettyJson(toolUse.input)} language="json" />
    </div>
  );
}

// Dispatch the result body based on tool name. Bash output gets ANSI
// parsing; Read result gets language-highlighted from the file_path
// arg; everything else uses CodeBlock with auto-detect so even
// arbitrary stdout gets a pass at colorization. v0.4.10 dropped the
// "plain text in collapsed mode" early return — the user couldn't
// see any highlighting on tool results because they were collapsed
// by default. Highlighting a 14-line trimmed snippet is fine; the
// overhead is negligible.
function ToolResultBody({
  toolUse,
  toolResult,
  expanded,
  trimmed,
}: {
  toolUse: ToolUseEv;
  toolResult: ToolResultEv;
  expanded: boolean;
  trimmed: { display: string; hiddenCount: number };
}) {
  const text = expanded ? toolResult.preview : trimmed.display;
  const lower = toolUse.tool.toLowerCase();

  if (lower === "bash" || lower.includes("shell")) {
    return <AnsiBlock text={text} />;
  }

  if (lower === "read") {
    const args = asRecord(safeJsonParse(toolUse.input)) ?? {};
    const filePath = asString(args.file_path) || asString(args.path);
    const lang = getLanguageFromPath(filePath);
    return <CodeBlock code={text} language={lang} />;
  }

  return <CodeBlock code={text} />;
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

      {expanded && <ToolArgs toolUse={toolUse} />}

      {toolResult && (
        <div className="agent-detail__tool-result">
          <ToolResultBody
            toolUse={toolUse}
            toolResult={toolResult}
            expanded={expanded}
            trimmed={trimmed}
          />
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
      <div className="agent-detail__msg-body">{linkifyText(turn.content)}</div>
    </div>
  );
}

// ----- main component -----

export function AgentDetailPane({
  machine,
  agentId,
  onClose,
  onDeleted,
  pinned,
  onTogglePin,
}: AgentDetailPaneProps) {
  const { detail, loading, error, refresh } = useAgentDetail(machine, agentId);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<"reply" | "kill" | "delete" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Auto-grow the reply textarea: starts at one line, grows to fit
  // content up to a 160 px ceiling, then scrolls inside. Avoids the
  // ~80 px reply box dominating each pane at the 4-pane grid.
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const autoGrowReply = useCallback(() => {
    const el = replyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(160, el.scrollHeight)}px`;
  }, []);

  useEffect(() => {
    autoGrowReply();
  }, [reply, autoGrowReply]);

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
  }, [machine?.id, agentId]);

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

  // Two-click confirm for destructive actions. Replaces window.confirm
  // (which yanked focus across all panes via a system-modal sheet on
  // macOS). The popover stays open after the first click and shows
  // "Click again to confirm". Auto-resets after 4 s if the user
  // wanders off. Defined above the early return so the hooks always
  // run in the same order.
  const [confirming, setConfirming] = useState<"kill" | "delete" | null>(null);
  const confirmTimeoutRef = useRef<number | null>(null);
  const armConfirm = useCallback((action: "kill" | "delete") => {
    if (confirmTimeoutRef.current !== null) {
      window.clearTimeout(confirmTimeoutRef.current);
    }
    setConfirming(action);
    confirmTimeoutRef.current = window.setTimeout(() => {
      setConfirming(null);
      confirmTimeoutRef.current = null;
    }, 4_000);
  }, []);
  const clearConfirm = useCallback(() => {
    if (confirmTimeoutRef.current !== null) {
      window.clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = null;
    }
    setConfirming(null);
  }, []);
  useEffect(
    () => () => {
      if (confirmTimeoutRef.current !== null) {
        window.clearTimeout(confirmTimeoutRef.current);
      }
    },
    [],
  );

  if (!machine || agentId === null) {
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
    clearConfirm();
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
    clearConfirm();
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

  // Show the "Agent is working" bubble only when state is active AND
  // updated_at is fresh. The state alone lies — daemons sometimes leave
  // an agent in `working` after it goes idle, leaving the bubble
  // spinning forever. Recheck on every poll re-render.
  const isActive = (() => {
    if (!detail || !ACTIVE_STATES.has(detail.state)) return false;
    const updated = Date.parse(detail.updated_at);
    if (Number.isNaN(updated)) return true; // can't tell, assume active
    return Date.now() - updated < WORKING_STALE_MS;
  })();

  // Estimate "current per-turn context size" from the cumulative
  // session tokens. The daemon only gives totals (no per-call
  // breakdown), so we approximate: cumulative input grows by roughly
  // the full prompt size each turn, so dividing by the number of
  // assistant turns gives the average input per call ≈ current
  // context size. v0.4.2 forgot this and summed cumulative input +
  // output + cache_read directly, which doubled-counted every turn
  // and showed 200%+ on long sessions.
  //
  // Cache reads count toward context too — they're still part of the
  // prompt that the model has to "read."
  // Plain expression (no useMemo) — this block runs after early returns,
  // and a one-pass filter on the events array is cheap.
  const assistantTurns =
    detail?.thread_events?.filter((e) => e.kind === "assistant").length ?? 0;
  const perTurnInputTokens = detail?.usage
    ? Math.round(
        (detail.usage.input_tokens + detail.usage.cache_read_tokens) /
          Math.max(1, assistantTurns),
      )
    : 0;

  return (
    <aside className="agent-detail">
      <header className="agent-detail__header">
        {detail && (
          <span
            className={`agent-detail__state-tag agent-detail__state-tag--${detail.state}`}
            title={detail.state}
          >
            [{detail.state}]
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
            {pinned && (
              <span
                className="agent-detail__pin-tag"
                title="Pinned — won't be evicted when opening another agent"
              >
                [pinned]
              </span>
            )}
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
                [&hellip;]
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
                  className={
                    confirming === "kill"
                      ? "agent-detail__menu-item agent-detail__menu-item--danger"
                      : "agent-detail__menu-item"
                  }
                  onClick={() => {
                    if (confirming === "kill") void kill();
                    else armConfirm("kill");
                  }}
                  disabled={isTerminal || busy !== null}
                >
                  {busy === "kill"
                    ? "Killing…"
                    : confirming === "kill"
                      ? "Click again to confirm"
                      : "Kill"}
                </button>
                <button
                  type="button"
                  className="agent-detail__menu-item agent-detail__menu-item--danger"
                  onClick={() => {
                    if (confirming === "delete") void remove();
                    else armConfirm("delete");
                  }}
                  disabled={!isTerminal || busy !== null}
                  title={
                    isTerminal
                      ? "Delete the worktree, logs, and DB row"
                      : "Kill the agent before deleting"
                  }
                >
                  {busy === "delete"
                    ? "Deleting…"
                    : confirming === "delete"
                      ? "Click again to confirm"
                      : "Delete"}
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
                {onTogglePin && (
                  <button
                    type="button"
                    className="agent-detail__menu-item"
                    onClick={onTogglePin}
                    title={
                      pinned
                        ? "Unpin — pane can be evicted by FIFO again"
                        : "Pin — pane won't be evicted when opening another agent"
                    }
                  >
                    {pinned ? "Unpin pane" : "Pin pane"}
                  </button>
                )}
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
          [x]
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
          onClick={(e) => {
            e.preventDefault();
            openExternal(detail.pr_url!);
          }}
        >
          {detail.pr_url}
        </a>
      )}

      <div className="agent-detail__events-wrap">
        <div
          className="agent-detail__events"
          ref={eventsRef}
          onScroll={onEventsScroll}
          onClick={(e) => {
            // Event delegation for HTML-injected anchors (linkifyHtml).
            // The React-rendered ones in MessageItem use their own
            // onClick handlers; this catches the rest.
            const target = e.target as HTMLElement;
            const anchor = target.closest(
              'a[data-external="true"]',
            ) as HTMLAnchorElement | null;
            if (anchor) {
              e.preventDefault();
              const href = anchor.getAttribute("href");
              if (href) openExternal(href);
            }
          }}
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
          {isActive && detail && (
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
          <span
            className="agent-detail__ctx"
            title={`Estimated current prompt size, computed as cumulative input ÷ ${assistantTurns || 1} turns. Real per-call tokens need a daemon API change. Sonnet context = 200 k; Sonnet 1M = 1 M.`}
          >
            ctx ~{formatTokens(perTurnInputTokens)}/turn
          </span>
          <span>{formatCost(detail.usage.cost_usd)}</span>
        </div>
      )}

      {canReply && (
        <div className="agent-detail__reply">
          <textarea
            ref={replyRef}
            value={reply}
            rows={1}
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
              busy === "reply"
                ? "Sending…"
                : isTerminal
                  ? "Reply to resume the agent…  (⌘↵)"
                  : "Reply to the agent…  (⌘↵)"
            }
            disabled={busy !== null}
          />
          <button
            type="button"
            className="agent-detail__attach-icon"
            onClick={() => void attachFiles()}
            disabled={busy !== null}
            aria-label="Attach a file"
            title="Attach a file — its absolute path is appended so the agent can Read it"
          >
            +
          </button>
        </div>
      )}
    </aside>
  );
}
