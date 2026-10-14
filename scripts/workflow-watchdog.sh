#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  WORKFLOW WATCHDOG — list recent failed runs of CRITICAL workflows.          ║
# ║                                                                              ║
# ║  Called hourly by .github/workflows/workflow-watchdog.yml. Prints one        ║
# ║  markdown bullet per failure to stdout (empty stdout = nothing to page).     ║
# ║                                                                              ║
# ║  History (2026-08-26 → 2026-10-14, every hourly run red, exit 5):            ║
# ║  the filter used to live inline in the workflow as                           ║
# ║      select(($critical | split(" ")) as $c | $c | index(.path | …))          ║
# ║  After `$c |` the input `.` is the critical-names ARRAY, so `.path` raised   ║
# ║      Cannot index array with string "path"                                   ║
# ║  Any completed non-success run in the window reached that line, and the     ║
# ║  workflow_run-triggered mirrors are `skipped` every 5 min, so one always     ║
# ║  did. The watchdog died before Discord, every hour, for 7 weeks.             ║
# ║                                                                              ║
# ║  Rules baked in from that incident:                                          ║
# ║   1. Bind the run's path BEFORE piping into the critical-names array.        ║
# ║      Do not "simplify" it back. tests/workflow-watchdog-test.sh guards it.   ║
# ║   2. `skipped`, `cancelled`, `neutral` are not failures.                     ║
# ║   3. A fetch failure (network / API 5xx) is a ::warning:: + exit 0 — the     ║
# ║      next hourly tick retries; don't page for transient GitHub hiccups.      ║
# ║   4. An unparseable payload after a successful fetch is a CODE bug →         ║
# ║      ::error:: + exit 1, so the run goes red and somebody looks.             ║
# ║                                                                              ║
# ║  Usage: workflow-watchdog.sh [--since EPOCH] [--critical "a.yml b.yml"]      ║
# ║                              [runs.json]                                     ║
# ║    runs.json omitted → GET /repos/$GITHUB_REPOSITORY/actions/runs            ║
# ║                        (auth: GH_PAT, else GITHUB_TOKEN, else GH_TOKEN)      ║
# ║    --since omitted   → now − ${LOOKBACK_HOURS:-6}h                           ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -uo pipefail

SINCE=""
CRITICAL='stream-recorder.yml cookie-health.yml cloud-refresh.yml account-keepalive.yml youtube-to-archive.yml archive-to-mega.yml deploy-pages.yml quality-check.yml'
FILE=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --since)    SINCE="${2:-}";    shift 2 ;;
        --critical) CRITICAL="${2:-}"; shift 2 ;;
        -h|--help)
            sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'
            exit 0 ;;
        -*)
            echo "::error::watchdog: unknown flag $1" >&2
            exit 1 ;;
        *)  FILE="$1"; shift ;;
    esac
done

if [[ -z "$SINCE" ]]; then
    LOOKBACK="${LOOKBACK_HOURS:-6}"
    SINCE=$(date -u -d "${LOOKBACK} hours ago" +%s 2>/dev/null) || SINCE=""
fi
if [[ ! "$SINCE" =~ ^[0-9]+$ ]]; then
    echo "::error::watchdog: --since must be an epoch integer (got '${SINCE}')" >&2
    exit 1
fi

# ── Obtain the payload ────────────────────────────────────────────────────────
JSON=""
if [[ -n "$FILE" ]]; then
    if [[ ! -f "$FILE" ]]; then
        echo "::error::watchdog: runs file not found: $FILE" >&2
        exit 1
    fi
    JSON=$(cat "$FILE")
else
    REPO="${GITHUB_REPOSITORY:-}"
    TOKEN="${GH_PAT:-${GITHUB_TOKEN:-${GH_TOKEN:-}}}"
    if [[ -z "$REPO" ]]; then
        echo "::error::watchdog: GITHUB_REPOSITORY unset and no runs file given" >&2
        exit 1
    fi
    if [[ -z "$TOKEN" ]]; then
        echo "::warning::watchdog: no GH_PAT/GITHUB_TOKEN — cannot inspect workflow runs" >&2
        exit 0
    fi
    # One request PER critical workflow, not the global /actions/runs list.
    # Measured 2026-10-14: the 5-min pinger fans out ~8 runs per tick, so the
    # global list's newest 60 runs spanned 00:40→01:15 — a "6h lookback" that
    # really looked back 35 minutes and could not see cloud-refresh at 06:00.
    PAGES=()
    FETCH_FAILED=0
    for wf in $CRITICAL; do
        if page=$(curl -fsS --max-time 60 \
                -H "Authorization: Bearer ${TOKEN}" \
                -H "Accept: application/vnd.github+json" \
                "https://api.github.com/repos/${REPO}/actions/workflows/${wf}/runs?per_page=20"); then
            PAGES+=("$page")
        else
            FETCH_FAILED=$((FETCH_FAILED + 1))
            echo "::warning::watchdog: failed to fetch runs for ${wf} (transient?)" >&2
        fi
    done
    if [[ ${#PAGES[@]} -eq 0 ]]; then
        echo "::warning::watchdog: could not fetch any workflow runs for ${REPO} — skipping this tick" >&2
        exit 0
    fi
    # Merge the per-workflow pages into one {workflow_runs: [...]} document.
    JSON=$(printf '%s\n' "${PAGES[@]}" | jq -s '{workflow_runs: ([.[].workflow_runs // []] | add)}') || {
        echo "::error::watchdog: could not merge per-workflow pages" >&2
        exit 1
    }
fi

# ── Filter ───────────────────────────────────────────────────────────────────
# $c is bound at the top level, and the run's own path is bound into $file
# while `.` is still the run object. Only THEN do we index into $c.
ERR=$(mktemp)
FAILURES=$(printf '%s' "$JSON" | jq -r --argjson since "$SINCE" --arg critical "$CRITICAL" '
    ($critical | split(" ") | map(select(length > 0))) as $c
    | (.workflow_runs // [])[]
    | select(.status == "completed")
    | select((.conclusion // "") as $r
             | ($r != "success" and $r != "cancelled" and $r != "skipped" and $r != "neutral"))
    | select(((.updated_at // "1970-01-01T00:00:00Z") | fromdateiso8601) >= $since)
    | ((.path // "") | split("/") | last) as $file
    | select($file != "" and ($c | index($file)) != null)
    | "- **" + (.name // $file) + "**, `" + (.conclusion // "unknown") + "`, " + (.html_url // "")
' 2>"$ERR")
RC=$?
if [[ $RC -ne 0 ]]; then
    echo "::error::watchdog: jq failed (exit $RC) on the runs payload: $(tr '\n' ' ' < "$ERR")" >&2
    rm -f "$ERR"
    exit 1
fi
rm -f "$ERR"

[[ -n "$FAILURES" ]] && printf '%s\n' "$FAILURES"
exit 0
