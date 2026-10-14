#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: repair-mirrors.sh bounds the number of candidates that     ║
# ║  reach the download/upload stage (MAX_ATTEMPTS), not only the successes      ║
# ║  (MAX_ITEMS). With one host rejecting every upload (0807.st since 09-02) an  ║
# ║  unbounded pass downloads every Archive.org source daily for nothing.        ║
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

# 8 recordings: every other mirror alive, st0807 missing everywhere
python3 - "$WORKDIR/data/recordings.json" <<'PY'
import json, sys
recs=[{"video_id":f"vid{i:04d}","title":f"Fixture {i}","archive_link":f"https://archive.org/details/fix{i}",
       "gofile_link":f"https://gofile.io/d/Fix{i}","pixeldrain_link":f"https://pixeldrain.com/u/Fix{i}",
       "mega_link":f"https://mega.nz/file/Fix{i}#k","vikingfile_link":f"https://vikingfile.com/f/Fix{i}"} for i in range(8)]
json.dump(recs, open(sys.argv[1],"w"))
PY
cat > "$STUBBIN/curl" <<'STUB'
#!/usr/bin/env bash
args=" $* "
case "$args" in
  *vikingfile.com/api/check-file*) printf '[{"exist":true}]';;
  *api.gofile.io/contents/*)       printf '{"status":"ok"}';;
  *pixeldrain.com/api/file/*)      printf '{"success":true}';;
  *)                               printf '{}';;
esac
exit 0
STUB
chmod +x "$STUBBIN/curl"

run_pass() {  # $@ = env
  (cd "$WORKDIR" && env PATH="$STUBBIN:$PATH" GITHUB_REPOSITORY=fixture/repo GH_PAT=x "$@" bash -c '
     source "$1/scripts/repair-mirrors.sh" >/dev/null 2>&1
     _download_archive_file() { echo "'"$WORKDIR"'/fake.mp4"; }
     upload_to_st0807() { return 1; }            # the host that rejects everything
     repair_mirrors' _ "$ROOT" 2>&1)
}

echo "── 1: default budget = 2×MAX_ITEMS attempts ──"
OUT=$(run_pass MAX_ITEMS=3)
grep -q 'attempted=6, repaired=0' <<<"$OUT" && ok "6 candidates attempted, 0 repaired" || bad "summary: $(grep -o 'Mirror repair complete.*' <<<"$OUT")"
n=$(grep -c 'Attempt budget reached' <<<"$OUT"); [[ "$n" -eq 2 ]] && ok "remaining 2 deferred to the next run" || bad "$n deferred (expected 2)"
[[ -f "$WORKDIR/fake.mp4" ]] || printf 'x' > "$WORKDIR/fake.mp4"

echo "── 2: explicit MAX_ATTEMPTS honoured ──"
OUT=$(run_pass MAX_ITEMS=3 MAX_ATTEMPTS=1)
grep -q 'attempted=1, repaired=0' <<<"$OUT" && ok "MAX_ATTEMPTS=1 → one attempt" || bad "summary: $(grep -o 'Mirror repair complete.*' <<<"$OUT")"

echo ""
if (( FAILURES > 0 )); then echo "RESULT: RED — $FAILURES assertion(s) failed"; exit 1; fi
echo "RESULT: GREEN — repair pass bounded by attempts as well as successes"; exit 0
