#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: mirror-health.yml step "Alert + trigger repair if degraded"║
# ║                                                                              ║
# ║  Locks down the 2026-09-02 → 2026-10-14 incident: 95 of the last 100 runs   ║
# ║  of "Mirror health" were red. The step's jq program contained               ║
# ║      "- \`\(.video_id)\`: …"                                                 ║
# ║  and \` is not a jq string escape → "Invalid escape", compile error, exit 3. ║
# ║  Under the runner's `bash -eo pipefail` the step died on that line — BEFORE  ║
# ║  the Discord alert and BEFORE the repair-mirrors dispatch. For six weeks the  ║
# ║  health sweep found dead links every 6h and told nobody and repaired         ║
# ║  nothing (only the daily 08:30 cron repair still ran).                       ║
# ║                                                                              ║
# ║  Method: replay the REAL step body (extracted from the workflow YAML, not a  ║
# ║  copy) under bash -eo pipefail with curl stubbed and a fixture that has one  ║
# ║  unhealthy recording. Must stay true FOREVER:                                ║
# ║   1. the step exits 0                                                        ║
# ║   2. the unhealthy row reaches the step summary                              ║
# ║   3. the Discord webhook is POSTed                                           ║
# ║   4. repair-mirrors.yml/dispatches is POSTed                                 ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
WF="$ROOT/.github/workflows/mirror-health.yml"

FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAILURES=$((FAILURES+1)); }

if ! python3 -c 'import yaml' 2>/dev/null; then echo "  ❌ PyYAML missing"; exit 1; fi

FIX=$(mktemp -d)
trap 'rm -rf "$FIX"' EXIT
mkdir -p "$FIX/bin" "$FIX/repo/data"

# ── Extract the real step body, substituting the expression contexts ──────────
python3 - "$WF" "$FIX/step.sh" <<'PY'
import sys, yaml
wf, out = sys.argv[1], sys.argv[2]
doc = yaml.safe_load(open(wf, encoding="utf-8"))
step = None
for job in doc["jobs"].values():
    for s in job.get("steps") or []:
        if s.get("name") == "Alert + trigger repair if degraded":
            step = s
if step is None:
    sys.exit("step 'Alert + trigger repair if degraded' not found in mirror-health.yml — rename the test if you renamed the step")
body = step["run"]
body = body.replace("${{ steps.result.outputs.dead }}", "2").replace("${{ steps.result.outputs.degraded }}", "1")
if "${{" in body:
    sys.exit("unexpected ${{ }} expression left in step body: update the test's substitutions")
open(out, "w").write(body)
PY
[[ -s "$FIX/step.sh" ]] || { bad "could not extract step body"; exit 1; }

# ── Fixture: one unhealthy recording ──────────────────────────────────────────
cat > "$FIX/repo/data/mirror-health.json" <<'EOF'
{"updated_at":"2026-10-14T00:00:00Z",
 "summary":{"total":2,"healthy":1,"degraded":1,"dead_links":2},
 "recordings":[
  {"video_id":"OKOKOKOKOK1","healthy":true, "alive":4,"dead":0},
  {"video_id":"DEADDEAD001","healthy":false,"alive":1,"dead":2}]}
EOF

# ── curl stub: log every URL, succeed ─────────────────────────────────────────
cat > "$FIX/bin/curl" <<EOF
#!/usr/bin/env bash
for a in "\$@"; do case "\$a" in http*|https*) echo "\$a" >> "$FIX/curl.log";; esac; done
exit 0
EOF
chmod +x "$FIX/bin/curl"

echo "── Replay the real step under bash -eo pipefail ──"
OUT=$(cd "$FIX/repo" && PATH="$FIX/bin:$PATH" \
      GITHUB_STEP_SUMMARY="$FIX/summary.md" GITHUB_REPOSITORY="example/repo" \
      GH_PAT="stub-token" DISCORD_WEBHOOK_URL="https://discord.invalid/api/webhooks/stub" AVATAR_URL="" \
      bash -eo pipefail "$FIX/step.sh" 2>&1); RC=$?
echo "$OUT" | sed 's/^/     /'
[[ $RC -eq 0 ]] && ok "step exit 0" || bad "step exit $RC (incident: jq compile error, exit 3)"
grep -q 'DEADDEAD001' "$FIX/summary.md" 2>/dev/null && ok "unhealthy row listed in step summary" || bad "unhealthy row missing from summary"
grep -q 'OKOKOKOKOK1' "$FIX/summary.md" 2>/dev/null && bad "healthy row leaked into summary" || ok "healthy row not listed"
grep -q 'discord.invalid' "$FIX/curl.log" 2>/dev/null && ok "Discord webhook POSTed" || bad "Discord alert never sent"
grep -q 'repair-mirrors.yml/dispatches' "$FIX/curl.log" 2>/dev/null && ok "repair-mirrors dispatch POSTed" || bad "repair-mirrors never dispatched"

echo
if (( FAILURES > 0 )); then echo "RESULT: ❌ $FAILURES failure(s)"; exit 1; fi
echo "RESULT: ✅ mirror-health alert step replays cleanly"
