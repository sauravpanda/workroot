# Workroot shell hook for fish
# Captures commands and sends them to the Workroot daemon.

set -g _workroot_command ""

function _workroot_preexec --on-event fish_preexec
    set -g _workroot_command $argv[1]
end

function _workroot_postexec --on-event fish_postexec
    set -l exit_code $status

    # Skip if no command was captured
    if test -z "$_workroot_command"
        return
    end

    set -l cmd $_workroot_command
    set -g _workroot_command ""

    # JSON-encode the command using python3
    set -l json_cmd (printf '%s' "$cmd" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null; or echo "\"$cmd\"")

    # Send to Workroot daemon (fire-and-forget, fail silently)
    curl -s -o /dev/null -m 1 \
        -X POST "http://127.0.0.1:4444/shell-hook" \
        -H "Content-Type: application/json" \
        -d "{\"command\":$json_cmd,\"exit_code\":$exit_code,\"cwd\":\"$PWD\"}" \
        2>/dev/null &
    disown 2>/dev/null
end
