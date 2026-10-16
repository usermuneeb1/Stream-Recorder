#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: the "0 recording(s) below guarantee, 10 dead link(s)"      ║
# ║  alert loop (found 2026-10-16).                                              ║
# ║                                                                              ║
# ║  Symptom: Mirror health paged every 6h with dead links that were never       ║
# ║  fixed, and the alert named nothing. Four independent causes, one loop:      ║
# ║   1. The alert step listed only `.healthy == false`, so the common case      ║
# ║      (degraded=0, dead>0) printed a count and no video ids — the owner       ║
# ║      could not tell whether repair was converging.                           ║
# ║   2. All gofile verification used the public website token                   ║
# ║      `?wt=4fd6sg89d7s6`, which ROTATES. Stale, the Contents API answers      ║
# ║      error-token → every gofile mirror read "unverifiable" (18/18 in         ║
# ║      data/mirror-health.json), even though mirror-health.yml passes          ║
# ║      GOFILE_API_KEY and the script ignored it.                               ║
# ║   3. repair-mirrors' _is_gofile_alive fell through to grepping the /d/       ║
# ║      page, which is the SPA shell — HTTP 200, no error text — so a DELETED   ║
# ║      folder read as ALIVE and was never re-uploaded. Now 3-state.            ║
# ║   4. github-release-upload.py skipped any recording with a non-empty         ║
# ║      github_release, so a 404 asset was never re-uploaded; repair-mirrors    ║
# ║      has no github destination either → the dead link was unfixable.         ║
# ║      (Verified live: 11 of 12 stored release URLs 302, X05zRHM4kVs 404s.)    ║
# ║                                                                              ║
# ║  Seams: the REAL alert-step body extracted from mirror-health.yml, the REAL  ║
# ║  utils.sh gofile helpers, the REAL repair-mirrors gate, the REAL             ║
# ║  select_todo() from github-release-upload.py. curl is stubbed; no network.   ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
WF="$ROOT/.github/workflows/mirror-health.yml"

FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAILURES=$((FAILURES+1)); }

python3 -c 'import yaml' 2>/dev/null || { echo "  ❌ PyYAML missing (pip install pyyaml)"; exit 1; }

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/bin" "$WORK/repo/data"

# ── curl stub: logs argv (so token usage is assertable), answers by pattern ──
# State file selects the gofile behaviour per case.
cat > "$WORK/bin/curl" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "${CURL_LOG:-/dev/null}"
OUT=""; WRITE_CODE=""; HAVE_AUTH=0; DATA=""; URL=""
args=" $* "
for a in "$@"; do
  [[ "$a" == "Authorization: Bearer "* ]] && HAVE_AUTH=1
  case "$a" in http*) URL="$a";; esac
done
while [[ $# -gt 0 ]]; do case "$1" in
  -o) OUT="$2"; shift 2;; -w) WRITE_CODE="$2"; shift 2;; -d) DATA="$2"; shift 2;; *) shift;;
