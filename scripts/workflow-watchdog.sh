#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  WORKFLOW-WATCHDOG — list recent CRITICAL workflow failures                  ║
# ║                                                                              ║
# ║  History: the old inline jq in workflow-watchdog.yml was:                    ║
# ║      select(($critical | split(" ")) as $c | $c | index(.path | split("/"))) ║
# ║  After `as $c | $c |`, `.` is the array of filenames, so `.path` tried to    ║
# ║  index an array with a string → jq exit 5. GitHub's default                  ║
# ║  `bash -eo pipefail` turned that into a red step.                            ║
# ║                                                                              ║
# ║  The crash fired exactly when the watchdog was needed: ANY completed         ║
# ║  non-success, non-cancelled run in the lookback (even a non-critical         ║
# ║  thumbnail failure, even a skipped quality-check) evaluated the broken       ║
# ║  select and killed the job before Discord could be notified. Five            ║
# ║  consecutive red runs 2026-08-29 → 2026-08-31, annotation "exit code 5".     ║
# ║  Success/cancelled-only windows stayed green — the sentry was blind          ║
# ║  precisely when something actually broke.                                    ║
# ║                                                                              ║
# ║  Rules baked in from that incident:                                          ║
# ║   1. This script always exits 0. A filter miss is empty output, not a page.  ║
# ║   2. `.` after `as $c` is never used to read the run object; bind $name.     ║
# ║   3. Skipped runs are not failures (path-filter skips would otherwise page). ║
# ║   4. Invalid JSON / missing .workflow_runs → warning + empty, never death.   ║
# ║                                                                              ║
# ║  Usage: workflow-watchdog.sh [--since EPOCH] [--critical "a.yml b.yml"] \    ║
# ║                              [runs.json]                                     ║
# ║         JSON on stdin if no file given. Stdout = markdown failure lines.     ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

# Deliberately NOT set -e / pipefail: a filter that matches nothing, or a
# malformed payload, must never kill the watchdog.
set -u

SINCE=""
CRITICAL="stream-recorder.yml cookie-health.yml cloud-refresh.yml account-keepalive.yml youtube-to-archive.yml archive-to-mega.yml deploy-pages.yml quality-check.yml"
FILE=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --since)    SINCE="${2:-}"; shift 2 ;;
        --critical) CRITICAL="${2:-}"; shift 2 ;;
        --)         shift; break ;;
        -*)         echo "unknown flag: $1" >&2; exit 0 ;;
        *)          FILE="$1"; shift ;;
    esac
done

if [[ -z "$SINCE" ]]; then
    SINCE=$(date -u -d '6 hours ago' +%s 2>/dev/null || date -u -v-6H +%s 2>/dev/null || echo 0)
fi

# Reject non-numeric --since rather than letting jq --argjson blow up.
if ! [[ "$SINCE" =~ ^[0-9]+$ ]]; then
    echo "::warning::workflow-watchdog: --since must be an epoch integer, got ${SINCE}" >&2
    exit 0
fi

INPUT=$(mktemp)
JQERR=$(mktemp)
trap 'rm -f "$INPUT" "$JQERR"' EXIT
if [[ -n "$FILE" ]]; then
    if [[ ! -f "$FILE" ]]; then
        echo "::warning::workflow-watchdog: runs file not found: $FILE" >&2
        exit 0
    fi
    cat "$FILE" > "$INPUT"
else
    cat > "$INPUT"
fi

if ! jq empty "$INPUT" >/dev/null 2>&1; then
    echo "::warning::workflow-watchdog: GitHub runs payload is not JSON — skipping inspect" >&2
    exit 0
fi

# Bind the run's basename to $name BEFORE piping into the critical-list
# array. The incident was `$c | index(.path | …)` — after `$c |`, `.` is
# the array, so `.path` raised "Cannot index array with string \"path\"".
jq -r --argjson since "$SINCE" --arg critical "$CRITICAL" '
    (.workflow_runs // [])
    | .[]
    | select(
        (.status == "completed")
        and (.conclusion != "success")
        and (.conclusion != "cancelled")
        and (.conclusion != "skipped")
      )
    | select(((.updated_at // "1970-01-01T00:00:00Z") | fromdateiso8601) >= $since)
    | ((.path // "") | split("/")[-1]) as $name
    | select(($critical | split(" ")) | index($name))
    | "- **" + (.name // "unknown") + "**, `" + (.conclusion // "unknown") + "`, " + (.html_url // "")
' "$INPUT" 2>/tmp/workflow-watchdog.jq.err || {
    echo "::warning::workflow-watchdog: jq filter failed: $(tr '\n' ' ' </tmp/workflow-watchdog.jq.err)" >&2
}

rm -f /tmp/workflow-watchdog.jq.err
exit 0
