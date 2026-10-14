#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test for scripts/workflow-watchdog.sh                            ║
# ║                                                                              ║
# ║  Locks down the 2026-08-26 → 2026-10-14 incident: "Workflow watchdog" was    ║
# ║  red on EVERY hourly run (step "Inspect workflows", jq exit 5) because the   ║
# ║  inline filter did                                                           ║
# ║      select(($critical | split(" ")) as $c | $c | index(.path | …))          ║
# ║  After `$c |` the input `.` is the critical-names ARRAY, so `.path` raises   ║
# ║      Cannot index array with string "path"                                   ║
# ║  Any completed non-success run inside the window reached that line, and the ║
# ║  workflow_run-triggered mirrors are `skipped` every 5 min → always ≥1 → the  ║
# ║  watchdog could never finish, so it never paged Discord about anything.      ║
# ║                                                                              ║
# ║  Must stay true FOREVER:                                                     ║
# ║   1. the incident filter on the fixture still exits 5 (proves the fixture    ║
# ║      exercises the bug pattern — if jq ever stops erroring, revisit)         ║
# ║   2. the script on the same fixture exits 0                                  ║
# ║   3. it lists ONLY critical failures: not success/cancelled/skipped, not     ║
# ║      non-critical workflows, not runs older than --since                     ║
# ║   4. stream-recorder.yml is FIRST in the critical list (jq index 0) and      ║
# ║      must still match                                                        ║
# ║   5. caller's `bash -eo pipefail` cannot kill it; empty window → exit 0,     ║
# ║      empty stdout                                                            ║
# ║   6. an unparseable payload is a loud exit 1 (code bug), not a silent 0      ║
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

# Realistic subset of GitHub's "list workflow runs" payload. Fixed dates;
# every case passes --since explicitly so nothing depends on "now".
cat > "$FIX/runs.json" <<'EOF'
{
  "total_count": 7,
  "workflow_runs": [
    {"name": "Stream Recorder",     "status": "completed", "conclusion": "failure",
     "updated_at": "2026-10-13T22:00:00Z", "html_url": "https://github.com/x/runs/1",
     "path": ".github/workflows/stream-recorder.yml"},
    {"name": "Cloud link refresh",  "status": "completed", "conclusion": "timed_out",
     "updated_at": "2026-10-13T21:30:00Z", "html_url": "https://github.com/x/runs/2",
     "path": ".github/workflows/cloud-refresh.yml"},
    {"name": "Stream Recorder",     "status": "completed", "conclusion": "success",
     "updated_at": "2026-10-13T22:05:00Z", "html_url": "https://github.com/x/runs/3",
     "path": ".github/workflows/stream-recorder.yml"},
    {"name": "Stream Recorder",     "status": "completed", "conclusion": "cancelled",
     "updated_at": "2026-10-13T22:10:00Z", "html_url": "https://github.com/x/runs/4",
     "path": ".github/workflows/stream-recorder.yml"},
    {"name": "Catbox mirror",       "status": "completed", "conclusion": "skipped",
     "updated_at": "2026-10-13T22:10:00Z", "html_url": "https://github.com/x/runs/5",
     "path": ".github/workflows/catbox-mirror.yml"},
    {"name": "Update YouTube stats","status": "completed", "conclusion": "failure",
     "updated_at": "2026-10-13T22:27:00Z", "html_url": "https://github.com/x/runs/6",
     "path": ".github/workflows/youtube-stats.yml"},
    {"name": "Deploy dashboard",    "status": "completed", "conclusion": "failure",
     "updated_at": "2026-10-10T00:00:00Z", "html_url": "https://github.com/x/runs/7",
     "path": ".github/workflows/deploy-pages.yml"},
    {"name": "Deploy dashboard",    "status": "in_progress", "conclusion": null,
     "updated_at": "2026-10-13T22:20:00Z", "html_url": "https://github.com/x/runs/8",
     "path": ".github/workflows/deploy-pages.yml"}
  ]
}
EOF
SINCE=$(date -u -d "2026-10-13T16:00:00Z" +%s)   # 6h window ending 22:00 → run 7 (Oct 10) is out
CRITICAL='stream-recorder.yml cookie-health.yml cloud-refresh.yml account-keepalive.yml youtube-to-archive.yml archive-to-mega.yml deploy-pages.yml quality-check.yml'

echo "── Case 1: the incident filter still crashes on this fixture (exit 5) ──"
jq -r --argjson since "$SINCE" --arg critical "$CRITICAL" '
  .workflow_runs[]
  | select((.status == "completed") and (.conclusion != "success") and (.conclusion != "cancelled"))
  | select((.updated_at | fromdateiso8601) >= $since)
  | select(($critical | split(" ")) as $c | $c | index(.path | split("/")[-1]))
  | .name' "$FIX/runs.json" >/dev/null 2>"$FIX/err"
RC=$?
[[ $RC -eq 5 ]] && ok "incident filter exits 5 ($(tr -d '\n' < "$FIX/err"))" \
                || bad "incident filter exited $RC — fixture no longer reproduces the bug pattern"

