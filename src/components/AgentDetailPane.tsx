import { useAgentDetail } from "../hooks/useAgentDetail";
import { type ThreadEvent, type Turn } from "../lib/helm-api";
import "../styles/agent-detail.css";

interface AgentDetailPaneProps {
  machineId: number | null;
  agentId: string | null;
  onClose: () => void;
}

function formatCost(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function ThreadEventRow({ ev }: { ev: ThreadEvent }) {
  switch (ev.kind) {
    case "user":
      return (
        <div className="agent-detail__event agent-detail__event--user">
          <span className="agent-detail__event-label">User</span>
          {ev.text}
        </div>
      );
    case "assistant":
      return (
        <div className="agent-detail__event agent-detail__event--assistant">
          <span className="agent-detail__event-label">Assistant</span>
          {ev.text}
        </div>
      );
    case "thinking":
      return (
        <div className="agent-detail__event agent-detail__event--thinking">
          {ev.text}
        </div>
      );
    case "tool_use":
      return (
        <div className="agent-detail__event agent-detail__event--tool_use">
          <span className="agent-detail__event-label">
            tool: {ev.tool} — {ev.title}
          </span>
          {ev.input}
        </div>
      );
    case "tool_result":
      return (
        <div
          className={
            ev.is_error
              ? "agent-detail__event agent-detail__event--tool_result is-error"
              : "agent-detail__event agent-detail__event--tool_result"
          }
        >
          <span className="agent-detail__event-label">
            result{ev.is_error ? " (error)" : ""}
          </span>
          {ev.preview}
        </div>
      );
  }
}

function TurnRow({ turn }: { turn: Turn }) {
  return (
    <div
      className={
        turn.role === "user"
          ? "agent-detail__event agent-detail__event--user"
          : "agent-detail__event agent-detail__event--assistant"
      }
    >
      <span className="agent-detail__event-label">{turn.role}</span>
      {turn.content}
    </div>
  );
}

export function AgentDetailPane({
  machineId,
  agentId,
  onClose,
}: AgentDetailPaneProps) {
  const { detail, machine, loading, error } = useAgentDetail(
    machineId,
    agentId,
  );

  if (machineId === null || agentId === null) {
    return (
      <aside className="agent-detail">
        <p className="agent-detail__empty">Select an agent to inspect.</p>
      </aside>
    );
  }

  return (
    <aside className="agent-detail">
      <div className="agent-detail__header">
        <div className="agent-detail__title-row">
          <h3 className="agent-detail__title">{detail?.name ?? "Loading…"}</h3>
          <button
            className="agent-detail__close"
            onClick={onClose}
            aria-label="Close detail pane"
          >
            ×
          </button>
        </div>
        {detail && (
          <div className="agent-detail__meta">
            <span
              className={`agent-detail__state-pill agent-detail__state-pill--${detail.state}`}
            >
              {detail.state}
            </span>
            <span className="agent-detail__meta-item">
              {machine?.label ?? detail.machine_name}
            </span>
            <span className="agent-detail__meta-item">{detail.repo}</span>
            <span className="agent-detail__meta-item">{detail.branch}</span>
          </div>
        )}
      </div>

      {error && <p className="agent-detail__error">{error}</p>}

      {loading && !detail ? (
        <p className="agent-detail__loading">Loading…</p>
      ) : detail ? (
        <>
          {detail.pending_question && (
            <div className="agent-detail__pending">
              <span className="agent-detail__pending-label">
                Pending question
              </span>
              {detail.pending_question}
            </div>
          )}

          {detail.pr_url && (
            <a
              className="agent-detail__pr"
              href={detail.pr_url}
              target="_blank"
              rel="noreferrer"
            >
              {detail.pr_url}
            </a>
          )}

          <div className="agent-detail__events">
            {detail.thread_events && detail.thread_events.length > 0
              ? detail.thread_events.map((ev, i) => (
                  <ThreadEventRow key={i} ev={ev} />
                ))
              : detail.turns.map((t, i) => <TurnRow key={i} turn={t} />)}
            {(!detail.thread_events || detail.thread_events.length === 0) &&
              detail.turns.length === 0 && (
                <p className="agent-detail__empty">
                  No transcript yet — agent hasn't produced output.
                </p>
              )}
          </div>

          {detail.usage && (
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
        </>
      ) : null}
    </aside>
  );
}
