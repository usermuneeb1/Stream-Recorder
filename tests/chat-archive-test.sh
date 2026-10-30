#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: live-chat archiving (2026-10-30)                          ║
# ║                                                                              ║
# ║  The Discord card said "Live Chat: ❌ Not archived" for every recording,     ║
# ║  and the dashboard replay was always empty. Two real defects:                ║
# ║    1. scripts/convert-chat.mjs only understood yt-dlp's JSON-Lines dump.     ║
# ║       The recorder captures with chat-downloader, which writes a JSON        ║
# ║       ARRAY — so every successful capture converted to 0 messages and was    ║
# ║       thrown away.                                                           ║
# ║    2. archive-chat.sh counted a non-empty file as "archived", so a bare      ║
# ║       `[]` (failed capture) passed as success and blocked all retries.       ║
# ║                                                                              ║
# ║  Locks: both input formats convert · chat-downloader array round-trips ·     ║
# ║  archive-chat.sh writes a valid data/chat/<id>.json · empty dumps are a      ║
# ║  failure (exit 2), never a silent success · an existing replay is kept.      ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
CONVERT="$ROOT/scripts/convert-chat.mjs"
ARCHIVE="$ROOT/scripts/archive-chat.sh"

FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAILURES=$((FAILURES + 1)); }

if ! command -v node >/dev/null 2>&1; then
    echo "  ⏭  node not installed, skipping chat tests"
    exit 0
fi
if ! command -v jq >/dev/null 2>&1; then
    echo "  ⏭  jq not installed, skipping chat tests"
    exit 0
fi

FIX=$(mktemp -d)
trap 'rm -rf "$FIX"' EXIT
mkdir -p "$FIX/bin" "$FIX/chat"

VID="TESTVIDEO01"   # 11 chars, YouTube-id shaped

# ── Fixture 1: chat-downloader JSON array (what the recorder produces) ───────
cat > "$FIX/cdl.json" <<'EOF'
[{"message_id":"a1","message":"salam everyone","author":{"name":"Alice"},"time_in_seconds":1.5,"time_text":"0:01","message_type":"text_message"},
 {"message":"great stream","author":{"name":"Bob"},"time_in_seconds":95.04,"time_text":"1:35","message_type":"text_message"},
 {"message":"here is $5","author":{"name":"Cara"},"time_in_seconds":96,"message_type":"paid_message","money":{"text":"$5.00","amount":5.0,"currency":"USD"}},
 {"author":{"name":"Dan"},"time_in_seconds":120,"message_type":"membership_item"},
 {"message":"no clock on this one","author":{"name":"Eve"},"message_type":"text_message"}]
EOF

# ── Fixture 2: yt-dlp .live_chat.json (JSON Lines) ──────────────────────────
python3 - "$FIX/ytdlp.live_chat.json" <<'PY'
import json, sys

def wrap(off, renderer):
    return {"replayChatItemAction": {
        "videoOffsetTimeMsec": str(off),
        "actions": [{"addChatItemAction": {"item": renderer}}],
    }}

lines = [
    wrap(1500, {"liveChatTextMessageRenderer": {
        "message": {"runs": [{"text": "hello world"}]},
        "authorName": {"simpleText": "Alice"}}}),
    wrap(95000, {"liveChatPaidMessageRenderer": {
        "message": {"runs": [{"text": "$5 says hi"}]},
        "authorName": {"simpleText": "Bob"},
        "purchaseAmountText": {"simpleText": "$5.00"}}}),
    wrap(96000, {"liveChatMembershipItemRenderer": {"authorName": {"simpleText": "Cara"}}}),
    {"liveChatTextMessageRenderer": {
        "message": {"runs": [{"text": "direct renderer"}]},
        "authorName": {"simpleText": "Dan"},
        "videoOffsetTimeMsec": "100000"}},
]
open(sys.argv[1], "w").write("\n".join(json.dumps(l) for l in lines) + "\n")
PY

