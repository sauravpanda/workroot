import { Component, type ErrorInfo, type ReactNode, type FC } from "react";

interface Props {
  children: ReactNode;
  /** Optional label for the boundary (shown in fallback UI) */
  name?: string;
  /** Render a custom fallback instead of the default panel */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[ErrorBoundary${this.props.name ? ` (${this.props.name})` : ""}]`,
      error,
      info.componentStack,
    );
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    return (
      <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-[var(--danger-muted)] bg-[var(--bg-surface)] p-8 text-center text-[var(--text-secondary)]">
        <div className="text-2xl leading-none text-[var(--danger)]">⚠</div>
        <h3 className="m-0 text-[13px] font-semibold text-[var(--text-primary)]">
          {this.props.name
            ? `${this.props.name} failed to render`
            : "Something went wrong"}
        </h3>
        <p className="m-0 max-w-[420px] break-words font-mono text-[11px] text-[var(--text-muted)]">
          {error.message}
        </p>
        <button
          className="mt-2 cursor-pointer rounded-sm border border-[var(--border)] bg-[var(--bg-elevated)] px-[14px] py-[5px] font-sans text-xs text-[var(--text-primary)] transition-[border-color,background] duration-150 hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
          onClick={this.reset}
        >
          Try again
        </button>
      </div>
    );
  }
}

/**
 * Convenience wrapper that places an `ErrorBoundary` around a single panel.
 * Usage: `<PanelBoundary name="Docker"><DockerPanel … /></PanelBoundary>`
 */
export const PanelBoundary: FC<{ name: string; children: ReactNode }> = ({
  name,
  children,
}) => <ErrorBoundary name={name}>{children}</ErrorBoundary>;
