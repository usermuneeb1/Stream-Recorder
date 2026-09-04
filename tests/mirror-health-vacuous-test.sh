#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: scripts/mirror-health.sh vacuous-success (2026-09-02)      ║
# ║                                                                              ║
# ║  Root causes locked in here:                                                 ║
# ║   1. line ~185 referenced unbound $s/$v (st0807/vikingfile statuses never    ║
# ║      declared) → set -u killed the jq argjson substitution → jq got ""       ║
# ║   2. jv() emitted shell-escaped \"value\" — invalid JSON for --argjson       ║
# ║   3. no fail-fast → empty TMP_JSON aggregated to total:0, exit 0, and the    ║
# ║      workflow committed {recordings: []} — dead links became invisible,      ║
# ║      repair-mirrors was never dispatched (mirror-health.yml gates on        ║
# ║      degraded/dead != 0)                                                     ║
# ║                                                                              ║
# ║  Seam: the script itself, invoked exactly as mirror-health.yml invokes it,   ║
# ║  with RECORDINGS_JSON/MIRROR_HEALTH_JSON env seams and a stubbed curl.       ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
TARGET="$ROOT/scripts/mirror-health.sh"

FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAILURES=$((FAILURES+1)); }

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
STUBBIN="$WORKDIR/bin"; mkdir -p "$STUBBIN"

# ── fixture: one recording with all mirror links set ─────────────────────────
cat > "$WORKDIR/recordings.json" <<'JSON'
[
  {
    "video_id": "testvid0001",
    "title": "Regression Fixture",
    "archive_link": "https://archive.org/details/fixture-item",
    "gofile_link": "https://gofile.io/d/FixtureAa1",
    "pixeldrain_link": "https://pixeldrain.com/u/FixtureBb2",
    "mega_link": "https://mega.nz/file/FixtureCc3#key",
    "github_release": "https://github.com/o/r/releases/download/v1/f.mp4"
  }
]
JSON

# ── stub curl: answers by URL pattern, no network ────────────────────────────
# State file lets the stub decide per-test results.
cat > "$STUBBIN/curl" <<'STUB'
#!/usr/bin/env bash
# Fake curl for mirror-health tests. Writes payload to stdout unless -o given.
OUT=""; WRITE_CODE=""
args=" $* "
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o) OUT="$2"; shift 2;;
    -w) WRITE_CODE="$2"; shift 2;;
    *) shift;;
  esac
done
emit() { [[ -n "$OUT" ]] && printf '%s' "$1" > "$OUT" || printf '%s' "$1"; }
emit_code() { printf '%s' "$1"; }   # -w output: always stdout, even with -o

