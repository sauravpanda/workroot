# Pivot: workroot becomes helm's desktop console

**Date**: 2026-04-26
**Status**: Planning → execution

## TL;DR

Workroot was conceived as a horizontal "local intelligence platform for AI-native development" — process management, log capture, HTTP traffic, db schemas, MCP context, all in one desktop app. That scope was too diffuse, and the product never found a daily-driver use for me.

Meanwhile, [helm](https://github.com/browser-use/helm) (a separate project) became the thing I actually use every day to orchestrate AI agents across my machines. Helm has a Rust HTTP daemon, a tmux-backed supervisor, an iOS app, and a CLI — but no desktop client.

**Workroot pivots from "local intelligence platform" to "the desktop client for helm."** Same Tauri shell, same React/shadcn UI, same Rust crates. New job.

## What changes

### Identity

- **Old positioning:** "Local intelligence platform for AI-native development. Workroot watches everything happening in your dev environment and exposes it to AI assistants via MCP."
- **New positioning:** "Desktop console for helm. Drive your fleet of AI agents from the keyboard, with a real screen and real shortcuts."

### Scope

The horizontal ambition is dead. Workroot now does one thing well: be the best place to *watch and steer* helm agents from a desktop.

| Area | Old workroot | New workroot |
|------|--------------|--------------|
| Process management | Watch every process on the machine | Manages just `helm-daemon` and the `helm` tmux session |
| Logs | Aggregate app logs across the system | Surfaces helm agent transcripts |
| HTTP capture | Sniff outgoing traffic | Cut |
| DB schema | Introspect dev databases | Cut |
| MCP server | Expose all of the above to Claude | Exposes *helm agents* to Claude (e.g. `workroot_list_agents`, `workroot_get_agent_status`) — the only MCP surface that survives, and arguably the most interesting one |
| Embedded terminal (xterm) | Generic terminal pane | "Live preview" of the tmux pane an agent runs in |
| File-watcher / git intel | Watch every repo | Cut — helm tracks per-agent worktrees already |

### What stays

- Tauri v2 shell, build pipeline, signing, updater plugin
- React + Vite + Tailwind + shadcn frontend
- Existing CI (`.github/workflows/`)
- License (Apache 2.0)
- Process-manager primitives (repurposed for helm-daemon supervision)
- xterm wiring (repurposed for live tmux pane preview)
- The MCP surface, narrowed to helm agents

### What gets cut

- Generic process watching beyond helm-daemon and tmux
- HTTP traffic capture
- DB schema introspection
- File-watcher across arbitrary repos
- The DevSpace planning doc (moved to `docs/archive/`)
- Anything else that doesn't directly support driving agents

## Architecture

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

Three peer clients, one daemon. workroot is **just another HTTP client** — same routes, same bearer-token auth, same shared types under `helm/shared/api-spec/`.

The daemon stays in the helm repo. workroot does not embed it. Workroot can *manage* the daemon's lifecycle (start / stop / restart) via its existing process-manager primitives, but doesn't replace it.

## What workroot brings to helm that the phone can't

- **Real keyboard shortcuts.** `⌘N` new agent, `⌘K` command palette, `⌘1`/`⌘2`/`⌘3` jump between agents.
- **Two-pane layout.** Agent list on the left, full thread on the right — no more drilling in/out.
- **Embedded live tmux preview.** The xterm component already in workroot becomes the "watch claude work in real time" view that the phone can't reasonably do.
- **Better diff viewer.** Syntax highlighting, side-by-side, big enough to actually read.
- **Daemon management.** One-click start/stop/restart from the menu bar instead of `launchctl kickstart` muscle memory.
- **MCP angle.** Workroot exposes `workroot_list_agents` etc. so Claude itself can see and reason about other Claudes you have running. Genuinely novel — only this combo unlocks it.

## Phases

### Phase 0 — strip down (1 day)

Goal: get the repo into a clean shape that reflects the new scope. Don't break the build.

- Move `DevSpace-Full-Plan-Revised.docx` to `docs/archive/old-vision/`.
- Update `README.md` to the new positioning.
- Add this doc (`docs/PIVOT.md`).
- Delete or archive code paths for HTTP capture, DB schema, generic file watching. Keep the structural pieces (process manager primitives, xterm wiring) since they get reused.
- Triage the existing 400+ open issues: close anything that's specifically about a cut feature. Comment on borderline ones with a pointer to this doc.

### Phase 1 — Agents tab (3-4 days)

Goal: ship a desktop client that reaches feature parity with the phone for the core read + reply loop.

- Wire helm-daemon HTTP client in workroot's Rust side (or fetch it directly from the React side — cleaner since helm's API is JSON over HTTP). Bearer-token auth, same as the phone app.
- Settings → Machines screen for registering helm daemons. Mirrors the phone app's "Add machine" flow.
- Agents view: two-pane (list left, detail right). Reuses the helm phone-app UX but spread across the screen.
- Send follow-ups, attach images (via `Tauri-plugin-fs` instead of expo-image-picker).
- Mic/dictation (the macOS dictation key works in any TextInput — no new code).

### Phase 2 — desktop-only wins (1 week)

Things the phone can't do well.

- Embedded **xterm** showing the agent's live tmux pane (uses workroot's existing xterm setup).
- **Diff viewer** — render `/v1/agents/:id/diff` with syntax highlighting + side-by-side.
- **Keyboard shortcuts** — ⌘N, ⌘K, ⌘1..9, /, gg, etc.
- **Menu-bar status item** — count of `Needs You` agents, click for popover.
- Helm-daemon **process management** — workroot's process-manager primitives manage the daemon binary, restart it, show its output. The original workroot feature finds a real job.

### Phase 3 — MCP integration (later)

Workroot exposes helm agents as MCP resources so Claude itself can ask:

- `workroot_list_agents` → all agents on this machine
- `workroot_get_agent_status` → state, last activity, recent tool calls
- `workroot_send_followup` (with confirmation gate) → reply to an agent

This is the cross-product win that justifies workroot's existence as a distinct repo from helm. **Defer until Phases 1 and 2 are stable** — no point building MCP for a UI that's still moving.

## Non-goals

- Cloud-hosted version of either project.
- Multi-tenancy / sharing helm agents with teammates.
- Web UI for helm.
- A second backend that competes with `helm-daemon`.
- Re-introducing any of the cut features without a concrete agent-driven use case.

## Open questions

- Does workroot adopt the same bearer-token UX as the helm phone app (per-machine token field) or use a single token store?
- Should workroot bundle a helm-daemon binary, or always require helm to be installed separately? (Lean: separately — keeps the daemon under helm's release schedule.)
- iCloud / device-sync for the machines list across desktop + phone?

## Migration of existing workroot issues

The repo has ~420 open issues from the old direction. Plan:

1. Close issues that are specifically about cut features (HTTP capture, DB schema, etc.).
2. Comment on issues that survive in spirit (e.g. process management → "this becomes helm-daemon process management — see PIVOT.md").
3. Open new issues for each phase above.

The triage is its own piece of work — handled in a follow-up issue.
