#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: a repair pass must advance the archive, not re-touch the   ║
# ║  head of the list (2026-10-24)                                              ║
# ║                                                                             ║
# ║  Symptom (observed in the repo history, not guessed):                        ║
# ║    Every ~6h a *dispatched* repair run re-uploaded ALL FIVE mirrors of the   ║
# ║    same six newest recordings (5mI5dC1VxaE, kgg3P0w853s, iOHEsTldVPY,       ║
# ║    sTBamxxHEuA, OrliN1T8jPM, 0k1yY4S4PEE) — the first six entries of the     ║
# ║    newest-first data/recordings.json — while the once-daily *scheduled* run  ║
# ║    reached the older ones (X05zRHM4kVs, ASWJmIsyd9s, YsaWlm-YVxY):          ║
# ║      2026-10-23T04/11/17/21  → the same 6 head records                      ║
# ║      2026-10-23T13 (schedule) → 3 older records, newest 6 untouched          ║
# ║    MEGA links were replaced too, which the script only does under           ║
# ║    FORCE_REPAIR=true, so the dispatched runs really ran in force mode.       ║
# ║                                                                             ║
# ║  Two defects, both locked here:                                             ║
# ║   1. repair-mirrors.yml declared `force_repair` with `default: "true"`.      ║
# ║      mirror-health.yml dispatches the workflow with `{"ref":"main"}` and    ║
# ║      no inputs, so GitHub injects the declared default → FORCE_REPAIR=true  ║
# ║      on every automated repair. Force mode marks *every* record as needing   ║
# ║      repair, so all 5 uploads happen for the 6 newest recordings 4×/day and  ║
# ║      MAX_ITEMS is exhausted before the other 14 are ever reached.           ║
# ║   2. repair_mirrors() walked data/recordings.json in file order (newest      ║
# ║      first) and stopped at MAX_ITEMS, so a bounded pass could starve the     ║
# ║      tail of the archive forever. Candidates are now ordered by              ║
# ║      mirrors_repaired_at (never repaired first, then oldest).               ║
# ║                                                                             ║
# ║  Hermetic: curl is stubbed, uploads/updates are stubbed, no network.         ║
# ║  Run: bash tests/repair-mirrors-dispatch-test.sh                             ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAILURES=$((FAILURES+1)); }

WORKDIR="$(mktemp -d)"; trap 'rm -rf "$WORKDIR"' EXIT
STUBBIN="$WORKDIR/bin"; mkdir -p "$STUBBIN" "$WORKDIR/data"
printf 'x' > "$WORKDIR/fake.mp4"