echo "── Case 2: script exits 0 under bash -eo pipefail and lists exactly the critical failures ──"
OUT=$(bash -eo pipefail "$SCRIPT" --since "$SINCE" --critical "$CRITICAL" "$FIX/runs.json" 2>"$FIX/err"); RC=$?
echo "$OUT" | sed 's/^/     /'
[[ $RC -eq 0 ]] && ok "exit 0" || bad "exit $RC: $(cat "$FIX/err")"
N=$(printf '%s\n' "$OUT" | sed '/^$/d' | wc -l | tr -d ' ')
[[ "$N" == "2" ]] && ok "exactly 2 bullets" || bad "expected 2 bullets, got $N"
echo "$OUT" | grep -q 'Stream Recorder.*`failure`.*runs/1'      && ok "stream-recorder failure listed (critical index 0)" || bad "stream-recorder failure missing — select(index 0) regression"
echo "$OUT" | grep -q 'Cloud link refresh.*`timed_out`.*runs/2' && ok "timed_out counts as a failure"                  || bad "timed_out not listed"
echo "$OUT" | grep -q 'runs/3' && bad "success listed"            || ok "success filtered"
echo "$OUT" | grep -q 'runs/4' && bad "cancelled listed"          || ok "cancelled filtered"
echo "$OUT" | grep -q 'runs/5' && bad "skipped listed"            || ok "skipped filtered (not a failure)"
echo "$OUT" | grep -q 'runs/6' && bad "non-critical workflow listed" || ok "non-critical workflow filtered"
echo "$OUT" | grep -q 'runs/7' && bad "stale run (outside window) listed" || ok "run older than --since filtered"
echo "$OUT" | grep -q 'runs/8' && bad "in_progress run listed"    || ok "in_progress filtered"

echo "── Case 3: empty window → exit 0, empty stdout ──"
OUT=$(bash -eo pipefail "$SCRIPT" --since "$(date -u -d '2026-10-14T00:00:00Z' +%s)" --critical "$CRITICAL" "$FIX/runs.json" 2>&1); RC=$?
[[ $RC -eq 0 && -z "$OUT" ]] && ok "exit 0, no output" || bad "exit $RC, output: '$OUT'"

echo "── Case 4: unparseable payload → loud exit 1 (never a silent 0) ──"
echo '<html>502 Bad Gateway</html>' > "$FIX/bad.json"
OUT=$(bash "$SCRIPT" --since "$SINCE" "$FIX/bad.json" 2>&1); RC=$?
[[ $RC -eq 1 ]] && ok "exit 1 on garbage payload" || bad "exit $RC on garbage payload"
echo "$OUT" | grep -q '::error::' && ok "::error:: annotation emitted" || bad "no ::error:: annotation"

echo "── Case 5: missing runs file → exit 1 ──"
bash "$SCRIPT" --since "$SINCE" "$FIX/nope.json" >/dev/null 2>&1; RC=$?
[[ $RC -eq 1 ]] && ok "exit 1 on missing file" || bad "exit $RC on missing file"

echo "── Case 6: fetch mode queries PER-WORKFLOW history (global /actions/runs?per_page=60 spans ~35 min) ──"
# The 5-min pinger fans out ~8 runs per tick, so the global list's 60 newest
# runs covered 00:40→01:15 on 2026-10-14: a 6h "lookback" that really looked
# back 35 minutes. Stub curl: answer per-workflow URLs from the fixture, and
# fail loudly if the old global endpoint is requested.
mkdir -p "$FIX/bin"
cat > "$FIX/bin/curl" <<EOF
#!/usr/bin/env bash
url="\${@: -1}"
echo "\$url" >> "$FIX/curl.log"
case "\$url" in
  */actions/workflows/*/runs*)
    wf=\$(sed -E 's#.*/actions/workflows/([^/]+)/runs.*#\1#' <<<"\$url")
    jq --arg wf "\$wf" '{workflow_runs: [.workflow_runs[] | select(.path | endswith("/" + \$wf))]}' "$FIX/runs.json" ;;
  */actions/runs*)
    echo "STUB: global runs endpoint must not be used" >&2; exit 22 ;;
  *) echo "STUB: unexpected url \$url" >&2; exit 22 ;;
esac
EOF
chmod +x "$FIX/bin/curl"
rm -f "$FIX/curl.log"
OUT=$(PATH="$FIX/bin:$PATH" GITHUB_REPOSITORY=example/repo GH_PAT=stub-token \
      bash -eo pipefail "$SCRIPT" --since "$SINCE" --critical "stream-recorder.yml cloud-refresh.yml deploy-pages.yml" 2>"$FIX/err"); RC=$?
echo "$OUT" | sed 's/^/     /'
[[ $RC -eq 0 ]] && ok "exit 0 in fetch mode" || bad "exit $RC in fetch mode: $(cat "$FIX/err")"
N=$(printf '%s\n' "$OUT" | sed '/^$/d' | wc -l | tr -d ' ')
[[ "$N" == "2" ]] && ok "merged per-workflow pages → 2 bullets" || bad "expected 2 bullets from merged pages, got $N"
CALLS=$(grep -c '/actions/workflows/' "$FIX/curl.log" 2>/dev/null || true)
[[ "${CALLS:-0}" == "3" ]] && ok "one request per critical workflow (3)" || bad "expected 3 per-workflow requests, saw ${CALLS:-0}"
grep -q 'Authorization' "$FIX/curl.log" && bad "token leaked into stub log" || ok "no credential material in URL log"

echo "── Case 7: fetch failure (API down) → ::warning:: + exit 0, never a page of its own ──"
cat > "$FIX/bin/curl" <<'EOF'
#!/usr/bin/env bash
exit 22
EOF
OUT=$(PATH="$FIX/bin:$PATH" GITHUB_REPOSITORY=example/repo GH_PAT=stub-token bash -eo pipefail "$SCRIPT" --since "$SINCE" 2>&1); RC=$?
[[ $RC -eq 0 ]] && ok "exit 0 when every fetch fails" || bad "exit $RC when fetch fails"
echo "$OUT" | grep -q '::warning::' && ok "::warning:: emitted" || bad "no ::warning:: on fetch failure"

echo
if (( FAILURES > 0 )); then echo "RESULT: ❌ $FAILURES failure(s)"; exit 1; fi
echo "RESULT: ✅ all watchdog checks passed"
