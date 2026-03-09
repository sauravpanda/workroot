#!/bin/bash
# Workroot shell hook for zsh
# Captures commands and sends them to the Workroot daemon.
# This file is sourced by .zshrc — do not execute directly.

_workroot_command=""
_workroot_start=""

# preexec: called just before a command is executed
_workroot_preexec() {
    _workroot_command="$1"
    _workroot_start=$(date +%s 2>/dev/null)
}

# precmd: called just before the prompt is displayed (after command finishes)
_workroot_precmd() {
    local exit_code=$?

    # Skip if no command was captured
    [ -z "$_workroot_command" ] && return

    local cmd="$_workroot_command"
    _workroot_command=""

    # Send to Workroot daemon (fire-and-forget, fail silently)
    curl -s -o /dev/null -m 1 \
        -X POST "http://127.0.0.1:4444/shell-hook" \
        -H "Content-Type: application/json" \
        -d "{\"command\":$(printf '%s' "$cmd" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null || echo "\"$cmd\""),\"exit_code\":$exit_code,\"cwd\":\"$PWD\"}" \
        2>/dev/null &
    disown 2>/dev/null
}

# Install hooks only if running in zsh
if [ -n "$ZSH_VERSION" ]; then
    autoload -Uz add-zsh-hook
    add-zsh-hook preexec _workroot_preexec
    add-zsh-hook precmd _workroot_precmd
fi
