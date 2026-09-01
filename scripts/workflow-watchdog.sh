#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  WORKFLOW WATCHDOG — inspect recent GitHub Actions runs for critical fails.  ║
# ║                                                                              ║
# ║  History: from 2026-08-26 → 2026-09-01 every hourly run died at             ║
# ║  "Inspect workflows" with exit 5. The inline jq was:                        ║
# ║                                                                              ║
# ║      select(($critical | split(" ")) as $c | $c | index(.path | split("/")))║
# ║                                                                              ║
# ║  After `$c |`, `.` is the critical-names ARRAY, so `.path` raises           ║
# ║      Cannot index array with string "path"                                  ║
# ║  jq exits 5. The watchdog never reached Discord. It could not page itself.  ║
# ║                                                                              ║
# ║  Rules baked in from that incident:                                         ║
# ║   1. `.path` is bound from the workflow_run BEFORE any array pipe.          ║
# ║   2. Parse/network errors warn and exit 0 — the watchdog must never be      ║
# ║      a pager event of its own.                                              ║
# ║   3. Skipped runs are not failures.                                         ║
# ║                                                                              ║
# ║  Usage: workflow-watchdog.sh [--since EPOCH] [--critical "a.yml b.yml"]     ║
# ║                              [runs.json]                                    ║
# ║  No file → fetch /repos/$GITHUB_REPOSITORY/actions/runs (needs GH_PAT).     ║
# ║  Prints markdown bullets, one per matching failure. Empty stdout = none.    ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

# Deliberately NOT set -e / pipefail: a dead jq or curl must not red-page us.
set -u

SINCE=""
CRITICAL='stream-recorder.yml cookie-health.yml cloud-refresh.yml account-keepalive.yml youtube-to-archive.yml archive-to-mega.yml deploy-pages.yml quality-check.yml'
FILE=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --since)
            SINCE="${2:-}"
            shift 2
            ;;
        --critical)
            CRITICAL="${2:-}"
            shift 2
            ;;
        --help|-h)
            echo "Usage: workflow-watchdog.sh [--since EPOCH] [--critical \"a.yml b.yml\"] [runs.json]"
            exit 0
            ;;
        -*)
            echo "::warning::watchdog: unknown flag $1" >&2
            exit 1
            ;;
        *)
            FILE="$1"
            shift
            ;;
    esac
done

if [[ -z "$SINCE" ]]; then
    LOOKBACK="${LOOKBACK_HOURS:-6}"
    SINCE=$(date -u -d "${LOOKBACK} hours ago" +%s 2>/dev/null || echo 0)
fi
if [[ ! "$SINCE" =~ ^[0-9]+$ ]]; then
    echo "::warning::watchdog: --since must be an epoch integer (got ${SINCE})" >&2
    exit 0
fi

JSON=""
if [[ -n "$FILE" ]]; then
    if [[ ! -f "$FILE" ]]; then
        echo "::warning::watchdog: JSON file not found: $FILE" >&2
        exit 0
    fi
    JSON=$(cat "$FILE") || true
else
    REPO="${GITHUB_REPOSITORY:-}"
    TOKEN="${GH_PAT:-${GITHUB_TOKEN:-${GH_TOKEN:-}}}"
    if [[ -z "$REPO" ]]; then
        echo "::warning::watchdog: GITHUB_REPOSITORY unset and no JSON file given" >&2
        exit 0
    fi
    if [[ -z "$TOKEN" ]]; then
        echo "GH_PAT missing; cannot inspect workflow runs" >&2
        exit 0
    fi
    JSON=$(curl -fsS \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/${REPO}/actions/runs?per_page=60") || {
        echo "::warning::watchdog: failed to fetch workflow runs for ${REPO}" >&2
        exit 0
    }
fi

ERR=$(mktemp)
# Bind .path from the run object BEFORE piping into the critical-names array.
# That is the entire fix. Do not "simplify" this back to `$c | index(.path|…)`.
FAILURES=$(printf '%s' "$JSON" | jq -r --argjson since "$SINCE" --arg critical "$CRITICAL" '
    ($critical | split(" ")) as $c
    | (.workflow_runs // [])[]
    | select(.status == "completed")
    | select(.conclusion != "success"
             and .conclusion != "cancelled"
             and .conclusion != "skipped")
    | select((.updated_at | fromdateiso8601) >= $since)
    | (.path // "") as $path
    | ($path | split("/")[-1]) as $file
    | select($file != "" and ($c | index($file)))
    | "- **" + .name + "**, `" + (.conclusion // "unknown") + "`, " + (.html_url // "")
' 2>"$ERR") || {
    echo "::warning::watchdog: failed to parse workflow runs JSON: $(tr '\n' ' ' < "$ERR")" >&2
    rm -f "$ERR"
    exit 0
}
rm -f "$ERR"

if [[ -n "$FAILURES" ]]; then
    printf '%s\n' "$FAILURES"
fi
exit 0
