import { Component, type ErrorInfo, type ReactNode } from "react";
import "../styles/error-boundary.css";

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
      <div className="error-boundary-fallback">
        <div className="error-boundary-icon">⚠</div>
        <h3 className="error-boundary-title">
          {this.props.name
            ? `${this.props.name} failed to render`
            : "Something went wrong"}
        </h3>
        <p className="error-boundary-message">{error.message}</p>
        <button className="error-boundary-reset" onClick={this.reset}>
          Try again
        </button>
      </div>
    );
  }
}
