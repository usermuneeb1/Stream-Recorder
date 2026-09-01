#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test for scripts/workflow-watchdog.sh                            ║
# ║  Locks down the 2026-08-29 → 2026-08-31 incident: workflow-watchdog.yml      ║
# ║  died with jq exit 5 ("Cannot index array with string \"path\"") whenever    ║
# ║  ANY completed non-success, non-cancelled run sat in the lookback. The       ║
# ║  sentry was blind exactly when something broke.                              ║
# ║                                                                              ║
# ║  Must stay true FOREVER:                                                     ║
# ║   1. exit code is ALWAYS 0 (a filter miss is empty output, not a page)       ║
# ║   2. a critical failure is printed; a non-critical failure is not            ║
# ║   3. skipped / cancelled / success never page                                ║
# ║   4. the OLD jq filter still fails on the incident fixture (drift lock)      ║
# ║   5. immune to the caller's bash -eo pipefail (GitHub default)               ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
SCRIPT="$ROOT/scripts/workflow-watchdog.sh"

FAILURES=0
ok()   { echo "  ✅ $1"; }
bad()  { echo "  ❌ $1"; FAILURES=$((FAILURES+1)); }

FIX=$(mktemp -d)
trap 'rm -rf "$FIX"' EXIT

SINCE=1700000000   # 2023-11-14 — well before the fixture timestamps
CRITICAL='stream-recorder.yml cookie-health.yml cloud-refresh.yml account-keepalive.yml youtube-to-archive.yml archive-to-mega.yml deploy-pages.yml quality-check.yml'

# Exact filter copied from workflow-watchdog.yml (the incident).
OLD_JQ='
            .workflow_runs[]
            | select((.status == "completed") and (.conclusion != "success") and (.conclusion != "cancelled"))
            | select((.updated_at | fromdateiso8601) >= $since)
            | select(($critical | split(" ")) as $c | $c | index(.path | split("/")[-1]))
            | "- **" + .name + "**, `" + .conclusion + "`, " + .html_url
'

write_runs() {
    cat > "$FIX/runs.json"
}

run_old() {
    jq -r --argjson since "$SINCE" --arg critical "$CRITICAL" "$OLD_JQ" "$FIX/runs.json"
}

run_new() {
    bash "$SCRIPT" --since "$SINCE" --critical "$CRITICAL" "$FIX/runs.json"
}

echo "── Case 1: incident repro — OLD jq dies on any completed failure ──"
write_runs <<'EOF'
{"workflow_runs":[
  {"name":"Thumbnail generator","status":"completed","conclusion":"failure",
   "updated_at":"2026-08-31T23:00:00Z","html_url":"https://example/1",
   "path":".github/workflows/thumbnail-gen.yml"}
]}
EOF
run_old >/dev/null 2>"$FIX/old.err"; RC=$?
[[ $RC -eq 5 ]] && ok "old jq exits 5 on a non-critical failure (the incident)" \
                 || bad "old jq exit $RC, expected 5 — incident fixture drifted?"
grep -q 'Cannot index array with string "path"' "$FIX/old.err" \
    && ok "old jq error is 'Cannot index array with string \"path\"'" \
    || bad "old jq stderr was: $(tr '\n' ' ' <"$FIX/old.err")"

echo "── Case 2: NEW script on the same non-critical failure — empty, exit 0 ──"
OUT=$(run_new 2>&1); RC=$?
[[ $RC -eq 0 ]] && ok "exit 0 on non-critical failure" || bad "exit $RC on non-critical failure"
[[ -z "${OUT// }" ]] && ok "non-critical failure produces no page" \
                     || bad "non-critical leaked: $OUT"

echo "── Case 3: NEW script on a critical failure — prints it, exit 0 ──"
write_runs <<'EOF'
{"workflow_runs":[
  {"name":"Stream Recorder","status":"completed","conclusion":"failure",
   "updated_at":"2026-08-31T23:00:00Z","html_url":"https://example/sr",
   "path":".github/workflows/stream-recorder.yml"},
  {"name":"Thumbnail generator","status":"completed","conclusion":"failure",
   "updated_at":"2026-08-31T23:00:00Z","html_url":"https://example/th",
   "path":".github/workflows/thumbnail-gen.yml"}
]}
EOF
OUT=$(run_new 2>&1); RC=$?
[[ $RC -eq 0 ]] && ok "exit 0 on critical failure" || bad "exit $RC on critical failure"
echo "$OUT" | grep -q 'Stream Recorder' && ok "critical Stream Recorder is listed" \
                                        || bad "critical missing: $OUT"
echo "$OUT" | grep -q 'Thumbnail' && bad "non-critical Thumbnail leaked into page" \
                                  || ok "non-critical Thumbnail suppressed"
COUNT=$(printf '%s\n' "$OUT" | sed '/^$/d' | wc -l | tr -d ' ')
[[ "$COUNT" == "1" ]] && ok "exactly one failure line" || bad "count=$COUNT lines: $OUT"

