#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: scripts/backfill-archive-nodes.sh (2026-10-23)             ║
# ║                                                                              ║
# ║  Symptom: no recording ever had archive_direct / archive_node, so the        ║
# ║  dashboard's R3AL (archive node) and BUNNY (archive direct) sources never    ║
# ║  appeared, feeds fell back to a dead YouTube link, and the storyboard /      ║
# ║  thumbnail generators found no source. 0/20 records in data were populated.  ║
# ║                                                                              ║
# ║  Three load-bearing defects, one per case:                                   ║
# ║   1. `IFS=$'\t' read -r vid link direct title` — tab is IFS *whitespace*,    ║
# ║      so the empty archive_direct column collapsed and `title` shifted into   ║
# ║      `direct`. need_direct then read 0 and the derivation was skipped for    ║
# ║      exactly the records the script exists to repair.                        ║
# ║   2. The node-presence probe rejected every resolved storage node because    ║
# ║      ia*.us.archive.org contains "archive.org" — it must reject only the     ║
# ║      /download/ redirect URL, or every daily run re-probes everything.       ║
# ║   3. The backfill edited the checkout only. repair-mirrors.yml never commits ║
# ║      that file and repair-mirrors.sh rewrites the index through the Contents ║
# ║      API from a fresh read — so the derived fields were thrown away.         ║
# ║                                                                              ║
# ║  Offline + deterministic: a curl double models archive.org and the GitHub    ║
# ║  Contents API; any other URL answers 000.                                    ║
# ║  Run: bash tests/backfill-archive-nodes-test.sh                              ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAILURES=$((FAILURES+1)); }

STATE=$(mktemp -d)
trap 'rm -rf "$STATE"' EXIT
mkdir -p "$STATE/bin" "$STATE/work/data"
export DEBUG_CURL_STATE="$STATE"
export RECORDINGS_JSON="$STATE/work/data/recordings.json"
# The runner always has both set; with them the script must persist through the
# Contents API (the only path the workflow ever reads back).
export GITHUB_REPOSITORY="usermuneeb1/Stream-Recorder"
export GH_PAT="<REDACTED>"

cat > "$STATE/bin/curl" <<'STUB'
#!/usr/bin/env python3
"""curl double: archive.org probes + GitHub Contents API, nothing else."""
import base64, json, os, sys

STATE = os.environ["DEBUG_CURL_STATE"]
SERVER = os.path.join(STATE, "server.json")
GOOD = os.path.join(STATE, "good.json")

def out(code=0, body="", out_path=None, fmt=None, redirect=""):
    if out_path and out_path != "/dev/null":
        open(out_path, "w").write(body)
    elif out_path is None and body:
        sys.stdout.write(body)
    if fmt:
        if "http_code" in fmt:
            sys.stdout.write(str(code))
        elif "redirect_url" in fmt:
            sys.stdout.write(redirect)
    sys.exit(0)

args = sys.argv[1:]
out_path = fmt = method = data = url = None
i = 0
while i < len(args):
    a = args[i]
    if a in ("-o", "--output") and i + 1 < len(args): out_path = args[i + 1]; i += 2; continue
    if a in ("-w", "--write-out") and i + 1 < len(args): fmt = args[i + 1]; i += 2; continue
    if a in ("-X", "--request") and i + 1 < len(args): method = args[i + 1]; i += 2; continue
    if a in ("-d", "--data", "--data-binary") and i + 1 < len(args): data = args[i + 1]; i += 2; continue
    if a in ("-H", "-A", "--max-time", "--retry", "--retry-wait", "-r", "--range",
             "--dir", "--out", "-x", "-k", "-e", "--connect-timeout"):
        i += 2; continue
    if a.startswith("http"): url = a
    i += 1

if url:
    open(os.path.join(STATE, "calls.log"), "a").write(url + "\n")
if data and data.startswith("@"):
    data = open(data[1:]).read()

if not url:
    out(0, "", out_path, fmt)
method = (method or "GET").upper()
good = json.load(open(GOOD)) if os.path.exists(GOOD) else {}

