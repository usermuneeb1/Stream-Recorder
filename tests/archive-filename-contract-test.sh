#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: Archive.org object-name contract (2026-10-23)             ║
# ║                                                                              ║
# ║  upload-clouds.sh names Archive.org objects with make_safe_filename():      ║
# ║      "Non-Muslims Question Islam Live! …" -> "Non-Muslims_Question_…"      ║
# ║  (spaces and punctuation folded to "_").                                    ║
# ║                                                                              ║
# ║  scripts/normalize-recordings.py derived archive_direct with                ║
# ║  sanitize_filename() instead ("spaces kept"), i.e. it pointed BUNNY at a    ║
# ║  file that is never uploaded. Any `--write` run therefore injected 404s     ║
# ║  into the canonical index. Historical entries in data/backups/ and the      ║
# ║  uploader itself both use underscores — the normalizer was the outlier.     ║
# ║                                                                              ║
# ║  Locks: every derivation rule in the repo agrees with the uploader, and     ║
# ║  a known recording reproduces the URL the pipeline actually stored.         ║
# ║  Run: bash tests/archive-filename-contract-test.sh                          ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAILURES=$((FAILURES+1)); }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/scripts" "$TMP/data"
cp "$ROOT/scripts/normalize-recordings.py" "$TMP/scripts/"

python3 - "$TMP/data/recordings.json" <<'PY'
import json, sys
titles = [
    ("Non-Muslims Question Islam Live! Muhammed Ali 2026-10-18", "5mI5dC1VxaE"),
    ("Forced Recording 2026-07-27", "X05zRHM4kVs"),
    ("🔥 BIG Debate: Is Islam True? | Ali & Guests — 2026-06-18", "aaaaaaaaaa1"),
    ('Q&A / Live: "Part 2" (Replay)', "aaaaaaaaaa2"),
    ("Non-Muslims Question Islam Live! Muhammed Ali 2026-08-15", "y84vFOO8onU"),
]
rows = [{
    "video_id": vid,
    "video_url": f"https://www.youtube.com/watch?v={vid}",
    "title": t,
    "channel": "The Muslim Lantern",
    "date": "2026-10-18",
    "archive_link": f"https://archive.org/details/tml-2026-10-{vid}-1792278704",
} for t, vid in titles]
json.dump(rows, open(sys.argv[1], "w"), indent=2)
PY

python3 "$TMP/scripts/normalize-recordings.py" --write > "$TMP/norm.log" 2>&1 || {
    echo "RESULT: RED — normalize-recordings.py failed"; sed 's/^/   /' "$TMP/norm.log"; exit 1; }

echo "── 1: normalizer's derived archive_direct matches upload-clouds.sh ──"
# shellcheck source=/dev/null
source "$ROOT/scripts/upload-clouds.sh" >/dev/null 2>&1
MISMATCH=0
while IFS=$'\x1f' read -r title link derived; do
    [[ -z "$title" ]] && continue
    ident=$(echo "$link" | sed -E 's#.*/details/##; s#/.*##')
    expected="https://archive.org/download/${ident}/$(make_safe_filename "${title}.mp4")"
    if [[ "$derived" == "$expected" ]]; then
        ok "$(basename "$derived")"
    else
        bad "derived:  ${derived##*/}"
        echo "       uploader: ${expected##*/}"
        MISMATCH=1
    fi
done < <(python3 - "$TMP/data/recordings.json" <<'PY'
import json, sys
for r in json.load(open(sys.argv[1])):
    print(r["title"] + "\x1f" + r["archive_link"] + "\x1f" + r["archive_direct"])
PY
)

echo "── 2: a known recording reproduces the URL the pipeline stored ──"
HIST=$(python3 - "$ROOT/data/backups/recordings-2026-09-24.json" "$TMP/data/recordings.json" <<'PY'
import json, sys
hist = {r["video_id"]: r.get("archive_direct", "") for r in json.load(open(sys.argv[1]))}
now = {r["video_id"]: r.get("archive_direct", "") for r in json.load(open(sys.argv[2]))}
vid = "y84vFOO8onU"
print(hist.get(vid, "") + "\t" + now.get(vid, ""))
PY
)
HIST_URL=${HIST%%$'\t'*}
NEW_URL=${HIST##*$'\t'}
# The item identifier differs by run (date + epoch suffix); the contract under
# test is the OBJECT NAME inside the item.
if [[ -n "$HIST_URL" && "${HIST_URL##*/}" == "${NEW_URL##*/}" ]]; then
    ok "y84vFOO8onU: derived URL equals the archived 2026-09-24 entry"
else
    bad "historical URL and derived URL disagree"
    echo "       archived: ${HIST_URL##*/}"
    echo "       derived:  ${NEW_URL##*/}"
fi

echo "── 3: the derivation path uses the uploader's rule, not the space-keeper ──"
if grep -q 'fname = make_safe_filename' "$ROOT/scripts/normalize-recordings.py"; then
    ok "pass 3 derives archive_direct with make_safe_filename()"
else
    bad "pass 3 no longer uses the uploader's filename rule"
    grep -n 'fname =' "$ROOT/scripts/normalize-recordings.py" | sed 's/^/       /'
fi

echo ""
if (( FAILURES > 0 )); then echo "RESULT: RED — $FAILURES case(s) failed"; exit 1; fi
echo "RESULT: GREEN — archive object names are consistent across the pipeline"