echo "── Case 4: success / cancelled / skipped never page ──"
write_runs <<'EOF'
{"workflow_runs":[
  {"name":"Stream Recorder","status":"completed","conclusion":"success",
   "updated_at":"2026-08-31T23:00:00Z","html_url":"u","path":".github/workflows/stream-recorder.yml"},
  {"name":"Stream Recorder","status":"completed","conclusion":"cancelled",
   "updated_at":"2026-08-31T23:00:00Z","html_url":"u","path":".github/workflows/stream-recorder.yml"},
  {"name":"Quality check","status":"completed","conclusion":"skipped",
   "updated_at":"2026-08-31T23:00:00Z","html_url":"u","path":".github/workflows/quality-check.yml"}
]}
EOF
OUT=$(run_new 2>&1); RC=$?
[[ $RC -eq 0 && -z "${OUT// }" ]] && ok "success/cancelled/skipped produce no page" \
                                  || bad "rc=$RC out=$OUT"

echo "── Case 5: lookback — old failure excluded ──"
write_runs <<'EOF'
{"workflow_runs":[
  {"name":"Stream Recorder","status":"completed","conclusion":"failure",
   "updated_at":"2020-01-01T00:00:00Z","html_url":"u","path":".github/workflows/stream-recorder.yml"}
]}
EOF
OUT=$(run_new 2>&1); RC=$?
[[ $RC -eq 0 && -z "${OUT// }" ]] && ok "failure outside lookback is ignored" \
                                  || bad "stale failure leaked: $OUT"

echo "── Case 6: malformed payload / missing path — exit 0, no crash ──"
printf 'not json' > "$FIX/runs.json"
OUT=$(run_new 2>&1); RC=$?
[[ $RC -eq 0 ]] && ok "exit 0 on invalid JSON" || bad "exit $RC on invalid JSON"
write_runs <<'EOF'
{"workflow_runs":[
  {"name":"Stream Recorder","status":"completed","conclusion":"failure",
   "updated_at":"2026-08-31T23:00:00Z","html_url":"u"}
]}
EOF
OUT=$(run_new 2>&1); RC=$?
[[ $RC -eq 0 && -z "${OUT// }" ]] && ok "missing .path does not crash (and does not match)" \
                                  || bad "rc=$RC out=$OUT"

echo "── Case 7: immune to caller's -eo pipefail (GitHub default bash shell) ──"
write_runs <<'EOF'
{"workflow_runs":[
  {"name":"Thumbnail generator","status":"completed","conclusion":"failure",
   "updated_at":"2026-08-31T23:00:00Z","html_url":"u","path":".github/workflows/thumbnail-gen.yml"}
]}
EOF
bash --noprofile --norc -eo pipefail -c "bash \"$SCRIPT\" --since \"$SINCE\" --critical \"$CRITICAL\" \"$FIX/runs.json\" >/dev/null 2>&1"; RC=$?
[[ $RC -eq 0 ]] && ok "exit 0 even under bash -eo pipefail" \
                || bad "died ($RC) under -eo pipefail — THE INCIDENT IS BACK"

echo "── Case 8: script is the source of truth (workflow YAML may lag) ──"
# This automation token cannot push .github/workflows/* (no `workflows`
# permission — same constraint as #106). Until the one-step YAML change
# lands, the old inline jq keeps firing. The script + this test are the
# lock; case 1 proves the old filter still dies on the incident fixture.
[[ -x "$SCRIPT" ]] && ok "scripts/workflow-watchdog.sh is executable" \
                    || bad "script missing or not executable"
WF="$ROOT/.github/workflows/workflow-watchdog.yml"
if [[ -f "$WF" ]] && grep -q 'bash scripts/workflow-watchdog.sh' "$WF"; then
    ok "workflow-watchdog.yml already invokes the script"
elif [[ -f "$WF" ]] && grep -q 'as $c | $c | index(.path' "$WF"; then
    echo "     ⚠️  workflow still has the old inline jq (needs workflows permission to land)"
    ok "old filter still in YAML — expected until the workflow diff lands"
else
    ok "workflow file not in this checkout (skipped)"
fi

echo "── Case 9: timed_out critical run is a failure ──"
write_runs <<'EOF'
{"workflow_runs":[
  {"name":"Stream Recorder","status":"completed","conclusion":"timed_out",
   "updated_at":"2026-08-31T23:00:00Z","html_url":"https://example/to",
   "path":".github/workflows/stream-recorder.yml"}
]}
EOF
OUT=$(run_new 2>&1); RC=$?
echo "$OUT" | grep -q 'timed_out' && [[ $RC -eq 0 ]] && ok "timed_out critical run is listed" \
                                                    || bad "timed_out missed: rc=$RC out=$OUT"

echo ""
if (( FAILURES > 0 )); then
    echo "RESULT: RED — $FAILURES case(s) failed"; exit 1
fi
echo "RESULT: GREEN — all watchdog behaviors locked"; exit 0
