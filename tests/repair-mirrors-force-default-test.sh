#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: an UNATTENDED repair dispatch must never force re-upload   ║
# ║                                                                              ║
# ║  Contract (2026-10-24): mirror-health triggers repair-mirrors through the    ║
# ║  workflow_dispatch API with NO inputs — `-d '{"ref":"main"}'`. GitHub then   ║
# ║  fills every declared input with its DEFAULT, so whatever                  ║
# ║  `force_repair.default` says is what the automated repair run uses.          ║
# ║  With `default: "true"` that meant FORCE_REPAIR=true on every 6-hourly       ║
# ║  dispatch: every alive check was bypassed and the first MAX_ITEMS (6)       ║
# ║  recordings — always the NEWEST, already healthy ones — were downloaded     ║
# ║  from Archive.org and re-uploaded to gofile/pixeldrain/mega/0807/viking.    ║
# ║  The older recordings that actually had dead mirrors were never reached,    ║
# ║  and ~24 working links were replaced every run (quota + bandwidth burn).    ║
# ║                                                                              ║
# ║  This test resolves the input default exactly the way the workflow env      ║
# ║  expression does (`inputs.force_repair || 'false'`), runs repair_mirrors    ║
# ║  against a fixture where EVERY mirror is alive, and asserts that nothing    ║
# ║  is uploaded. The manual escape hatch (FORCE_REPAIR=true) still forces.     ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAILURES=$((FAILURES+1)); }

WORKDIR="$(mktemp -d)"; trap 'rm -rf "$WORKDIR"' EXIT
mkdir -p "$WORKDIR/bin" "$WORKDIR/data"
printf 'fake-video-bytes' > "$WORKDIR/fake.mp4"
UPLOAD_LOG="$WORKDIR/uploads.log"
: > "$UPLOAD_LOG"

# ── fixture: 8 recordings, newest first, every mirror present and valid ──────
python3 - "$WORKDIR/data/recordings.json" <<'PY'
import json, sys
recs = [{
    "video_id": f"vid{i:04d}", "title": f"Fixture {i}",
    "archive_link": f"https://archive.org/details/fix{i}",
    "gofile_link": f"https://gofile.io/d/Fix{i}",
    "pixeldrain_link": f"https://pixeldrain.com/u/Fix{i}",
    "mega_link": f"https://mega.nz/file/Fix{i}#key",
    "st0807_link": f"https://0807.st/Fix{i}.mp4",
    "vikingfile_link": f"https://vikingfile.com/f/Fix{i}",
} for i in range(8)]
json.dump(recs, open(sys.argv[1], "w"))
PY

