#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: public feeds / sitemap (2026-10-23)                        ║
# ║                                                                              ║
# ║  Two user-visible defects in the syndication surface:                        ║
# ║   1. The Vercel build (`npm run build`) never ran generate-feeds.py, so the  ║
# ║      committed dashboard/public/*.xml were served as-is — last built         ║
# ║      2026-06-23 with 5 of 20 recordings. RSS / podcast / JSON Feed /         ║
# ║      sitemap all advertised an archive that stopped growing in June.         ║
# ║   2. best_audio_or_video_url() fell back to video_url when archive_node /    ║
# ║      archive_direct were empty — i.e. a YouTube *watch page* (HTML) declared ║
# ║      as `<enclosure type="video/mp4">`. Podcast clients got an unplayable    ║
# ║      episode for every recording.                                            ║
# ║                                                                              ║
# ║  Locks: feeds cover every recording · enclosures are direct media · the      ║
# ║  build regenerates feeds · the Python and Node generators agree.             ║
# ║  Run: bash tests/feeds-freshness-test.sh                                     ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAILURES=$((FAILURES+1)); }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# How many recordings should the feeds advertise? Same rule the generator uses:
# the channel's own recordings, one per YouTube id.
EXPECTED=$(python3 - "$ROOT" <<'PY'
import json, re, sys, pathlib
root = pathlib.Path(sys.argv[1])
rows = json.loads((root / "data" / "recordings.json").read_text())
seen = set()
for r in rows:
    if "muslim lantern" not in (r.get("channel") or "").lower():
        continue
    m = re.search(r"(?:v=|/)([\w-]{11})", r.get("video_url") or "")
    if m:
        seen.add(m.group(1))
print(len(seen))
PY
)
[[ -z "$EXPECTED" || "$EXPECTED" == "0" ]] && { echo "RESULT: RED — could not count recordings"; exit 1; }

echo "── 1: the committed feeds cover every recording ($EXPECTED) ──"
for f in feed.xml podcast.xml; do
    N=$(grep -c "<item>" "$ROOT/dashboard/public/$f" 2>/dev/null || echo 0)
    [[ "$N" == "$EXPECTED" ]] && ok "$f has $N items" || bad "$f has $N of $EXPECTED items (stale build artifact)"
done
N=$(python3 - "$ROOT/dashboard/public/feed.json" <<'PY'
import json, sys
try:
    print(len(json.load(open(sys.argv[1])).get("items", [])))
except Exception:
    print(0)
PY
)
[[ "$N" == "$EXPECTED" ]] && ok "feed.json has $N items" || bad "feed.json has $N of $EXPECTED items"
N=$(grep -c "<url>" "$ROOT/dashboard/public/sitemap.xml" 2>/dev/null || echo 0)
# sitemap = home page + one entry per recording
[[ "$N" == "$((EXPECTED + 1))" ]] && ok "sitemap.xml lists $N urls" || bad "sitemap.xml lists $N of $((EXPECTED + 1)) urls"

echo "── 2: a fresh generation produces direct-media enclosures ──"
FEEDS_OUT="$TMP/fresh" python3 "$ROOT/scripts/generate-feeds.py" > "$TMP/gen.log" 2>&1
if [[ ! -f "$TMP/fresh/feed.xml" ]]; then
    bad "generator did not honour FEEDS_OUT / produced no feed.xml"
    FAILURES=$((FAILURES+1))
    sed 's/^/       /' "$TMP/gen.log" | head -3
fi
python3 - "$TMP/fresh" "$EXPECTED" <<'PY'
import json, re, sys, pathlib
out = pathlib.Path(sys.argv[1]); expected = int(sys.argv[2])
fails = 0
def bad(msg):
    global fails; fails += 1; print("  ❌ " + msg)
def good(msg):
    print("  ✅ " + msg)

if not (out / "feed.xml").exists():
    print("  ❌ no feed.xml generated")
    sys.exit(1)

xml = (out / "feed.xml").read_text()
items = re.findall(r"<item>.*?</item>", xml, re.S)
if len(items) == expected: good(f"feed.xml regenerated with {len(items)} items")
else: bad(f"feed.xml regenerated with {len(items)} of {expected} items")

ENCL = re.compile(r'<enclosure url="([^"]+)"')
urls = ENCL.findall(xml)
if len(urls) == len(items): good("every item carries an enclosure")
else: bad(f"{len(items)-len(urls)} item(s) without an enclosure")

def is_media(u):
    # direct file, or a provider's direct-download endpoint — never a page
    if re.search(r"/(watch|details)/", u): return False
    if "pixeldrain.com/api/file/" in u: return True
    return bool(re.search(r"\.(mp4|m4v|webm|mkv|mp3|m4a)(\?|$)", u, re.I))

for u in urls:
    if not is_media(u):
        bad(f"enclosure is not a media URL: {u[:90]}")
if all(is_media(u) for u in urls) and urls:
    good("all enclosures are direct media URLs")

jf = json.loads((out / "feed.json").read_text())
atts = [a.get("url", "") for i in jf.get("items", []) for a in i.get("attachments", [])]
if atts and all(is_media(u) for u in atts): good("JSON Feed attachments are direct media URLs")
else:
    broken = [u for u in atts if not is_media(u)]
    bad(f"{len(broken)} JSON Feed attachment(s) not direct media: {broken[:1]}")

sys.exit(1 if fails else 0)
PY
[[ $? -eq 0 ]] || FAILURES=$((FAILURES+1))

echo "── 3: the production build regenerates the feeds ──"
if grep -rqE "generate-feeds|feeds\.mjs|feeds-generated" \
        "$ROOT/dashboard/package.json" "$ROOT/dashboard/vite.config.ts" \
        "$ROOT/dashboard/vercel.json" 2>/dev/null; then
    ok "dashboard build is wired to regenerate feeds"
else
    bad "nothing in the dashboard build regenerates feeds (Vercel serves stale public/)"
fi

echo "── 4: the Python and Node generators agree ──"
if [[ -f "$ROOT/dashboard/scripts/generate-feeds.mjs" ]]; then
    FEEDS_OUT="$TMP/js" node "$ROOT/dashboard/scripts/generate-feeds.mjs" > "$TMP/genjs.log" 2>&1
    if [[ -f "$TMP/js/feed.xml" ]]; then
        python3 - "$TMP/fresh" "$TMP/js" <<'PY'
import re, sys, pathlib
a, b = (pathlib.Path(p) for p in sys.argv[1:3])
def items(p):
    txt = p.read_text()
    # lastBuildDate is wall-clock; compare the item payloads only
    return re.findall(r"<item>.*?</item>", txt, re.S)
for name in ("feed.xml", "podcast.xml"):
    x, y = items(a / name), items(b / name)
    if x == y:
        print(f"  ✅ {name}: Node output matches the Python generator")
    else:
        print(f"  ❌ {name}: generators disagree ({len(x)} vs {len(y)} items)")
        sys.exit(1)
PY
        [[ $? -eq 0 ]] || FAILURES=$((FAILURES+1))
    else
        bad "Node generator produced no feed.xml"
    fi
else
    bad "dashboard/scripts/generate-feeds.mjs missing (build cannot regenerate feeds)"
fi

echo ""
if (( FAILURES > 0 )); then echo "RESULT: RED — $FAILURES case(s) failed"; exit 1; fi
echo "RESULT: GREEN — feeds cover the archive, play, and are rebuilt on deploy"