case "$args" in
  *api.gofile.io/contents/*) emit '{"status":"ok"}'; exit 0;;
  *api.mega.co.nz/cs*|*g.api.mega.co.nz/cs*) emit '[{"s":12345}]'; exit 0;;
  *pixeldrain.com/api/file/*)
    if grep -q '^PIXELDRAIN=dead$' "${STUB_STATE:-/dev/null}" 2>/dev/null; then
      [[ -n "$WRITE_CODE" ]] && emit '404' || emit ''; exit 0
    fi
    [[ -n "$WRITE_CODE" ]] && emit '200' || emit '{"success":true}'; exit 0;;
  *archive.org*|*github.com*|*gofile.io/d/*|*mega.nz*)
    # classify() wants an http code via -w
    if grep -q '^ALL_DEAD=1$' "${STUB_STATE:-/dev/null}" 2>/dev/null; then
      [[ -n "$WRITE_CODE" ]] && emit_code '404'; exit 0
    fi
    [[ -n "$WRITE_CODE" ]] && emit_code '200'; exit 0;;
  *) [[ -n "$WRITE_CODE" ]] && emit_code '200'; exit 0;;
esac
STUB
chmod +x "$STUBBIN/curl"

run_health() {
  PATH="$STUBBIN:$PATH" \
  RECORDINGS_JSON="$WORKDIR/recordings.json" \
  MIRROR_HEALTH_JSON="$WORKDIR/health.json" \
  STUB_STATE="$WORKDIR/state" \
  bash "$TARGET" 2>"$WORKDIR/stderr.log"
  return $?
}

echo "── 1: all-alive fixture → total=1, entry present, exit 0 ──"
: > "$WORKDIR/state"
RC=0; run_health || RC=$?
TOTAL=$(jq -r '.summary.total // -1' "$WORKDIR/health.json" 2>/dev/null)
RECS=$(jq -r '.recordings | length' "$WORKDIR/health.json" 2>/dev/null)
HEALTHY=$(jq -r '.recordings[0].healthy // "missing"' "$WORKDIR/health.json" 2>/dev/null)
[[ "$RC" -eq 0 ]]        && ok "exit 0 when healthy"            || bad "exit $RC when healthy"
[[ "$TOTAL" == "1" ]]    && ok "summary.total=1"                || bad "summary.total=$TOTAL (vacuous output!)"
[[ "$RECS" == "1" ]]     && ok "recordings[] has the entry"     || bad "recordings[] length=$RECS"
[[ "$HEALTHY" == "true" ]]&& ok "recording marked healthy"      || bad "healthy=$HEALTHY"
if grep -q 'unbound variable' "$WORKDIR/stderr.log"; then bad "unbound variable in stderr"; else ok "no unbound-variable errors"; fi

echo "── 2: dead pixeldrain + dead gofile fixture → degraded, non-zero exit ──"
echo 'PIXELDRAIN=dead' > "$WORKDIR/state"
# make gofile dead too: stub returns ok above; flip via a state the stub checks
cat > "$STUBBIN/curl" <<'STUB'
#!/usr/bin/env bash
OUT=""; WRITE_CODE=""
args=" $* "
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o) OUT="$2"; shift 2;;
    -w) WRITE_CODE="$2"; shift 2;;
    *) shift;;
  esac
done
emit() { [[ -n "$OUT" ]] && printf '%s' "$1" > "$OUT" || printf '%s' "$1"; }
emit_code() { printf '%s' "$1"; }   # -w output: always stdout, even with -o
case "$args" in
  *api.gofile.io/contents/*) emit '{"status":"error-notFound"}'; exit 0;;
  *api.mega.co.nz/cs*|*g.api.mega.co.nz/cs*) emit '-9'; exit 0;;
  *pixeldrain.com*) [[ -n "$WRITE_CODE" ]] && emit_code '404'; exit 0;;
  *archive.org*|*github.com*) [[ -n "$WRITE_CODE" ]] && emit_code '404'; exit 0;;
  *) [[ -n "$WRITE_CODE" ]] && emit_code '404'; exit 0;;
esac
STUB
chmod +x "$STUBBIN/curl"
RC=0; run_health || RC=$?
DEGRADED=$(jq -r '.summary.degraded // -1' "$WORKDIR/health.json" 2>/dev/null)
DEAD_LINKS=$(jq -r '.summary.dead_links // -1' "$WORKDIR/health.json" 2>/dev/null)
[[ "$RC" -ne 0 ]]           && ok "non-zero exit when below copy guarantee" || bad "exit $RC despite degraded recording"
[[ "$DEGRADED" == "1" ]]    && ok "degraded=1"                              || bad "degraded=$DEGRADED"
[[ "$DEAD_LINKS" -ge 2 ]]   && ok "dead_links=$DEAD_LINKS (pixeldrain+gofile)" || bad "dead_links=$DEAD_LINKS"

echo "── 3: archive + 0807.st alive, nothing else → healthy (fast bar includes 0807/viking) ──"
cat > "$WORKDIR/recordings.json" <<'JSON'
[
  {
    "video_id": "st0807only0001",
    "title": "0807-only Fixture",
    "archive_link": "https://archive.org/details/fixture-item",
    "st0807_link": "https://0807.st/FixtureAa1"
  }
]
JSON
cat > "$STUBBIN/curl" <<'STUB'
#!/usr/bin/env bash
OUT=""; WRITE_CODE=""
args=" $* "
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o) OUT="$2"; shift 2;;
    -w) WRITE_CODE="$2"; shift 2;;
    *) shift;;
  esac
done
emit() { [[ -n "$OUT" ]] && printf '%s' "$1" > "$OUT" || printf '%s' "$1"; }
emit_code() { printf '%s' "$1"; }   # -w output: always stdout, even with -o
case "$args" in
  *api.gofile.io/contents/*) emit '{"status":"error-notFound"}'; exit 0;;
  *api.mega.co.nz/cs*|*g.api.mega.co.nz/cs*) emit '-9'; exit 0;;
  *pixeldrain.com*) [[ -n "$WRITE_CODE" ]] && emit_code '404'; exit 0;;
  *archive.org*) [[ -n "$WRITE_CODE" ]] && emit_code '200'; exit 0;;
  *0807.st*|*vikingfile.com*) [[ -n "$WRITE_CODE" ]] && emit_code '200'; exit 0;;
  *) [[ -n "$WRITE_CODE" ]] && emit_code '404'; exit 0;;
esac
STUB
chmod +x "$STUBBIN/curl"
: > "$WORKDIR/state"
RC=0; run_health || RC=$?
# NOTE: never use `// "missing"` on booleans — jq's // treats false like
# null, so healthy=false misreads as "missing". tostring keeps all states.
HEALTHY3=$(jq -r '.recordings[0].healthy | tostring' "$WORKDIR/health.json" 2>/dev/null)
FASTOK3=$(jq -r '.recordings[0].fast_ok | tostring' "$WORKDIR/health.json" 2>/dev/null)
[[ "$RC" -eq 0 ]]            && ok "exit 0 when archive+0807 alive" || bad "exit $RC (0807 not counted as fast!)"
[[ "$HEALTHY3" == "true" ]]  && ok "recording marked healthy"       || bad "healthy=$HEALTHY3"
[[ "$FASTOK3" == "true" ]]   && ok "fast_ok includes 0807.st"        || bad "fast_ok=$FASTOK3"

echo "── 4: archive + vikingfile alive, nothing else → DEGRADED (viking is a share page, not playable) ──"
cat > "$WORKDIR/recordings.json" <<'JSON'
[
  {
    "video_id": "vikingonly0001",
    "title": "Viking-only Fixture",
    "archive_link": "https://archive.org/details/fixture-item",
    "vikingfile_link": "https://vikingfile.com/f/FixtureCc3"
  }
]
JSON
cat > "$STUBBIN/curl" <<'STUB'
#!/usr/bin/env bash
OUT=""; WRITE_CODE=""
args=" $* "
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o) OUT="$2"; shift 2;;
    -w) WRITE_CODE="$2"; shift 2;;
    *) shift;;
  esac
done
emit() { [[ -n "$OUT" ]] && printf '%s' "$1" > "$OUT" || printf '%s' "$1"; }
emit_code() { printf '%s' "$1"; }   # -w output: always stdout, even with -o
case "$args" in
  *vikingfile.com/api/check-file*) emit '{"exist":true}'; exit 0;;
  *archive.org*) [[ -n "$WRITE_CODE" ]] && emit_code '200'; exit 0;;
  *) [[ -n "$WRITE_CODE" ]] && emit_code '404'; exit 0;;
esac
STUB
chmod +x "$STUBBIN/curl"
: > "$WORKDIR/state"
RC=0; run_health || RC=$?
HEALTHY4=$(jq -r '.recordings[0].healthy | tostring' "$WORKDIR/health.json" 2>/dev/null)
VALIVE4=$(jq -r '.recordings[0].mirrors.vikingfile // "missing"' "$WORKDIR/health.json" 2>/dev/null)
[[ "$RC" -ne 0 ]]            && ok "non-zero exit (no playable fast mirror)" || bad "exit $RC (viking counted as fast!)"
[[ "$HEALTHY4" == "false" ]] && ok "recording marked degraded"               || bad "healthy=$HEALTHY4"
[[ "$VALIVE4" == "alive" ]]  && ok "viking presence still reported alive"    || bad "vikingfile=$VALIVE4"

echo "── 5: demotion-only keys (telegram/youtube/archive_direct dead) sink the player copies but never dispatch repair ──"
cat > "$WORKDIR/recordings.json" <<'JSON'
[
  {
    "video_id": "demote00000001",
    "title": "Demotion Fixture",
    "video_url": "https://www.youtube.com/watch?v=ABCDEFGHIJK",
    "archive_link": "https://archive.org/details/fixture-item",
    "archive_direct": "https://archive.org/download/fixture-item/guess.mp4",
    "pixeldrain_link": "https://pixeldrain.com/u/FixtureBb2",
    "cf_stream": "https://cfstream.example.net/v/xyz"
  }
]
JSON
cat > "$STUBBIN/curl" <<'STUB'
#!/usr/bin/env bash
OUT=""; WRITE_CODE=""
args=" $* "
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o) OUT="$2"; shift 2;;
    -w) WRITE_CODE="$2"; shift 2;;
    *) shift;;
  esac
done
emit() { [[ -n "$OUT" ]] && printf '%s' "$1" > "$OUT" || printf '%s' "$1"; }
emit_code() { printf '%s' "$1"; }   # -w output: always stdout, even with -o
case "$args" in
  *archive.org/download/*) [[ -n "$WRITE_CODE" ]] && emit_code '404'; exit 0;;
  *archive.org*|*pixeldrain.com*) [[ -n "$WRITE_CODE" ]] && emit_code '200'; exit 0;;
  *i.ytimg.com*|*cfstream.example*) [[ -n "$WRITE_CODE" ]] && emit_code '404'; exit 0;;
  *) [[ -n "$WRITE_CODE" ]] && emit_code '404'; exit 0;;
esac
STUB
chmod +x "$STUBBIN/curl"
: > "$WORKDIR/state"
RC=0; run_health || RC=$?
DEGRADED5=$(jq -r '.summary.degraded // -1' "$WORKDIR/health.json" 2>/dev/null)
DEAD5=$(jq -r '.summary.dead_links // -1' "$WORKDIR/health.json" 2>/dev/null)
T5=$(jq -r '.recordings[0].mirrors.telegram // "missing"' "$WORKDIR/health.json" 2>/dev/null)
Y5=$(jq -r '.recordings[0].mirrors.youtube // "missing"' "$WORKDIR/health.json" 2>/dev/null)
AD5=$(jq -r '.recordings[0].mirrors.archive_direct // "missing"' "$WORKDIR/health.json" 2>/dev/null)
[[ "$RC" -eq 0 ]]         && ok "exit 0 (playable bar intact)"              || bad "exit $RC"
[[ "$DEGRADED5" == "0" ]] && ok "degraded=0 (no repair dispatched)"         || bad "degraded=$DEGRADED5"
[[ "$DEAD5" == "0" ]]     && ok "dead_links=0 (demotion keys excluded)"     || bad "dead_links=$DEAD5"
[[ "$T5" == "dead" ]]     && ok "telegram demoted (STORM sinks)"            || bad "telegram=$T5"
[[ "$Y5" == "dead" ]]     && ok "youtube demoted (GHOST sinks)"             || bad "youtube=$Y5"
[[ "$AD5" == "dead" ]]    && ok "archive_direct demoted (BUNNY sinks)"      || bad "archive_direct=$AD5"

echo ""
if (( FAILURES > 0 )); then echo "RESULT: RED — $FAILURES case(s) failed"; exit 1; fi
echo "RESULT: GREEN — mirror-health always enumerates recordings and fails when degraded"; exit 0