if url.startswith("https://api.github.com/repos/") and "/contents/" in url:
    if method == "PUT":
        blob = base64.b64decode(json.loads(data or "{}").get("content", "")).decode()
        open(SERVER, "w").write(blob)
        out(200, '{"commit":{"sha":"deadbeef"}}', out_path, fmt)
    body = open(SERVER).read() if os.path.exists(SERVER) else "[]"
    out(200, json.dumps({"content": base64.b64encode(body.encode()).decode(),
                         "encoding": "base64", "sha": "server-sha-1"}), out_path, fmt)

if "archive.org/metadata/" in url:
    ident = url.rsplit("/metadata/", 1)[1].split("?")[0]
    name = good.get(ident, "")
    files = [{"name": name, "format": "MPEG4", "size": "123456789"}] if name else []
    out(200, json.dumps({"metadata": {"identifier": ident}, "files": files}), out_path, fmt)

if "archive.org/download/" in url:
    ident, _, name = url.split("/download/", 1)[1].partition("/")
    real = good.get(ident, "")
    node = f"https://ia800409.us.archive.org/6/items/{ident}/{real}"
    out(206 if (real and name == real) else 404, "", out_path, fmt,
        redirect=node if (real and name == real) else "")

out(0, "", out_path, fmt)
STUB
chmod +x "$STATE/bin/curl"
export PATH="$STATE/bin:$PATH"

# Archive objects are named by upload-clouds.sh make_safe_filename():
# spaces -> underscores. Nothing else exists on these items.
cat > "$STATE/good.json" <<'JSON'
{
  "tml-2026-10-5mI5dC1VxaE-1792278704": "Non-Muslims_Question_Islam_Live_Muhammed_Ali_2026-10-18.mp4",
  "tml-2026-10-kgg3P0w853s-1792186679": "Non-Muslims_Question_Islam_Live_Muhammed_Ali_2026-10-17.mp4"
}
JSON

reset() { : > "$STATE/calls.log"; echo '[]' > "$STATE/server.json"; }

echo "── 1: records missing archive_direct get BOTH fields (manual/local mode) ──"
reset
cat > "$RECORDINGS_JSON" <<'JSON'
[
  { "video_id": "5mI5dC1VxaE",
    "title": "Non-Muslims Question Islam Live! Muhammed Ali 2026-10-18",
    "archive_link": "https://archive.org/details/tml-2026-10-5mI5dC1VxaE-1792278704" },
  { "video_id": "kgg3P0w853s",
    "title": "Non-Muslims Question Islam Live! Muhammed Ali 2026-10-17",
    "archive_link": "https://archive.org/details/tml-2026-10-kgg3P0w853s-1792186679" }
]
JSON
cp "$RECORDINGS_JSON" "$STATE/server.json"
# No API credentials = the manual-run path; the checkout file is the index.
env -u GH_PAT -u GITHUB_REPOSITORY \
    RECORDINGS_JSON="$RECORDINGS_JSON" DEBUG_CURL_STATE="$STATE" PATH="$PATH" \
    bash "$ROOT/scripts/backfill-archive-nodes.sh" > "$STATE/run1.log" 2>&1
MISSING=$(jq '[.[] | select((.archive_direct // "") == "" or (.archive_node // "") == "")] | length' "$RECORDINGS_JSON" 2>/dev/null || echo 2)
if [[ "$MISSING" == "0" ]]; then
    ok "both records derived archive_direct + archive_node"
    DIRECT=$(jq -r '.[0].archive_direct' "$RECORDINGS_JSON")
    case "$DIRECT" in
        https://archive.org/download/*/Non-Muslims_Question_Islam_Live_Muhammed_Ali_2026-10-18.mp4)
            ok "archive_direct uses the uploader's real object name" ;;
        *) bad "archive_direct names the wrong object: $DIRECT" ;;
    esac
else
    bad "$MISSING/2 records still missing archive playback fields"
    grep -E "probe failed|unreachable" "$STATE/run1.log" | sed 's/^/       /' | head -3
fi

