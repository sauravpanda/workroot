// Daemon HTTP client. One instance per machine.
//
// Shape mirrors helm/app/lib/api.ts (the phone app's client). Calls go
// through the `helm_proxy_request` Tauri command rather than `fetch()`
// directly — workroot's WebView CSP locks `connect-src` to 'self', and
// the daemon doesn't send CORS headers either, so a browser-side fetch
// would be doubly blocked. Routing through Rust sidesteps both.

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

import { invoke } from "@tauri-apps/api/core";

export class DaemonClient {
  constructor(private readonly machineId: number) {}

  private async request<T>(
    method: "GET" | "POST" | "DELETE" | "PUT",
    path: string,
    body?: unknown,
  ): Promise<T> {
    return (await invoke<T>("helm_proxy_request", {
      machineId: this.machineId,
      method,
      path: `/v1${path}`,
      body: body === undefined ? null : JSON.stringify(body),
    })) as T;
  }

  health(): Promise<Health> {
    return this.request<Health>("GET", "/health");
  }

  agents(): Promise<{ agents: Agent[] }> {
    return this.request<{ agents: Agent[] }>("GET", "/agents");
  }

  agent(id: string): Promise<AgentDetail> {
    return this.request<AgentDetail>("GET", `/agents/${id}`);
  }

  repos(): Promise<{ repos: Repo[] }> {
    return this.request<{ repos: Repo[] }>("GET", "/repos");
  }

  spawnAgent(body: NewAgentRequest): Promise<Agent> {
    return this.request<Agent>("POST", "/agents", body);
  }

  replyAgent(id: string, message: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>("POST", `/agents/${id}/reply`, {
      message,
    });
  }

  killAgent(id: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>("POST", `/agents/${id}/kill`);
  }

  deleteAgent(id: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>("DELETE", `/agents/${id}`);
  }
}

export function clientFor(m: HelmMachine): DaemonClient {
  return new DaemonClient(m.id);
}