echo "── converter: chat-downloader JSON array ──"
node "$CONVERT" "$FIX/cdl.json" "$FIX/cdl.out.json" >/dev/null 2>&1
N=$(jq -r '.messages | length' "$FIX/cdl.out.json" 2>/dev/null || echo 0)
[[ "$N" == "5" ]] && ok "chat-downloader array → 5 messages (was 0 before the fix)" || bad "chat-downloader array → ${N} messages, expected 5"
[[ "$(jq -r '.messages[2].k // ""' "$FIX/cdl.out.json")" == "super" ]] && ok "superchat flagged k=super with amount" || bad "superchat not flagged"
[[ "$(jq -r '.messages[2].p // ""' "$FIX/cdl.out.json")" == '$5.00' ]] && ok "superchat amount preserved" || bad "superchat amount lost"
[[ "$(jq -r '.messages[3].k // ""' "$FIX/cdl.out.json")" == "member" ]] && ok "membership flagged k=member" || bad "membership not flagged"
[[ "$(jq -r '.messages[4].t' "$FIX/cdl.out.json")" == "120" ]] && ok "message without a clock keeps the previous offset" || bad "timestampless message dropped"

echo "── converter: yt-dlp JSON Lines ──"
node "$CONVERT" "$FIX/ytdlp.live_chat.json" "$FIX/ytdlp.out.json" >/dev/null 2>&1
N=$(jq -r '.messages | length' "$FIX/ytdlp.out.json" 2>/dev/null || echo 0)
[[ "$N" == "4" ]] && ok "yt-dlp JSONL → 4 messages" || bad "yt-dlp JSONL → ${N} messages, expected 4"
[[ "$(jq -r '.messages[1].k // ""' "$FIX/ytdlp.out.json")" == "super" ]] && ok "nested replayChatItemAction superchat parsed" || bad "replay-wrapped superchat lost"

echo "── converter: idempotent on an already-compact replay ──"
node "$CONVERT" "$FIX/cdl.out.json" "$FIX/again.json" >/dev/null 2>&1
if diff -q "$FIX/cdl.out.json" "$FIX/again.json" >/dev/null 2>&1; then
    ok "re-running the converter is a no-op (safe to re-convert)"
else
    bad "converter is not idempotent"
fi

# ── yt-dlp stub: emits a live_chat dump for the -o template ─────────────────
cat > "$FIX/bin/yt-dlp" <<EOF
#!/usr/bin/env bash
out=""; prev=""
for a in "\$@"; do [[ "\$prev" == "-o" ]] && out="\$a"; prev="\$a"; done
[[ -z "\$out" ]] && exit 1
# derive the id from the trailing URL argument, like the real tool does
url="\${!#}"
id=\$(echo "\$url" | grep -oE '[A-Za-z0-9_-]{11}' | tail -1)
out="\${out//%(id)s/\$id}"
mkdir -p "\$(dirname "\$out")"
if [[ "\${MOCK_CHAT_EMPTY:-0}" == "1" ]]; then
    echo '[]' > "\${out}.live_chat.json"
    exit 0
fi
# MOCK_FAIL_FIRST=N → the first N calls write nothing (replay not built yet)
if [[ -n "\${MOCK_FAIL_FIRST:-}" ]]; then
    counter="$FIX/ytdlp_calls"
    n=\$(cat "\$counter" 2>/dev/null || echo 0)
    n=\$((n + 1))
    echo "\$n" > "\$counter"
    (( n <= MOCK_FAIL_FIRST )) && exit 0
fi
python3 - "\${out}.live_chat.json" "\${MOCK_CHAT_MESSAGES:-3}" <<'PY'
import json, sys
path, n = sys.argv[1], int(sys.argv[2])
with open(path, "w") as fh:
    for i in range(1, n + 1):
        fh.write(json.dumps({"replayChatItemAction": {
            "videoOffsetTimeMsec": str(i * 1000),
            "actions": [{"addChatItemAction": {"item": {"liveChatTextMessageRenderer": {
                "message": {"runs": [{"text": f"msg {i}"}]},
                "authorName": {"simpleText": f"user{i}"}}}}}]}}) + "\n")