# ── curl stub: every mirror answers ALIVE ───────────────────────────────────
cat > "$WORKDIR/bin/curl" <<'STUB'
#!/usr/bin/env bash
args=" $* "
# liveness probes that ask for a status code (st0807 range request, classify)
if [[ "$args" == *" -w "* || "$args" == *"--write-out"* ]]; then printf '200'; exit 0; fi
case "$args" in
  *vikingfile.com/api/check-file*) printf '[{"exist":true}]' ;;
  *api.gofile.io/contents/*)       printf '{"status":"ok"}' ;;
  *pixeldrain.com/api/file/*)      printf '{"success":true}' ;;
  *)                               printf '{}' ;;   # api.github.com read → fallback to file
esac
exit 0
STUB
chmod +x "$WORKDIR/bin/curl"

# ── resolve force_repair exactly like ${{ github.event.inputs.force_repair || 'false' }}
resolve_force_default() {
    python3 - "$ROOT/.github/workflows/repair-mirrors.yml" <<'PY'
import re, sys
lines = open(sys.argv[1]).read().splitlines()
idx = next((i for i, l in enumerate(lines) if re.match(r'^\s*force_repair:\s*$', l)), None)
if idx is None:
    print("MISSING"); raise SystemExit(0)
indent = len(lines[idx]) - len(lines[idx].lstrip())
for l in lines[idx+1:]:
    if not l.strip():
        continue
    cur = len(l) - len(l.lstrip())
    if cur <= indent:
        break
    m = re.match(r'^\s*default:\s*(.+?)\s*$', l)
    if m:
        print(m.group(1).strip().strip('"\''))
        break
else:
    print("false")
PY
}

# ── run one repair pass with the resolved FORCE_REPAIR value ────────────────
run_repair() {  # $1 = FORCE_REPAIR value
    : > "$UPLOAD_LOG"
    ( cd "$WORKDIR" && env PATH="$WORKDIR/bin:$PATH" \
        GITHUB_REPOSITORY=fixture/repo GH_PAT=x \
        FORCE_REPAIR="$1" MAX_ITEMS=6 \
        FIXTURE_FILE="$WORKDIR/fake.mp4" UPLOAD_LOG="$UPLOAD_LOG" \
        bash -c '
          source "$1/scripts/repair-mirrors.sh" >/dev/null 2>&1
          _download_archive_file() { printf x > "$FIXTURE_FILE"; echo "$FIXTURE_FILE"; }
          _update_recording_links() { :; }
          _bump() { echo "$1" >> "$UPLOAD_LOG"; }
          upload_to_gofile()      { _bump gofile;      GOFILE_LINKS=("x|https://gofile.io/d/new"); return 0; }
          upload_to_pixeldrain()  { _bump pixeldrain;  PIXELDRAIN_LINKS=("x|https://pixeldrain.com/u/new"); return 0; }
          upload_to_mega()        { _bump mega;        MEGA_LINKS=("x|https://mega.nz/file/new#k"); return 0; }
          upload_to_st0807()      { _bump st0807;      ST0807_LINKS=("x|https://0807.st/new.mp4"); return 0; }
          upload_to_vikingfile()  { _bump vikingfile;  VIKINGFILE_LINKS=("x|https://vikingfile.com/f/new"); return 0; }
          repair_mirrors >/dev/null 2>&1
        ' _ "$ROOT" )
    wc -l < "$UPLOAD_LOG" | tr -d ' '
}

echo "── 1: the inputless dispatch default must not force ──"
EFFECTIVE=$(resolve_force_default)
if [[ -z "$EFFECTIVE" || "$EFFECTIVE" == "MISSING" ]]; then
    bad "could not resolve force_repair.default (input removed/renamed?) — contract unverifiable"
elif [[ "$EFFECTIVE" == "true" || "$EFFECTIVE" == "True" ]]; then
    bad "force_repair.default='${EFFECTIVE}' — every mirror-health dispatch ({\"ref\":\"main\"}) runs with FORCE_REPAIR=true"
else
    ok "force_repair.default='${EFFECTIVE}' → unattended dispatch does not force"
fi

echo "── 2: an automated run over ALL-ALIVE mirrors uploads nothing ──"
N=$(run_repair "$EFFECTIVE")
if [[ "$N" -eq 0 ]]; then
    ok "0 uploads with FORCE_REPAIR='${EFFECTIVE}' (healthy links left alone)"
else
    bad "${N} upload(s) with FORCE_REPAIR='${EFFECTIVE}' — healthy mirrors re-uploaded, repair budget consumed"
fi

echo "── 3: the manual escape hatch still forces a re-upload ──"
N=$(run_repair true)
if [[ "$N" -gt 0 ]]; then
    ok "FORCE_REPAIR=true uploads (explicit owner intent honoured)"
else
    bad "FORCE_REPAIR=true did not upload — the forced-repair escape hatch is broken"
fi

echo "── 4: mirror-health's dispatch is explicit about not forcing ──"
if grep -q '"force_repair":false' "$ROOT/.github/workflows/mirror-health.yml" 2>/dev/null; then
    ok "mirror-health sends force_repair:false in the dispatch body"
else
    bad "mirror-health dispatches without inputs → inherits force_repair.default (fragile)"
fi

echo ""
if (( FAILURES > 0 )); then
    echo "RESULT: RED — $FAILURES assertion(s) failed"
    exit 1
fi
echo "RESULT: GREEN — unattended repairs never force re-upload; the manual escape hatch still does"
exit 0
