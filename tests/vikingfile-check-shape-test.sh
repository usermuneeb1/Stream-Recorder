#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: VikingFile check-file responses are a JSON ARRAY           ║
# ║                                                                              ║
# ║  POST https://vikingfile.com/api/check-file (hash=…) answers                 ║
# ║      [{"exist":true,"name":"…","size":123}]                                  ║
# ║  (independently confirmed by two other clients: JDownloader's                ║
# ║  VikingfileCom.java and VNMaster's vikingfile.py). All three consumers here  ║
# ║  parsed it with `jq -r '.exist // empty'`, which errors on an array →        ║
# ║  empty → "unverifiable". Consequences on main:                               ║
# ║    • data/mirror-health.json: vikingfile unverifiable 18/18, forever;        ║
# ║    • repair-mirrors treated unverifiable as dead and re-uploaded the same    ║
# ║      three newest recordings to VikingFile EVERY DAY (git log: 3 "Mirror     ║
# ║      repair" commits/day touching only vikingfile_link), burning the         ║
# ║      MAX_ITEMS=3 budget so recordings 4..18 were never reached — which is    ║
# ║      why 0807.st never got backfilled for them.                              ║
# ║                                                                              ║
# ║  Also locks: repair must not churn on an UNVERIFIABLE VikingFile answer.     ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAILURES=$((FAILURES+1)); }

WORKDIR="$(mktemp -d)"; trap 'rm -rf "$WORKDIR"' EXIT
STUBBIN="$WORKDIR/bin"; mkdir -p "$STUBBIN"
VF_BODY="$WORKDIR/vf.body"          # what the stub returns for check-file

cat > "$WORKDIR/recordings.json" <<'JSON'
[
  {
    "video_id": "vfshape0001",
    "title": "VikingFile shape fixture",
    "archive_link": "https://archive.org/details/fixture-item",
    "gofile_link": "https://gofile.io/d/FixtureAa1",
    "pixeldrain_link": "https://pixeldrain.com/u/FixtureBb2",
    "mega_link": "https://mega.nz/file/FixtureCc3#key",
    "st0807_link": "https://0807.st/FixtureDd4.mp4",
    "vikingfile_link": "https://vikingfile.com/f/FixtureEe5"
  }
]
JSON

