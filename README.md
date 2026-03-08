# Workroot

**Local Intelligence Platform for AI-Native Development**

[![CI](https://github.com/sauravpanda/workroot/actions/workflows/ci.yml/badge.svg)](https://github.com/sauravpanda/workroot/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

---

## The Problem

AI-assisted development today is fragmented. Claude Code sees your files but not your running processes. Your terminal captures shell output but not your network traffic. Your browser handles HTTP requests but knows nothing about your git state. None of these tools talk to each other.

Every new AI session starts from scratch. You re-explain your stack, re-describe your errors, and re-establish context that your local environment already knows. The runtime intelligence your system generates -- process logs, HTTP responses, database schemas, file changes, shell history -- is scattered across dozens of tools, invisible to the AI that could use it most.

## The Solution

Workroot is a persistent local daemon and Tauri v2 desktop application that watches everything happening in your development environment and exposes it to AI coding assistants via a local MCP (Model Context Protocol) server.

> **The missing layer between your running system and your AI coding assistant.**

Workroot continuously aggregates runtime context -- processes, logs, HTTP traffic, git state, database schemas, shell commands, file changes -- and makes it queryable through a single interface. Claude Code (or any MCP-compatible assistant) gains awareness of your full development environment, not just your files.

## Before and After

| Scenario | Without Workroot | With Workroot |
|---|---|---|
| **Debugging a 500 error** | Copy-paste logs from terminal, describe the request manually, hope Claude has enough context | Claude queries `workroot_get_logs` and `workroot_get_http_traffic`, sees the exact request/response pair and the error traceback together |
| **Starting a new session** | Re-explain your stack, running services, recent changes, and current branch | Claude reads `workroot_get_project_context` and immediately knows what is running, what changed, and what branch you are on |
| **Environment variables** | Manually list which env vars exist, risk leaking secrets in chat | Claude calls `workroot_list_env_keys` to see variable names without ever seeing values |
| **Database schema questions** | Open a DB client, run `\dt`, copy-paste schema definitions | Claude calls `workroot_get_db_schema` and gets the full table structure instantly |
| **"What port is my server on?"** | Check terminal output, `lsof`, or docker ps | Claude calls `workroot_list_processes` and sees every managed process with its port |
| **Recalling past decisions** | Scroll through old chat logs or grep commit messages | Claude queries `workroot_search_memory` to find indexed notes, dead ends, and decisions |

## Architecture

```
+------------------------------------------------------+
|                   Workroot Desktop App                |
|                     (Tauri v2 Shell)                  |
|  +------------------------------------------------+  |
|  |              React 19 Frontend                  |  |
|  |   Projects | Processes | Logs | Env | Git       |  |
|  +------------------------------------------------+  |
|  |              Rust Backend (Tauri)               |  |
|  |   +----------+  +-----------+  +-------------+ |  |
|  |   | Process  |  |  Network  |  |    File     | |  |
|  |   | Manager  |  |  Proxy    |  |  Watcher    | |  |
|  |   +----------+  +-----------+  +-------------+ |  |
|  |   +----------+  +-----------+  +-------------+ |  |
|  |   |   Git    |  |    DB     |  |   Shell     | |  |
|  |   |  Ops     |  | Awareness |  |  History    | |  |
|  |   +----------+  +-----------+  +-------------+ |  |
|  +------------------------------------------------+  |
|  |         SQLite (rusqlite + sqlite-vec)           |  |
|  +------------------------------------------------+  |
+------------------------------------------------------+
         |
         | localhost:4444 (MCP over HTTP)
         |
+------------------------------------------------------+
|        Claude Code / Open Code / Any MCP Client       |
+------------------------------------------------------+
```

### Tech Stack

| Component | Technology | Purpose |
|---|---|---|
| Desktop Shell | Tauri v2 | Native app with Rust backend and web frontend |
| Frontend | React 19 + Vite + TypeScript | UI for project management, logs, and configuration |
| Backend | Rust (2021 edition) | Core daemon logic, process management, data aggregation |
| Database | SQLite via rusqlite (bundled) | Persistent local storage for all context data |
| MCP Server | axum on `localhost:4444` | Exposes tools and context to AI assistants |
| Embeddings | sqlite-vec | Vector similarity search for memory and semantic queries |
| Network Proxy | hyper | Reverse proxy on port 3000 to intercept HTTP traffic |
| Git Operations | libgit2 (git2 crate) | Branch tracking, diff computation, commit history |
| Package Manager | pnpm | Frontend dependency management |

## Features

### MVP (v0.1)

- **GitHub Project Model** -- Import repositories, manage worktrees per branch, track project metadata in SQLite.
- **Environment Vault** -- Store environment variable keys per project and profile. Values are encrypted at rest and never exposed through MCP (only key names are queryable).
- **Process Manager** -- Start, stop, and monitor dev server processes. Capture stdout/stderr into a searchable log store.
- **Port 3000 Reverse Proxy** -- Transparent HTTP proxy that logs all request/response pairs passing through to the upstream dev server.
- **MCP Server** -- Local HTTP server on `localhost:4444` exposing all context via MCP tools. Per-session auth tokens for security.
- **CLAUDE.md Generation** -- Auto-generate a `CLAUDE.md` file summarizing project structure, conventions, and context for AI assistants.

### Core (v0.2 - v0.4)

- **Shell History Capture** -- Record shell commands with exit codes, branch context, and timestamps. Surface recent commands to AI assistants.
- **Persistent Memory** -- Store notes, dead ends, and architectural decisions with vector embeddings. Semantic search across session history.
- **Database Awareness** -- Connect to local PostgreSQL, MySQL, or SQLite databases. Expose schema information (tables, columns, types) without exposing row data.
- **Git Panel** -- Visual branch management, diff viewer, commit history. Expose git state (current branch, uncommitted changes, recent commits) to MCP.
- **Network Interceptor** -- Full request/response logging with header and body capture. Filter by method, path, or status code.
- **Browser Extension** -- Chrome/Firefox extension that forwards console logs, network requests, and errors from the browser to Workroot.
- **File Intelligence** -- Watch project files for changes. Track which files were modified, created, or deleted and expose change history to AI.

### Future (v0.5+)

- **Multi-Agent Orchestration** -- Coordinate multiple AI agents working on the same project with shared context and conflict detection.
- **Conversation Indexing** -- Index past AI conversations and make them searchable. Let new sessions reference decisions from old ones.
- **Team Context Sharing** -- Optional sharing of project context (not secrets) across team members for collaborative AI-assisted development.
- **Plugin System** -- Extensible architecture for custom context providers and MCP tool definitions.

## MCP Tools

The Workroot MCP server exposes the following tools on `localhost:4444`:

| Tool | Description |
|---|---|
| `workroot_get_project_context` | Returns full project summary: name, path, branch, running processes, recent activity |
| `workroot_list_projects` | Lists all registered projects with metadata |
| `workroot_list_processes` | Lists managed processes with PID, port, and status |
| `workroot_get_logs` | Retrieves recent log entries, filterable by process and log level |
| `workroot_search_logs` | Full-text search across all captured log output |
| `workroot_get_http_traffic` | Returns captured HTTP request/response pairs from the proxy |
| `workroot_list_env_keys` | Lists environment variable key names (never values) for a project/profile |
| `workroot_get_db_schema` | Returns table and column definitions from a connected database |
| `workroot_get_git_state` | Returns current branch, uncommitted changes, and recent commit history |
| `workroot_get_git_diff` | Returns the diff for staged/unstaged changes or between commits |
| `workroot_get_shell_history` | Returns recent shell commands with exit codes and branch context |
| `workroot_search_memory` | Semantic search across stored notes, decisions, and dead ends |
| `workroot_add_memory` | Stores a new memory item (note, decision, or dead end) with embedding |
| `workroot_get_file_changes` | Returns recent file change events for the project |
| `workroot_generate_claude_md` | Generates or regenerates the CLAUDE.md context file |

## Getting Started

### Prerequisites

- **Rust** (stable toolchain, 1.75+) -- [Install via rustup](https://rustup.rs/)
- **Node.js** 20+ -- [Download](https://nodejs.org/)
- **pnpm** 10+ -- `npm install -g pnpm`
- **System dependencies** (Linux only):
  ```
  sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libgtk-3-dev
  ```

### Installation

```bash
# Clone the repository
git clone https://github.com/sauravpanda/workroot.git
cd workroot

# Install frontend dependencies
pnpm install

# Run in development mode
pnpm tauri dev
```

### Development Commands

**Frontend:**

```bash
pnpm install          # Install dependencies
pnpm dev              # Start Vite dev server (frontend only)
pnpm build            # Build frontend for production
pnpm test             # Run tests (vitest)
pnpm test:watch       # Run tests in watch mode
pnpm lint             # Lint TypeScript (eslint)
pnpm lint:fix         # Auto-fix lint issues
pnpm format           # Format code (prettier)
pnpm format:check     # Check formatting
pnpm typecheck        # Type-check without emitting
```

**Backend (from project root):**

```bash
cargo build --manifest-path src-tauri/Cargo.toml           # Build Rust backend
cargo test --manifest-path src-tauri/Cargo.toml            # Run Rust tests
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings  # Lint Rust code
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check  # Check Rust formatting
```

**Full Application:**

```bash
pnpm tauri dev        # Run the full Tauri app in development mode
pnpm tauri build      # Build distributable binary
```

## Project Structure

```
workroot/
├── src/                          # React frontend
│   ├── main.tsx                  # App entry point
│   ├── App.tsx                   # Root component
│   └── styles.css                # Global styles
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── main.rs               # Tauri entry point
│   │   ├── lib.rs                # Library root, Tauri builder setup
│   │   └── db/
│   │       └── mod.rs            # SQLite initialization and schema
│   ├── capabilities/
│   │   └── default.json          # Tauri v2 capability permissions
│   ├── Cargo.toml                # Rust dependencies
│   ├── Cargo.lock                # Rust lockfile
│   ├── build.rs                  # Tauri build script
│   └── tauri.conf.json           # Tauri app configuration
├── public/                       # Static assets
├── docs/                         # Documentation and PR plans
├── .github/
│   ├── workflows/
│   │   └── ci.yml                # CI pipeline (lint, test, build)
│   └── PULL_REQUEST_TEMPLATE.md  # PR template
├── package.json                  # Frontend dependencies and scripts
├── vite.config.ts                # Vite configuration
├── vitest.config.ts              # Vitest test configuration
├── tsconfig.json                 # TypeScript configuration
├── index.html                    # HTML entry point
├── CLAUDE.md                     # AI assistant context file
├── LICENSE                       # Apache 2.0
└── README.md                     # This file
```

## Contributing

Contributions are welcome. Please follow these guidelines:

1. **One feature per PR** -- Keep pull requests focused and reviewable.
2. **Follow existing conventions** -- TypeScript strict mode for frontend, Rust 2021 edition with `clippy -D warnings` for backend.
3. **Include tests** -- All new features and bug fixes should include appropriate test coverage.
4. **Pass CI checks** -- Ensure `pnpm lint`, `pnpm format:check`, `pnpm test`, `cargo clippy`, `cargo fmt --check`, and `cargo test` all pass before submitting.
5. **Use the PR template** -- Fill out the summary, changes, and test plan sections in `.github/PULL_REQUEST_TEMPLATE.md`.

See `docs/` for detailed PR plans and feature specifications.

### Coding Standards

| Area | Standard |
|---|---|
| TypeScript | Strict mode, ESLint + Prettier |
| Rust | Edition 2021, clippy with `-D warnings`, rustfmt |
| Database | All schema changes via migration in `db/mod.rs` |
| Tauri Commands | Organized by module in `src-tauri/src/` |
| Components | React functional components in `src/components/` |
| Commits | Focused, descriptive messages; one logical change per commit |

## Security

Workroot is designed to keep your data local and your secrets safe:

- **Per-session auth tokens** -- The MCP server generates a unique authentication token for each session. AI assistants must present this token to access tools, preventing unauthorized access from other local processes.
- **Environment variable values are never exposed** -- MCP tools only return env var key names, never their values. Values are encrypted at rest in the SQLite database.
- **Origin checking** -- The MCP server validates request origins to prevent cross-site request forgery from browser-based attacks.
- **Local-only by default** -- The MCP server binds to `localhost` only. No data leaves your machine unless you explicitly configure sharing.
- **No telemetry** -- Workroot does not collect or transmit usage data.

## License

Workroot is licensed under the [Apache License 2.0](LICENSE).

## Roadmap

Development is organized into incremental PRs. See `docs/PR_PLANS.md` for the detailed implementation roadmap, including:

- PR 1: Project model and SQLite schema
- PR 2: Environment vault with encryption
- PR 3: Process manager and log capture
- PR 4: HTTP reverse proxy on port 3000
- PR 5: MCP server on localhost:4444
- PR 6: CLAUDE.md generation
- PR 7-12: Shell history, persistent memory, DB awareness, git panel, file watcher, browser extension

For the full product vision and technical design, see the Workroot product plan.
