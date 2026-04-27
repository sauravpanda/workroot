# Workroot

**Desktop console for [helm](https://github.com/browser-use/helm).** Drive your fleet of AI coding agents from one window — with a real screen and real keyboard shortcuts.

[![CI](https://github.com/sauravpanda/workroot/actions/workflows/ci.yml/badge.svg)](https://github.com/sauravpanda/workroot/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

> **Status — pivoting.** Workroot was originally a horizontal "local intelligence platform." It's narrowing into the desktop client for [helm](https://github.com/browser-use/helm), the AI-agent orchestrator I actually use every day. See [`docs/PIVOT.md`](docs/PIVOT.md) for the full plan.

---

## What it is

Helm is a personal multi-machine agent orchestrator. A small Rust daemon runs on each of your machines and supervises `claude --dangerously-skip-permissions` (or `codex`) inside tmux. The phone app and CLI are clients of that daemon.

**Workroot is the desktop client.** Same daemon, same HTTP API, same bearer-token auth — just a Tauri shell with a real screen and real keyboard shortcuts. It also manages the daemon's lifecycle (start / stop / restart) and embeds an xterm view so you can watch claude work in real time.

```
                              ┌──────────────────────┐
                              │   helm-daemon        │
                              │   (Rust HTTP server  │
                              │   on :8421)          │
                              └────────┬─────────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
              ▼                        ▼                        ▼
       ┌─────────────┐         ┌────────────────┐       ┌──────────────┐
       │  helm CLI   │         │  Phone app     │       │  workroot    │
       │  (Rust)     │         │  (Expo / iOS)  │       │  (Tauri)     │
       └─────────────┘         └────────────────┘       └──────────────┘
```

## Why it's not just the phone app on a desktop

Things the phone can't reasonably do:

- **Real keyboard shortcuts** — `⌘N` new agent, `⌘K` command palette, `⌘1`/`⌘2`/`⌘3` jump between agents.
- **Two-pane layout** — agent list on the left, full thread on the right. No drilling in/out.
- **Embedded live tmux preview** — watch claude type in real time, not just the parsed events.
- **Diff viewer** — syntax-highlighted, side-by-side, big enough to actually read.
- **Daemon management** — one-click start/stop/restart instead of `launchctl kickstart` muscle memory.
- **MCP angle (later)** — exposes "helm agents on this machine" as MCP resources, so Claude itself can ask `workroot_list_agents`. Genuinely novel — only this combo unlocks it.

## Status

Phase 0 (strip + reframe) is happening now on the `pivot/helm-desktop` branch. See [`docs/PIVOT.md`](docs/PIVOT.md) and the issues tagged `pivot:helm-desktop` for the work in flight.

If you landed here looking for the **old workroot** (process management, HTTP capture, db schema introspection, generic MCP context server), that vision lives in [`docs/archive/old-vision-README.md`](docs/archive/old-vision-README.md). It's not coming back as-is, but the structural pieces (Tauri shell, xterm, process primitives, MCP surface) are being repurposed.

## Building

```
pnpm install
pnpm tauri dev
```

Standard Tauri v2 setup. Requires a recent Rust toolchain + Node 20+.

## License

Apache 2.0 — see [LICENSE](LICENSE).