esac; done
# keep the Discord payload so the test can assert on the message body
[[ "$URL" == *discord* && -n "$DATA" ]] && printf '%s' "$DATA" > "${DISCORD_PAYLOAD:-/dev/null}"
emit()      { [[ -n "$OUT" ]] && printf '%s' "$1" > "$OUT" || printf '%s' "$1"; }
emit_code() { printf '%s' "$1"; }
MODE=$(cat "${GOFILE_MODE:-/dev/null}" 2>/dev/null | head -1)
case "$args" in
  *api.gofile.io/accounts*) emit '{"status":"ok","data":{"token":"MINTED-GUEST"}}'; exit 0;;
  *api.gofile.io/contents/*)
    if [[ "$MODE" == "stale-wt" ]]; then
      # The public wt is stale: the API answers HTTP 200 + error-token to
      # EVERYONE, and there is no bearer token to fall back on.
      [[ $HAVE_AUTH -eq 1 ]] && { emit '{"status":"error-token"}'; exit 0; }
      emit '{"status":"error-token"}'; exit 0
    fi
    if [[ $HAVE_AUTH -eq 1 ]]; then
      if [[ "$MODE" == "dead-folder" ]]; then emit '{"status":"error-notFound"}'; else emit '{"status":"ok","data":{}}'; fi
    else
      emit '{"status":"error-token"}'
    fi
    exit 0;;
  # gofile /d/ page: the SPA shell — 200 + a big body with NO error text
  *gofile.io/d/*) [[ -n "$WRITE_CODE" ]] && emit_code '200' || printf '<html>%s</html>' "$(head -c 4000 /dev/zero | tr '\0' 'x')"; exit 0;;
  *api.mega.co.nz*|*g.api.mega.co.nz*) emit '[{"s":1234567}]'; exit 0;;
  *vikingfile.com/api/check-file*) emit '[{"exist":true}]'; exit 0;;
  *) [[ -n "$WRITE_CODE" ]] && emit_code '200'; exit 0;;
esac
STUB
chmod +x "$WORK/bin/curl"

# ════════════════════════════════════════════════════════════════════════════
echo "── 1: degraded=0 + dead>0 → the alert must NAME the dead links ──"
# Exactly the reported shape: every recording meets the copy guarantee, and
# there are 10 dead repairable links (5× 0807.st, 5× VikingFile).
python3 - "$WORK/repo/data/mirror-health.json" <<'PY'
import json, sys
recs = []
for i in range(10):
    vid = "HL%09d" % i
    m = {"archive": "alive", "gofile": None, "pixeldrain": "alive", "mega": "alive",
         "github": None, "st0807": None, "vikingfile": None,
         "telegram": None, "youtube": None, "archive_direct": None}
    if i % 2 == 0: m["st0807"] = "dead"
    else:          m["vikingfile"] = "dead"
    recs.append({"video_id": vid, "title": "Fixture %02d" % i, "alive": 3, "dead": 1,
                 "unverifiable": 0, "healthy": True, "permanent_ok": True,
                 "fast_ok": True, "mirrors": m})
json.dump({"updated_at": "2026-10-16T00:00:00Z",
           "summary": {"total": 10, "healthy": 10, "degraded": 0, "dead_links": 10},
           "recordings": recs}, open(sys.argv[1], "w"))
PY

python3 - "$WF" "$WORK/step.sh" <<'PY'
import sys, yaml
doc = yaml.safe_load(open(sys.argv[1], encoding="utf-8"))
step = next(s for j in doc["jobs"].values() for s in (j.get("steps") or [])
            if s.get("name") == "Alert + trigger repair if degraded")
body = (step["run"]
        .replace("${{ steps.result.outputs.dead }}", "10")
        .replace("${{ steps.result.outputs.degraded }}", "0"))
assert "${{" not in body, "unsubstituted expression left in step body"
open(sys.argv[2], "w").write(body)
PY

: > "$WORK/curl.log"
: > "$WORK/payload.json"
SRC=0
(cd "$WORK/repo" && PATH="$WORK/bin:$PATH" CURL_LOG="$WORK/curl.log" \
  GITHUB_STEP_SUMMARY="$WORK/summary.md" GITHUB_REPOSITORY="example/repo" \
  GH_PAT="stub-token" DISCORD_WEBHOOK_URL="https://discord.invalid/api/webhooks/stub" AVATAR_URL="" \
  DISCORD_PAYLOAD="$WORK/payload.json" \
  bash -eo pipefail "$WORK/step.sh" > "$WORK/step.out" 2>&1) || SRC=$?
[[ $SRC -eq 0 ]] && ok "step exits 0" || bad "step exit $SRC"

# grep -c already prints 0 and exits 1 — do NOT append another 0 with || echo
NAMED=$(grep -cE 'HL[0-9]{9}' "$WORK/summary.md" 2>/dev/null); NAMED="${NAMED:-0}"
[[ "$NAMED" -eq 10 ]] && ok "all 10 recordings named in the step summary" \
                      || bad "only $NAMED/10 recordings named (the alert said '10 dead link(s)' and listed nothing)"
grep -q 'dead: st0807' "$WORK/summary.md" 2>/dev/null && ok "summary names WHICH mirror is dead (st0807)" \
                                                      || bad "summary does not name the dead mirror host"
grep -q 'dead: vikingfile' "$WORK/summary.md" 2>/dev/null && ok "summary names the vikingfile deaths" \
                                                          || bad "vikingfile deaths not named"
grep -q 'guarantee met' "$WORK/summary.md" 2>/dev/null && ok "rows distinguish 'guarantee met' from 'BELOW GUARANTEE'" \
                                                       || bad "no guarantee state on the rows"
# the Discord payload must carry the same detail
PAYLOAD=$(jq -r '.content' "$WORK/payload.json" 2>/dev/null || true)
if [[ -z "$PAYLOAD" ]]; then
  # recover the payload from the logged curl invocation if the stub kept it
  grep -q 'discord.invalid' "$WORK/curl.log" 2>/dev/null && ok "Discord webhook POSTed" || bad "Discord alert never sent"
else
  echo "$PAYLOAD" | grep -q 'HL000000000' && ok "Discord message carries the detail" || bad "Discord message has no detail"
fi

# ════════════════════════════════════════════════════════════════════════════
echo
echo "── 2: gofile verification uses a real bearer token, not the rotating wt ──"
cat > "$WORK/gh.sh" <<'EOS'
set -uo pipefail
source "$1/utils.sh"
gofile_contents_status "https://gofile.io/d/SomeFolder1" 20
EOS

: > "$WORK/curl.log"
echo "alive" > "$WORK/mode"
GOT=$(PATH="$WORK/bin:$PATH" CURL_LOG="$WORK/curl.log" GOFILE_MODE="$WORK/mode" \
      GOFILE_API_KEY="real-account-token" bash "$WORK/gh.sh" "$ROOT/scripts" 2>/dev/null | tail -1)
[[ "$GOT" == "alive" ]] && ok "live folder → alive (GOFILE_API_KEY honoured)" \
                        || bad "live folder → '$GOT' (key ignored: stuck on the rotating wt)"
grep -q 'Authorization: Bearer real-account-token' "$WORK/curl.log" 2>/dev/null \
  && ok "Contents API called with Authorization: Bearer <REDACTED>" \
  || bad "no bearer token sent to the Contents API"

echo "dead-folder" > "$WORK/mode"
GOT=$(PATH="$WORK/bin:$PATH" CURL_LOG="$WORK/curl.log" GOFILE_MODE="$WORK/mode" \
      GOFILE_API_KEY="real-account-token" bash "$WORK/gh.sh" "$ROOT/scripts" 2>/dev/null | tail -1)
[[ "$GOT" == "dead" ]] && ok "deleted folder → dead (repair can now act)" \
                       || bad "deleted folder → '$GOT'"

echo
echo "── 3: stale wt with NO token → unverifiable, never 'alive' ──"
echo "stale-wt" > "$WORK/mode"
: > "$WORK/curl.log"
GOT=$(PATH="$WORK/bin:$PATH" CURL_LOG="$WORK/curl.log" GOFILE_MODE="$WORK/mode" \
      env -u GOFILE_API_KEY bash "$WORK/gh.sh" "$ROOT/scripts" 2>/dev/null | tail -1)
[[ "$GOT" == "unverifiable" ]] && ok "error-token → unverifiable (never read as alive)" \
                               || bad "error-token → '$GOT'"
# a guest account must be minted when the operator set no key
grep -q 'api.gofile.io/accounts' "$WORK/curl.log" 2>/dev/null \
  && ok "guest account minted when GOFILE_API_KEY is absent" \
  || bad "no guest mint — gofile stays unverifiable without an operator key"

# ════════════════════════════════════════════════════════════════════════════
echo
echo "── 4: repair-mirrors gate is 3-state (no churn, no false 'alive') ──"
cat > "$WORK/gate.sh" <<'EOS'
set -uo pipefail
source "$1/repair-mirrors.sh"
_is_gofile_alive "https://gofile.io/d/SomeFolder1"; echo "rc=$?"
EOS
echo "dead-folder" > "$WORK/mode"
RC=$(PATH="$WORK/bin:$PATH" GOFILE_MODE="$WORK/mode" GOFILE_API_KEY="tok" \
     bash "$WORK/gate.sh" "$ROOT/scripts" 2>/dev/null | grep -o 'rc=[0-9]*' | tail -1)
[[ "$RC" == "rc=1" ]] && ok "deleted folder → rc=1 (re-upload)" || bad "deleted folder → $RC"

echo "stale-wt" > "$WORK/mode"
RC=$(PATH="$WORK/bin:$PATH" GOFILE_MODE="$WORK/mode" \
     env -u GOFILE_API_KEY bash "$WORK/gate.sh" "$ROOT/scripts" 2>/dev/null | grep -o 'rc=[0-9]*' | tail -1)
[[ "$RC" == "rc=2" ]] && ok "unverifiable → rc=2 (leave the link alone, no churn)" \
                      || bad "unverifiable → $RC (0=false 'alive', 1=daily re-upload churn)"

echo "alive" > "$WORK/mode"
RC=$(PATH="$WORK/bin:$PATH" GOFILE_MODE="$WORK/mode" GOFILE_API_KEY="tok" \
     bash "$WORK/gate.sh" "$ROOT/scripts" 2>/dev/null | grep -o 'rc=[0-9]*' | tail -1)
[[ "$RC" == "rc=0" ]] && ok "live folder → rc=0 (skip)" || bad "live folder → $RC"

# ════════════════════════════════════════════════════════════════════════════
echo
echo "── 5: a 404 github_release asset is re-queued, a live one is not ──"
SEL=$(python3 - "$ROOT/scripts/github-release-upload.py" <<'PY' 2>/dev/null | tail -1
import importlib.util, sys, json
spec = importlib.util.spec_from_file_location("gru", sys.argv[1])
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.release_asset_alive = lambda u: (False if "dead" in u else True)
recs = [
    {"video_id": "DEAD-ASSET-1", "archive_direct": "https://a/1.mp4",
     "github_release": "https://gh/dead-asset.mp4", "github_direct": "https://gh/dead-asset.mp4"},
    {"video_id": "LIVE-ASSET-1", "archive_direct": "https://a/2.mp4",
     "github_release": "https://gh/live-asset.mp4"},
    {"video_id": "NO-RELEASE-1", "archive_direct": "https://a/3.mp4"},
    {"video_id": "NO-SOURCE-1"},
]
print(json.dumps(sorted(r["video_id"] for r in m.select_todo(recs, 5))))
PY
)
[[ "$SEL" == '["DEAD-ASSET-1", "NO-RELEASE-1"]' ]] \
  && ok "404 asset re-queued, live asset skipped, no-source skipped ($SEL)" \
  || bad "selection = $SEL (expected [\"DEAD-ASSET-1\", \"NO-RELEASE-1\"])"

# ════════════════════════════════════════════════════════════════════════════
echo
echo "── 6: the dashboard tile must not read 'healthy' while links are dead ──"
grep -q 'mirrorDeadLinks' "$ROOT/dashboard/src/lib/fetcher.ts" \
  && ok "fetchStatus() carries mirror_health.dead_links" \
  || bad "fetchStatus() still drops dead_links"
grep -q 'mirrorDeadLinks' "$ROOT/dashboard/src/components/InsightsPage.tsx" \
  && ok "the mirror-health tile accounts for dead links" \
  || bad "tile still shows '✓ healthy' with dead links pending"

echo
echo "── 7: one guest token per RUN, not one per link (gofile: never mint per call) ──"
# classify_* run inside $(...) subshells, so an in-memory-only cache minted one
# guest account PER LINK. Lock the file-backed cache.
python3 - "$WORK/multi.json" <<'PY'
import json, sys
json.dump([{"video_id": "GF%08d" % i, "title": "GF %d" % i,
            "archive_link": "https://archive.org/details/f%d" % i,
            "pixeldrain_link": "https://pixeldrain.com/u/P%d" % i,
            "gofile_link": "https://gofile.io/d/CODE%03d" % i} for i in range(6)],
          open(sys.argv[1], "w"))
PY
: > "$WORK/curl.log"
PATH="$WORK/bin:$PATH" CURL_LOG="$WORK/curl.log" GOFILE_MODE="$WORK/mode" \
  RECORDINGS_JSON="$WORK/multi.json" MIRROR_HEALTH_JSON="$WORK/multi-out.json" \
  GOFILE_TOKEN_CACHE_FILE="$WORK/tok" \
  env -u GOFILE_API_KEY bash "$ROOT/scripts/mirror-health.sh" > /dev/null 2>&1
MINTS=$(grep -c 'api.gofile.io/accounts' "$WORK/curl.log" 2>/dev/null); MINTS="${MINTS:-0}"
AUTHD=$(grep -c 'Authorization: Bearer' "$WORK/curl.log" 2>/dev/null); AUTHD="${AUTHD:-0}"
[[ "$MINTS" -eq 1 ]] && ok "1 guest account minted for 6 gofile links" \
                     || bad "$MINTS guest accounts minted for 6 links (per-link minting)"
[[ "$AUTHD" -eq 6 ]] && ok "all 6 Contents calls carried the bearer token" \
                     || bad "only $AUTHD/6 Contents calls authenticated"
PERMS=$(stat -c '%a' "$WORK/tok" 2>/dev/null || echo "missing")
[[ "$PERMS" == "600" ]] && ok "token cache file is 0600" || bad "token cache perms=$PERMS"

echo
if (( FAILURES > 0 )); then echo "RESULT: RED — $FAILURES case(s) failed"; exit 1; fi
echo "RESULT: GREEN — dead links are named, verifiable, repairable, and visible"; exit 0
