#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test for scripts/workflow-watchdog.sh                            ║
# ║                                                                              ║
# ║  Locks down the 2026-08-26 → 2026-09-01 incident: Workflow watchdog 100%     ║
# ║  red (every hourly run, exit 5) because its jq filter did                   ║
# ║      $c | index(.path | split("/")[-1])                                     ║
# ║  After `$c |`, `.` is the critical-names ARRAY, so `.path` raises           ║
# ║      Cannot index array with string "path"                                  ║
# ║  jq exits 5, the Inspect step dies, and the watchdog never alerts.          ║
# ║                                                                              ║
# ║  Must stay true FOREVER:                                                     ║
# ║   1. the incident filter on a realistic fixture still crashes (exit 5)       ║
# ║   2. the script on the same fixture exits 0 and lists only critical fails    ║
# ║   3. success / skipped / non-critical failures are filtered out              ║
# ║   4. stream-recorder.yml (FIRST in the critical list, jq index 0) still      ║
# ║      matches — select(0) must not drop it                                    ║
# ║   5. immune to caller's bash -eo pipefail                                    ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
SCRIPT="$ROOT/scripts/workflow-watchdog.sh"

FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAILURES=$((FAILURES+1)); }

FIX=$(mktemp -d)
trap 'rm -rf "$FIX"' EXIT

# Realistic GitHub "list workflow runs" payload. Dates are fixed; tests pass
# --since so they don't depend on "now".
cat > "$FIX/runs.json" <<'EOF'
{
  "workflow_runs": [
    {
      "name": "Cloud link refresh",
      "status": "completed",
      "conclusion": "failure",
      "updated_at": "2026-09-01T10:50:40Z",
      "html_url": "https://github.com/example/runs/cloud",
      "path": ".github/workflows/cloud-refresh.yml"
    },
    {
      "name": "Stream Recorder",
      "status": "completed",
      "conclusion": "success",
      "updated_at": "2026-09-01T15:00:22Z",
      "html_url": "https://github.com/example/runs/ok",
      "path": ".github/workflows/stream-recorder.yml"
    },
    {
      "name": "Install self-test",
      "status": "completed",
      "conclusion": "failure",
      "updated_at": "2026-09-01T10:22:02Z",
      "html_url": "https://github.com/example/runs/install",
      "path": ".github/workflows/install-self-test.yml"
    },
    {
      "name": "Stream Recorder",
      "status": "completed",
      "conclusion": "failure",
      "updated_at": "2026-09-01T11:00:00Z",
      "html_url": "https://github.com/example/runs/recorder-fail",
      "path": ".github/workflows/stream-recorder.yml"
    },
    {
      "name": "✅ Quality check",
      "status": "completed",
      "conclusion": "skipped",
      "updated_at": "2026-09-01T12:00:00Z",
      "html_url": "https://github.com/example/runs/qc",
      "path": ".github/workflows/quality-check.yml"
    }
  ]
}
EOF

CRITICAL='stream-recorder.yml cookie-health.yml cloud-refresh.yml account-keepalive.yml youtube-to-archive.yml archive-to-mega.yml deploy-pages.yml quality-check.yml'
SINCE=0

echo "── Case 1: incident jq on the fixture → exit 5 (the 100% red watchdog) ──"
set +e
INCIDENT_ERR=$(jq -r --argjson since "$SINCE" --arg critical "$CRITICAL" '
  .workflow_runs[]
  | select((.status == "completed") and (.conclusion != "success") and (.conclusion != "cancelled"))
  | select((.updated_at | fromdateiso8601) >= $since)
  | select(($critical | split(" ")) as $c | $c | index(.path | split("/")[-1]))
  | "- **" + .name + "**, `" + .conclusion + "`, " + .html_url
' "$FIX/runs.json" 2>&1)
INCIDENT_RC=$?
set -e
echo "$INCIDENT_ERR" | sed 's/^/     /'
[[ "$INCIDENT_RC" -eq 5 ]] && ok "incident jq exits 5" || bad "incident jq exited $INCIDENT_RC (expected 5)"
echo "$INCIDENT_ERR" | grep -q 'Cannot index array with string "path"' \
    && ok "incident error is array-index-with-path" \
    || bad "incident error text changed: $INCIDENT_ERR"

echo "── Case 2: script on the same fixture → exit 0, only critical failures ──"
if [[ ! -f "$SCRIPT" ]]; then
    bad "scripts/workflow-watchdog.sh is missing"
else
    OUT=$(bash "$SCRIPT" --since "$SINCE" --critical "$CRITICAL" "$FIX/runs.json" 2>&1) && RC=0 || RC=$?
    echo "$OUT" | sed 's/^/     /'
    [[ "$RC" -eq 0 ]] && ok "script exit 0" || bad "script exit $RC"
    echo "$OUT" | grep -q 'Cloud link refresh' \
        && ok "reports cloud-refresh failure" || bad "missed cloud-refresh failure"
    echo "$OUT" | grep -q 'recorder-fail' \
        && ok "reports stream-recorder failure (critical list index 0)" \
        || bad "missed stream-recorder failure — select(0) dropped it?"
    echo "$OUT" | grep -q 'Install self-test' \
        && bad "reported non-critical install-self-test" \
        || ok "ignores non-critical install-self-test"
    echo "$OUT" | grep -q '/runs/ok' \
        && bad "reported a successful stream-recorder run" \
        || ok "ignores successful runs"
    echo "$OUT" | grep -q 'Quality check' \
        && bad "reported skipped quality-check" \
        || ok "ignores skipped runs"
fi

echo "── Case 3: since after every event → empty stdout, exit 0 ──"
if [[ -f "$SCRIPT" ]]; then
    OUT=$(bash "$SCRIPT" --since 9999999999 --critical "$CRITICAL" "$FIX/runs.json" 2>&1) && RC=0 || RC=$?
    [[ "$RC" -eq 0 ]] && ok "exit 0 when nothing matches" || bad "exit $RC when nothing matches"
    [[ -z "$OUT" ]] && ok "empty stdout when nothing matches" || bad "stdout not empty: $OUT"
fi

echo "── Case 4: immune to caller's bash -eo pipefail ──"
if [[ -f "$SCRIPT" ]]; then
    bash --noprofile --norc -eo pipefail -c \
        "bash \"$SCRIPT\" --since 0 --critical \"$CRITICAL\" \"$FIX/runs.json\" >/dev/null" \
        && ok "exit 0 under bash -eo pipefail" \
        || bad "died under -eo pipefail"
fi

echo "── Case 5: unreadable JSON → warning, exit 0 (watchdog must not page itself) ──"
if [[ -f "$SCRIPT" ]]; then
    echo 'not-json' > "$FIX/bad.json"
    OUT=$(bash "$SCRIPT" --since 0 "$FIX/bad.json" 2>&1) && RC=0 || RC=$?
    [[ "$RC" -eq 0 ]] && ok "exit 0 on bad JSON" || bad "exit $RC on bad JSON — watchdog would go red"
    echo "$OUT" | grep -q '::warning::' \
        && ok "emits ::warning:: on bad JSON" || bad "no warning on bad JSON"
fi

echo ""
if (( FAILURES > 0 )); then
    echo "RESULT: RED — $FAILURES case(s) failed"; exit 1
fi
echo "RESULT: GREEN — watchdog inspect locked"; exit 0