echo "── 2: an already-resolved ia*.us.archive.org node is left alone ──"
reset
cat > "$RECORDINGS_JSON" <<'JSON'
[
  { "video_id": "5mI5dC1VxaE",
    "title": "Non-Muslims Question Islam Live! Muhammed Ali 2026-10-18",
    "archive_link": "https://archive.org/details/tml-2026-10-5mI5dC1VxaE-1792278704",
    "archive_direct": "https://archive.org/download/tml-2026-10-5mI5dC1VxaE-1792278704/Non-Muslims_Question_Islam_Live_Muhammed_Ali_2026-10-18.mp4",
    "archive_node": "https://ia800409.us.archive.org/6/items/tml-2026-10-5mI5dC1VxaE-1792278704/Non-Muslims_Question_Islam_Live_Muhammed_Ali_2026-10-18.mp4" }
]
JSON
cp "$RECORDINGS_JSON" "$STATE/server.json"
bash "$ROOT/scripts/backfill-archive-nodes.sh" > "$STATE/run2.log" 2>&1
PROBES=$(wc -l < "$STATE/calls.log" 2>/dev/null | tr -d ' ')
[[ "${PROBES:-0}" == "0" ]] && ok "zero network probes — daily runs stay idempotent" \
    || bad "${PROBES} probe(s) for an already-complete record (resolved node read as missing)"

echo "── 2b: a stale /download/ value in archive_node IS re-resolved ──"
reset
cat > "$RECORDINGS_JSON" <<'JSON'
[
  { "video_id": "5mI5dC1VxaE",
    "title": "Non-Muslims Question Islam Live! Muhammed Ali 2026-10-18",
    "archive_link": "https://archive.org/details/tml-2026-10-5mI5dC1VxaE-1792278704",
    "archive_direct": "https://archive.org/download/tml-2026-10-5mI5dC1VxaE-1792278704/Non-Muslims_Question_Islam_Live_Muhammed_Ali_2026-10-18.mp4",
    "archive_node": "https://archive.org/download/tml-2026-10-5mI5dC1VxaE-1792278704/Non-Muslims_Question_Islam_Live_Muhammed_Ali_2026-10-18.mp4" }
]
JSON
cp "$RECORDINGS_JSON" "$STATE/server.json"
bash "$ROOT/scripts/backfill-archive-nodes.sh" > "$STATE/run2b.log" 2>&1
NODE=$(jq -r '.[0].archive_node' "$STATE/server.json")
case "$NODE" in
    https://ia*.us.archive.org/*) ok "redirect URL replaced with the real storage node" ;;
    *) bad "archive_node still not a storage node: $NODE" ;;
esac

echo "── 3: the derived fields reach the repo (no commit exists in the workflow) ──"
reset
cat > "$RECORDINGS_JSON" <<'JSON'
[
  { "video_id": "5mI5dC1VxaE",
    "title": "Non-Muslims Question Islam Live! Muhammed Ali 2026-10-18",
    "archive_link": "https://archive.org/details/tml-2026-10-5mI5dC1VxaE-1792278704" }
]
JSON
cp "$RECORDINGS_JSON" "$STATE/server.json"
bash "$ROOT/scripts/backfill-archive-nodes.sh" > "$STATE/run3.log" 2>&1
PUSHED=$(jq '[.[] | select((.archive_direct // "") != "" and (.archive_node // "") != "")] | length' "$STATE/server.json" 2>/dev/null || echo 0)
if [[ "$PUSHED" == "1" ]]; then
    ok "the canonical index carries archive_direct + archive_node after the step"
else
    bad "repo-side index still has neither field (checkout-only edit was discarded)"
fi

echo "── 3b: an unreadable API index must never be overwritten ──"
reset
printf '[]' > "$STATE/server.json"
cat > "$RECORDINGS_JSON" <<'JSON'
[
  { "video_id": "5mI5dC1VxaE",
    "title": "Non-Muslims Question Islam Live! Muhammed Ali 2026-10-18",
    "archive_link": "https://archive.org/details/tml-2026-10-5mI5dC1VxaE-1792278704" }
]
JSON
bash "$ROOT/scripts/backfill-archive-nodes.sh" > "$STATE/run3b.log" 2>&1
if [[ "$(cat "$STATE/server.json")" == "[]" ]]; then
    ok "empty index left untouched (wipe guard holds)"
else
    bad "wrote over an empty/unreadable index: $(head -c 120 "$STATE/server.json")"
fi

echo ""
if (( FAILURES > 0 )); then echo "RESULT: RED — $FAILURES case(s) failed"; exit 1; fi
echo "RESULT: GREEN — archive playback backfill derives, is idempotent, and persists"
