// Daemon HTTP client. One instance per machine.
//
// Mirrors helm/app/lib/api.ts (the phone app's client). Workroot fetches
// directly from React rather than proxying through Tauri commands —
// helm's API is JSON over HTTP, no native plumbing needed.

// ---- shared types (kept in step with helm/shared/api-spec/types.ts) ----

export type AgentState =
  | "queued"
  | "planning"
  | "working"
  | "waiting_input"
  | "done"
  | "failed";

export type AgentBackend = "claude" | "codex";

export interface Agent {
  id: string;
  machine_name: string;
  name: string;
  repo: string;
  task: string;
  state: AgentState;
  backend: AgentBackend;
  summary: string | null;
  archived?: boolean;
  last_activity?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Turn {
  role: "user" | "assistant";
  content: string;
  at: string;
}

export type ThreadEvent =
  | { kind: "user"; at: string; text: string }
  | { kind: "assistant"; at: string; text: string }
  | { kind: "thinking"; at: string; text: string }
  | {
      kind: "tool_use";
      at: string;
      id: string;
      tool: string;
      title: string;
      input: string;
    }
  | {
      kind: "tool_result";
      at: string;
      tool_use_id: string;
      preview: string;
      is_error: boolean;
    };

export interface SessionUsage {
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
}

export interface AgentDetail extends Agent {
  pending_question: string | null;
  pr_url: string | null;
  worktree_path: string;
  branch: string;
  session_id: string | null;
  turns: Turn[];
  thread_events?: ThreadEvent[];
  usage?: SessionUsage;
}

export interface NewAgentRequest {
  repo: string;
  task: string;
  base_branch?: string;
  backend?: AgentBackend;
  name?: string;
  resume_session_id?: string;
  use_worktree?: boolean;
}

export interface Repo {
  name: string;
  path: string;
  default_branch: string;
  preamble?: string | null;
}

export interface Health {
  machine_name: string;
  version: string;
  repo_count: number;
  uptime_seconds: number;
}

// ---- machine-shaped record exposed by Tauri (matches src-tauri/src/helm) ----

export interface HelmMachine {
  id: number;
  label: string;
  base_url: string;
  enabled: boolean;
  last_seen_at: string | null;
  created_at: string;
  api_token: string | null;
}

// ---- client ----

const HEALTH_TIMEOUT_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 15_000;

export class DaemonClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string | null = null,
  ) {}

  private authHeader(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  private async request<T>(
    path: string,
    init?: RequestInit,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/v1${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...this.authHeader(),
          ...(init?.headers ?? {}),
        },
      });
      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText} on ${path}`);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  health(): Promise<Health> {
    return this.request<Health>("/health", undefined, HEALTH_TIMEOUT_MS);
  }

  agents(): Promise<{ agents: Agent[] }> {
    return this.request<{ agents: Agent[] }>("/agents");
  }

  agent(id: string): Promise<AgentDetail> {
    return this.request<AgentDetail>(`/agents/${id}`);
  }

  repos(): Promise<{ repos: Repo[] }> {
    return this.request<{ repos: Repo[] }>("/repos");
  }

  spawnAgent(body: NewAgentRequest): Promise<Agent> {
    return this.request<Agent>("/agents", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  replyAgent(id: string, message: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`/agents/${id}/reply`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
  }

  killAgent(id: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`/agents/${id}/kill`, {
      method: "POST",
    });
  }

  deleteAgent(id: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`/agents/${id}`, {
      method: "DELETE",
    });
  }
}

export function clientFor(m: HelmMachine): DaemonClient {
  return new DaemonClient(m.base_url, m.api_token);
}