# Every mirror checks out alive; only 0807.st 404s (the host that has been
# rejecting uploads/serving expired files since 2026-09-02).
cat > "$STUBBIN/curl" <<'STUB'
#!/usr/bin/env bash
args=" $* "
case "$args" in
  *0807.st*)                 if [[ "${ALL_ALIVE:-0}" == "1" ]]; then printf '200'; else printf '404'; fi ;;
  *api.gofile.io/contents/*) printf '{"status":"ok"}' ;;
  *pixeldrain.com/api/file/*)printf '{"success":true}' ;;
  *vikingfile.com/api/check-file*) printf '[{"exist":true}]' ;;
  *gofile.io*)               printf '<html>%s</html>' "$(printf 'x%.0s' {1..400})" ;;
  *)                         printf '{}' ;;
esac
exit 0
STUB
chmod +x "$STUBBIN/curl"

fixture() {  # $1 = path, $2 = repo data/recordings.json fixture (newest first)
  python3 - "$1" <<'PY'
import json, sys
recs = [{
    "video_id": f"vid{i:03d}",
    "title": f"Fixture {i}",
    "channel": "The Muslim Lantern",
    "archive_link": f"https://archive.org/details/fix{i}",
    "gofile_link": f"https://gofile.io/d/Fix{i}",
    "pixeldrain_link": f"https://pixeldrain.com/u/Fix{i}",
    "mega_link": f"https://mega.nz/file/Fix{i}#k",
    "st0807_link": f"https://0807.st/Fix{i}.mp4",
    "vikingfile_link": f"https://vikingfile.com/f/Fix{i}",
} for i in range(6)]
json.dump(recs, open(sys.argv[1], "w"), indent=1)
PY
}

# ── reproduce the workflow's FORCE_REPAIR value for an input-less dispatch ────
# mirror-health.yml posts {"ref":"main"} with no inputs; GitHub fills inputs the
# workflow declares with their `default:`, and `github.event.inputs.X` is a
# STRING (`"false"` is truthy nowhere in the script, which compares == "true").
resolve_force_repair() {
  python3 - "$ROOT/.github/workflows/repair-mirrors.yml" <<'PY'
import re, sys
text = open(sys.argv[1]).read()
default = None
in_input = False
for line in text.splitlines():
    if re.match(r'^\s{6}force_repair:\s*$', line):
        in_input = True
        continue
    if in_input:
        m = re.match(r'^\s+default:\s*(.+?)\s*$', line)
        if m:
            default = m.group(1).strip().strip('"\'')
            break
        if re.match(r'^\s{6}\S', line):   # next input block
            break
provided = default or ""            # API dispatch supplies nothing → default wins
expr = re.search(r'FORCE_REPAIR:\s*\$\{\{\s*(.+?)\s*\}\}', text)
resolved = provided if provided else "false"
if expr and "'false'" in expr.group(1) and not provided:
    resolved = "false"
print(resolved if resolved else "false")
PY
}

run_pass() {  # $@ = env assignments (FORCE_REPAIR=…, MAX_ITEMS=…)
  (cd "$WORKDIR" && env PATH="$STUBBIN:$PATH" GITHUB_REPOSITORY=fixture/repo GH_PAT=x \
      FAKE_MP4="$WORKDIR/fake.mp4" "$@" bash -c '
     source "$1/scripts/repair-mirrors.sh" >/dev/null 2>&1
     # The loop deletes the downloaded source after each repair, so re-create it.
     _download_archive_file() { printf 'x' > "$FAKE_MP4"; echo "$FAKE_MP4"; }
     upload_to_gofile()      { GOFILE_LINKS=("HD|https://gofile.io/d/New$RANDOM$RANDOM"); return 0; }
     upload_to_pixeldrain()  { PIXELDRAIN_LINKS=("HD|https://pixeldrain.com/u/New$RANDOM$RANDOM"); return 0; }
     upload_to_mega()        { MEGA_LINKS=("HD|https://mega.nz/file/New$RANDOM$RANDOM#k"); return 0; }
     upload_to_st0807()      { ST0807_LINKS=("HD|https://0807.st/New$RANDOM.mp4"); return 0; }
     upload_to_vikingfile()  { VIKINGFILE_LINKS=("HD|https://vikingfile.com/f/New$RANDOM$RANDOM"); return 0; }
     # Simulate the successful Contents-API write without any network call.
     _update_recording_links() {
       local id="$1" st="$5"
       jq --arg id "$id" --arg st "$st" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
         "map(if .video_id == \$id then . + {
              st0807_link: (if \$st != \"\" then \$st else .st0807_link end),
              mirrors_repaired_at: \$ts } else . end)" \
         data/recordings.json > data/.tmp.json && mv data/.tmp.json data/recordings.json
       echo "REPAIRED:$id" >> repair-log.txt
     }
     repair_mirrors' _ "$ROOT" 2>&1)
}

echo "── 1: an input-less dispatch must NOT force a full re-upload ──"
FORCE="$(resolve_force_repair)"
if [[ "$FORCE" == "false" ]]; then
  ok "workflow force_repair default resolves to false for {\"ref\":\"main\"} dispatches"
else
  bad "workflow force_repair default resolves to '${FORCE}' — every mirror-health dispatch force-re-uploads all mirrors"
fi
if grep -q 'FORCE_REPAIR.*github.event.inputs.force_repair.*|| *'\''false'\''' \
     "$ROOT/.github/workflows/repair-mirrors.yml"; then
  ok "forced repairs stay opt-in (expr falls back to 'false')"
else
  bad "FORCE_REPAIR expression no longer falls back to 'false'"
fi

echo "── 2: with every mirror alive, a pass repairs nothing (no force) ──"
fixture "$WORKDIR/data/recordings.json"
rm -f "$WORKDIR/repair-log.txt"
OUT=$(ALL_ALIVE=1 run_pass "FORCE_REPAIR=$FORCE" MAX_ITEMS=6)
REPAIRED=$(grep -c '^REPAIRED:' "$WORKDIR/repair-log.txt" 2>/dev/null || true)
REPAIRED=${REPAIRED:-0}
if [[ "$REPAIRED" == "0" ]] && grep -q 'repaired=0' <<<"$OUT"; then
  ok "0 recordings re-uploaded (all mirrors verified alive)"
else
  bad "$REPAIRED recording(s) re-uploaded although every mirror is alive — budget burned on live links"
fi

echo "── 3: a bounded pass rotates to the stalest recordings (no starvation) ──"
# All six need 0807 repaired; a 3-item pass must not pick the same 3 twice.
fixture "$WORKDIR/data/recordings.json"
# Mirrors the production shape: the head was re-uploaded moments ago, the tail
# has not been touched for 10 days (gofile deletes an idle folder at 10 days).
python3 - "$WORKDIR/data/recordings.json" <<'PY'
import json, sys
rows = json.load(open(sys.argv[1]))
freshest, stale = "2026-10-24T00:00:00.000Z", "2026-10-14T00:00:00.000Z"
for i, r in enumerate(rows):
    r["mirrors_repaired_at"] = freshest if i < 3 else stale
json.dump(rows, open(sys.argv[1], "w"), indent=1)
PY
rm -f "$WORKDIR/repair-log.txt"
OUT1=$(run_pass MAX_ITEMS=3)
OUT2=$(run_pass MAX_ITEMS=3)
P1=$(grep -o 'REPAIRED:[^ ]*' "$WORKDIR/repair-log.txt" | sed -n '1,3p' | cut -d: -f2 | paste -sd, -)
P2=$(grep -o 'REPAIRED:[^ ]*' "$WORKDIR/repair-log.txt" | sed -n '4,6p' | cut -d: -f2 | paste -sd, -)
UNIQ=$(grep -o 'REPAIRED:[^ ]*' "$WORKDIR/repair-log.txt" | cut -d: -f2 | sort -u | wc -l | tr -d ' ')
[[ "$P1" == "vid003,vid004,vid005" ]] \
  && ok "pass 1 repaired the stalest recordings ($P1)" \
  || bad "pass 1 repaired ${P1:-nothing} (expected the three 10-day-old ones)"
[[ -n "$P2" && "$P2" != "$P1" ]] \
  && ok "pass 2 moved on to the next recordings ($P2)" \
  || bad "pass 2 re-repaired the same head records (${P2:-none}) — tail of the archive starves"
[[ "$UNIQ" == "6" ]] \
  && ok "two bounded passes covered all 6 recordings" \
  || bad "two bounded passes touched only $UNIQ/6 recordings"

echo ""
if (( FAILURES > 0 )); then echo "RESULT: RED — $FAILURES assertion(s) failed"; exit 1; fi
echo "RESULT: GREEN — dispatched repairs no longer force-farm the newest recordings"
exit 0