cat > "$STUBBIN/curl" <<STUB
#!/usr/bin/env bash
OUT=""; WRITE_CODE=""; args=" \$* "
while [[ \$# -gt 0 ]]; do case "\$1" in -o) OUT="\$2"; shift 2;; -w) WRITE_CODE="\$2"; shift 2;; *) shift;; esac; done
emit() { if [[ -n "\$OUT" ]]; then printf '%s' "\$1" > "\$OUT"; else printf '%s' "\$1"; fi; }
case "\$args" in
  *vikingfile.com/api/check-file*) cat "$VF_BODY"; exit 0;;
  *api.gofile.io/contents/*)       emit '{"status":"ok"}'; exit 0;;
  *pixeldrain.com/api/file/*)      [[ -n "\$WRITE_CODE" ]] && printf 200 || emit '{"success":true}'; exit 0;;
  *g.api.mega.co.nz/cs*)           emit '[{"s":12345}]'; exit 0;;
  *api.github.com*)                emit '{}'; exit 0;;
  *) emit ''; [[ -n "\$WRITE_CODE" ]] && printf 200; exit 0;;
esac
STUB
chmod +x "$STUBBIN/curl"

health_vf() {  # run mirror-health against the fixture, print the vikingfile verdict
  (cd "$WORKDIR" && PATH="$STUBBIN:$PATH" RECORDINGS_JSON="$WORKDIR/recordings.json" \
     MIRROR_HEALTH_JSON="$WORKDIR/health.json" MIRROR_CHECK_TIMEOUT=2 \
     bash "$ROOT/scripts/mirror-health.sh" >/dev/null 2>&1)
  jq -r '.recordings[0].mirrors.vikingfile // "MISSING"' "$WORKDIR/health.json" 2>/dev/null || echo "NO-JSON"
}
repair_alive() {  # source repair-mirrors.sh (guarded entrypoint) and ask _is_vikingfile_alive
  (cd "$WORKDIR" && PATH="$STUBBIN:$PATH" bash -c '
     source "$1/scripts/repair-mirrors.sh" >/dev/null 2>&1
     _is_vikingfile_alive "https://vikingfile.com/f/FixtureEe5"; echo "rc=$?"' _ "$ROOT")
}
refresh_alive() {
  (cd "$WORKDIR" && PATH="$STUBBIN:$PATH" bash -c '
     source "$1/scripts/refresh-links.sh" >/dev/null 2>&1
     check_link_alive "https://vikingfile.com/f/FixtureEe5"; echo "rc=$?"' _ "$ROOT")
}
repair_dry_run() {  # whole repair pass, DRY_RUN, local recordings.json (API read stubbed to {})
  (cd "$WORKDIR" && mkdir -p data && cp recordings.json data/recordings.json && \
     PATH="$STUBBIN:$PATH" DRY_RUN=true MAX_ITEMS=3 GITHUB_REPOSITORY=fixture/repo GH_PAT=x \
     bash "$ROOT/scripts/repair-mirrors.sh" 2>&1)
}

echo "── 1: real production shape — array with exist:true → alive everywhere, repair skips ──"
printf '[{"exist":true,"name":"fixture.mp4","size":1234}]' > "$VF_BODY"
v=$(health_vf);      [[ "$v" == "alive" ]] && ok "mirror-health: alive" || bad "mirror-health: $v (expected alive)"
v=$(repair_alive);   [[ "$v" == "rc=0" ]] && ok "repair _is_vikingfile_alive: alive" || bad "repair: $v (expected rc=0)"
v=$(refresh_alive);  [[ "$v" == "rc=0" ]] && ok "refresh check_link_alive: alive" || bad "refresh: $v (expected rc=0)"
OUT=$(repair_dry_run)
grep -q 'Mirrors already present/alive, skipping' <<<"$OUT" && ok "repair pass: nothing to do (no daily churn)" || bad "repair pass wants to re-upload: $(grep -o 'Needs repair.*' <<<"$OUT" | head -1)"

echo "── 2: array with exist:false → dead → repair needed ──"
printf '[{"exist":false}]' > "$VF_BODY"
v=$(health_vf);      [[ "$v" == "dead" ]] && ok "mirror-health: dead" || bad "mirror-health: $v (expected dead)"
v=$(repair_alive);   [[ "$v" == "rc=1" ]] && ok "repair: dead" || bad "repair: $v (expected rc=1)"
OUT=$(repair_dry_run)
grep -q 'vikingfile=true' <<<"$OUT" && ok "repair pass: schedules a VikingFile re-upload" || bad "repair pass did not schedule a re-upload for a dead link"

echo "── 3: single-object shape (some clients see this) → still parsed ──"
printf '{"exist":true,"name":"fixture.mp4"}' > "$VF_BODY"
v=$(health_vf);      [[ "$v" == "alive" ]] && ok "mirror-health: alive" || bad "mirror-health: $v (expected alive)"
v=$(repair_alive);   [[ "$v" == "rc=0" ]] && ok "repair: alive" || bad "repair: $v (expected rc=0)"

echo "── 4: non-JSON (challenge page / outage) → unverifiable; repair must NOT churn ──"
printf '<html>Just a moment...</html>' > "$VF_BODY"
v=$(health_vf);      [[ "$v" == "unverifiable" ]] && ok "mirror-health: unverifiable" || bad "mirror-health: $v (expected unverifiable)"
OUT=$(repair_dry_run)
grep -q 'vikingfile=true' <<<"$OUT" && bad "repair pass re-uploads on an unverifiable answer (the daily churn)" || ok "repair pass leaves an unverifiable VikingFile link alone"
grep -qi 'unverifiable' <<<"$OUT" && ok "repair pass says why" || bad "repair pass silent about the unverifiable answer"

echo ""
if (( FAILURES > 0 )); then echo "RESULT: RED — $FAILURES assertion(s) failed"; exit 1; fi
echo "RESULT: GREEN — VikingFile check-file parsed in every consumer; repair no longer churns"; exit 0
