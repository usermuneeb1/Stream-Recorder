#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: the "ARCHIVED SUCCESSFULLY" Discord card must say HOW the  ║
# ║  recording was captured and WHY chat was/wasn't archived (2026-10-30).      ║
# ║                                                                              ║
# ║  Owner report: "in this dc notification why can't I see method, what method  ║
# ║  it used to record the video, through CDP or cookie? and why my chat is not  ║
# ║  archiving?" The embed carried Duration/Size/Uploads only — no method, and   ║
# ║  "Live Chat: ❌ Not archived" with no reason.                               ║
# ║                                                                              ║
# ║  Method: replay the REAL notify_recording_complete() with curl stubbed, then ║
# ║  assert on the captured webhook payload (the bytes Discord actually sees).   ║
# ║  Locks: "Recorded via" + "Cookies" fields exist and carry the method/tool,   ║
# ║  the code block repeats the method, and the chat field explains itself.     ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"

FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAILURES=$((FAILURES + 1)); }

command -v jq >/dev/null 2>&1 || { echo "  ⏭  jq missing"; exit 0; }

FIX=$(mktemp -d)
trap 'rm -rf "$FIX"' EXIT
mkdir -p "$FIX/bin" "$FIX/run"

# curl stub: copy the JSON body (the `-d @file` argument) somewhere we can read,
# and answer the way Discord answers a successful webhook POST.
cat > "$FIX/bin/curl" <<EOF
#!/usr/bin/env bash
prev=""
for a in "\$@"; do
  if [[ "\$prev" == "-d" ]]; then
    case "\$a" in
      @*) cp "\${a#@}" "$FIX/payload.json" 2>/dev/null || true ;;
    esac
  fi
  prev="\$a"
done
printf '%s' "\${CURL_HTTP_CODE:-201}"
EOF
chmod +x "$FIX/bin/curl"

export PATH="$FIX/bin:$PATH"
export DISCORD_WEBHOOK_RECORDINGS="https://discord.invalid/api/webhooks/stub"
export AVATAR_URL=""
export STREAM_TITLE="Non-Muslims Question Islam Live! Muhammed Ali 2026-10-29"
export STREAM_CHANNEL="The Muslim Lantern"
export STREAM_URL="https://www.youtube.com/watch?v=aE9DKeELxVk"
export STREAM_VIDEO_ID="aE9DKeELxVk"
export RECORD_DURATION_FMT="02:11:35"
export RECORD_SIZE_HUMAN="509.40 MB"
export RECORD_RESOLUTION="1920x1080"
export RECORD_PARTS="1"
export UPLOAD_SUCCESS_COUNT="6"
export UPLOAD_EXPECTED_COUNT="6"
export UPLOAD_ELAPSED_HUMAN="5m 21s"
export PROCESS_ELAPSED="8s"
export WARP_IP="2a09:bac1:7680:c8::4fa:56"
export ARCHIVE_LINKS="HD|https://archive.org/details/tml-test|tml-test"
export GOFILE_LINKS="HD|https://gofile.io/d/stub"
# Method telemetry, exactly as scripts/record-stream.sh publishes it.
export RECORD_METHOD_DESC="K: Real browser session (SeleniumBase cdp)"
export RECORD_METHOD_CODE="K"
export RECORD_METHOD_TOOL="SeleniumBase CDP + ffmpeg"
export RECORD_METHOD_AUTH="cookieless"

# shellcheck disable=SC1091
source "$ROOT/scripts/utils.sh" >/dev/null 2>&1
# shellcheck disable=SC1091
source "$ROOT/scripts/discord-notify.sh" >/dev/null 2>&1

field() { jq -r --arg n "$1" '[.embeds[0].fields[] | select(.name == $n)][0].value // ""' "$FIX/payload.json" 2>/dev/null; }

echo "── case 1: chat NOT archived (the reported card) ──"
export RECORD_CHAT_REASON="no chat replay yet (Video unavailable)"
export RECORD_CHAT_URL=""
export RECORD_CHAT_MESSAGES="0"
export RECORD_CHAT_REPO=""
(cd "$FIX/run" && notify_recording_complete >/dev/null 2>&1) || true

if [[ -s "$FIX/payload.json" ]]; then ok "webhook payload captured"; else bad "no webhook payload (notification never built)"; fi

via=$(field " Recorded via")
[[ "$via" == *"K: Real browser session"* ]] && ok "'Recorded via' names the winning method" || bad "'Recorded via' = '${via}'"
[[ "$via" == *"SeleniumBase CDP + ffmpeg"* ]] && ok "'Recorded via' names the tool (CDP, not cookies)" || bad "tool missing from 'Recorded via'"
auth=$(field " Cookies")
[[ "$auth" == *"cookieless"* ]] && ok "'Cookies' field says cookieless" || bad "'Cookies' field = '${auth}'"
chat=$(field " Live Chat")
[[ "$chat" == *"Not archived"* ]] && ok "chat still reports Not archived" || bad "chat field = '${chat}'"
[[ "$chat" == *"no chat replay yet"* ]] && ok "chat field explains WHY (was silent before)" || bad "chat field has no reason: '${chat}'"
[[ "$(jq -r '.embeds[0].description' "$FIX/payload.json")" == *"Method     K: Real browser"* ]] \
    && ok "code block repeats the method line" || bad "method line missing from the summary block"
[[ "$(jq -r '.embeds[0].description' "$FIX/payload.json")" == *"Uploads    6/6 services"* ]] \
    && ok "Uploads row still aligned in the box" || bad "Uploads row broken"

echo "── case 2: chat archived (link + count) ──"
export RECORD_CHAT_URL="https://archive.org/download/tml-test/chat.json"
export RECORD_CHAT_MESSAGES="41208"
export RECORD_CHAT_REPO="data/chat/aE9DKeELxVk.json"
export RECORD_CHAT_REASON="captured 41208 messages"
export RECORD_METHOD_DESC="VOD rescue (cookies): Android VR (anonymous)"
export RECORD_METHOD_TOOL="yt-dlp (post-stream VOD)"
export RECORD_METHOD_AUTH="cookies"
rm -f "$FIX/payload.json"
(cd "$FIX/run" && notify_recording_complete >/dev/null 2>&1) || true

chat=$(field " Live Chat")
[[ "$chat" == *"archive.org/download/tml-test/chat.json"* ]] && ok "chat links to the archived replay" || bad "chat link missing: '${chat}'"
[[ "$chat" == *"41208 messages"* ]] && ok "chat reports the message count" || bad "chat count missing: '${chat}'"
[[ "$chat" == *"in dashboard"* ]] && ok "chat says it is available in the dashboard replay" || bad "dashboard note missing: '${chat}'"
auth=$(field " Cookies")
[[ "$auth" == *"Yes"* ]] && ok "cookie path is reported as cookies (VOD rescue)" || bad "'Cookies' field = '${auth}'"
[[ "$(field " Recorded via")" == *"VOD rescue"* ]] && ok "VOD rescue is named as the method" || bad "VOD rescue not reported"

echo
if (( FAILURES > 0 )); then
    echo "RESULT: ❌ ${FAILURES} failure(s)"
    exit 1
fi
echo "RESULT: ✅ the ARCHIVED card reports method + chat status honestly"