PY
exit 0
EOF
chmod +x "$FIX/bin/yt-dlp"

echo "── archive-chat.sh: writes a dashboard-ready replay ──"
OUT=$(PATH="$FIX/bin:$PATH" CHAT_DIR="$FIX/chat" bash "$ARCHIVE" "https://www.youtube.com/watch?v=$VID" 2>&1); RC=$?
echo "$OUT" | sed 's/^/     /'
[[ $RC -eq 0 ]] && ok "archive-chat.sh exit 0 when a replay is available" || bad "archive-chat.sh exit $RC"
[[ -s "$FIX/chat/$VID.json" ]] && ok "data/chat/$VID.json written" || bad "data/chat/$VID.json missing"
[[ "$(jq -r '.messages | length' "$FIX/chat/$VID.json" 2>/dev/null || echo 0)" == "3" ]] \
    && ok "replay holds 3 messages" || bad "replay has the wrong message count"
[[ "$(jq -r '.messages[0] | has("t") and has("a") and has("m")' "$FIX/chat/$VID.json" 2>/dev/null)" == "true" ]] \
    && ok "compact schema {t,a,m} (what the dashboard replay reads)" || bad "wrong schema"

echo "── archive-chat.sh: existing replay is kept ──"
before=$(md5sum "$FIX/chat/$VID.json" | cut -d' ' -f1)
OUT=$(PATH="$FIX/bin:$PATH" CHAT_DIR="$FIX/chat" MOCK_CHAT_MESSAGES=9 bash "$ARCHIVE" "$VID" 2>&1); RC=$?
after=$(md5sum "$FIX/chat/$VID.json" | cut -d' ' -f1)
[[ $RC -eq 0 && "$before" == "$after" ]] && ok "second run leaves the archived replay untouched" || bad "existing replay was overwritten (rc=$RC)"

echo "── archive-chat.sh: an EMPTY dump is a failure, not a success ──"
VID2="EMPTYVID002"
OUT=$(PATH="$FIX/bin:$PATH" CHAT_DIR="$FIX/chat" MOCK_CHAT_EMPTY=1 bash "$ARCHIVE" "https://www.youtube.com/watch?v=$VID2" 2>&1); RC=$?
echo "$OUT" | sed 's/^/     /'
[[ $RC -eq 2 ]] && ok "empty [] → exit 2 (the old byte-count check called this success)" || bad "empty dump exit $RC, expected 2"
[[ ! -s "$FIX/chat/$VID2.json" ]] && ok "no bogus replay file left behind" || bad "empty replay was written to data/chat"

echo "── archive-chat.sh: --output writes where the recorder asks ──"
VID3="OUTPUTVID03"
rm -f "$FIX/ytdlp_calls"
OUT=$(PATH="$FIX/bin:$PATH" CHAT_DIR="$FIX/chat" MOCK_FAIL_FIRST=1 CHAT_RETRY_SLEEP=0 \
      bash "$ARCHIVE" "https://www.youtube.com/watch?v=$VID3" \
      --output "$FIX/rec/chat.json" --wait 120 2>&1); RC=$?
echo "$OUT" | sed 's/^/     /'
[[ $RC -eq 0 ]] && ok "--wait survives a not-yet-built replay (retries until it appears)" || bad "--wait retry path failed (rc=$RC)"
[[ -s "$FIX/rec/chat.json" ]] && ok "--output path honoured" || bad "--output path not written"
[[ ! -e "$FIX/chat/$VID3.json" ]] && ok "data/chat untouched when --output is given" || bad "--output leaked into data/chat"
[[ "$(jq -r '.messages | length' "$FIX/rec/chat.json" 2>/dev/null || echo 0)" == "3" ]] \
    && ok "retried capture still yields a valid replay" || bad "retried capture is not a valid replay"

echo
if (( FAILURES > 0 )); then
    echo "RESULT: ❌ ${FAILURES} failure(s)"
    exit 1
fi
echo "RESULT: ✅ chat archiving produces a dashboard-ready replay"
