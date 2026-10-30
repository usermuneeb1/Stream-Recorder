#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: the recorded chat must reach the dashboard (2026-10-30)   ║
# ║                                                                              ║
# ║  The dashboard replay reads `data/chat/<video_id>.json` from the repo CDN.   ║
# ║  Nothing ever wrote that file: the recorder only dropped a raw dump in       ║
# ║  /tmp and upload-clouds published an archive.org URL even when its upload    ║
# ║  had failed. So "chat archived" was true for the link and false for the      ║
# ║  product.                                                                    ║
# ║                                                                              ║
# ║  Locks publish_chat_to_repo():                                               ║
# ║   1. a replay with messages is written to data/chat/<id>.json (Contents API) ║
# ║   2. RECORD_CHAT_REPO / RECORD_CHAT_URL are set so the Discord card links it ║
# ║   3. a replay with ZERO messages publishes nothing (empty `[]` is failure)   ║
# ║   4. a missing/invalid video id publishes nothing                            ║
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

# curl stub: log every URL, answer 201 so github_api_write reports success.
cat > "$FIX/bin/curl" <<EOF
#!/usr/bin/env bash
for a in "\$@"; do
  case "\$a" in
    https://api.github.com/*) echo "\$a" >> "$FIX/curl.log" ;;
  esac
done
printf '%s' "201"
EOF
chmod +x "$FIX/bin/curl"
export PATH="$FIX/bin:$PATH"

export GITHUB_REPOSITORY="usermuneeb1/Stream-Recorder"
export GH_PAT="stub-token"
export RECORD_DIR="$FIX/record"
mkdir -p "$RECORD_DIR"

# shellcheck disable=SC1091
source "$ROOT/scripts/utils.sh" >/dev/null 2>&1
# shellcheck disable=SC1091
source "$ROOT/scripts/upload-clouds.sh" >/dev/null 2>&1

write_chat() {   # $1=path  $2=messages
    local n="$2" i
    printf '{"messages":[' > "$1"
    for (( i = 1; i <= n; i++ )); do
        (( i > 1 )) && printf ',' >> "$1"
        printf '{"t":%d,"a":"user%d","m":"msg %d"}' "$i" "$i" "$i" >> "$1"
    done
    printf ']}' >> "$1"
}

echo "── a captured replay is published to data/chat/<id>.json ──"
rm -f "$FIX/curl.log"
export STREAM_VIDEO_ID="aE9DKeELxVk"
export RECORD_CHAT_FILE="$FIX/record/chat.json"
export RECORD_CHAT_URL=""
export RECORD_CHAT_REPO=""
write_chat "$RECORD_CHAT_FILE" 3
publish_chat_to_repo >/dev/null 2>&1; RC=$?
[[ $RC -eq 0 ]] && ok "publish_chat_to_repo returned 0" || bad "publish_chat_to_repo failed (rc=$RC)"
grep -q 'contents/data/chat/aE9DKeELxVk.json' "$FIX/curl.log" 2>/dev/null \
    && ok "PUT data/chat/aE9DKeELxVk.json (dashboard replay source)" \
    || bad "no write to data/chat/aE9DKeELxVk.json"
[[ "$(echo "${RECORD_CHAT_REPO:-}")" == "data/chat/aE9DKeELxVk.json" ]] \
    && ok "RECORD_CHAT_REPO recorded" || bad "RECORD_CHAT_REPO = '${RECORD_CHAT_REPO:-}'"
[[ "${RECORD_CHAT_URL:-}" == *"/main/data/chat/aE9DKeELxVk.json" ]] \
    && ok "RECORD_CHAT_URL falls back to the repo CDN when archive.org has no copy" \
    || bad "RECORD_CHAT_URL = '${RECORD_CHAT_URL:-}'"

echo "── an EMPTY replay publishes nothing ──"
rm -f "$FIX/curl.log"
export RECORD_CHAT_URL=""
export RECORD_CHAT_REPO=""
write_chat "$RECORD_CHAT_FILE" 0
publish_chat_to_repo >/dev/null 2>&1; RC=$?
[[ $RC -ne 0 ]] && ok "empty replay rejected (rc=$RC)" || bad "empty replay was published"
[[ ! -s "$FIX/curl.log" ]] && ok "no GitHub write attempted for an empty replay" || bad "empty replay wrote to the API"
[[ -z "${RECORD_CHAT_URL:-}" ]] && ok "no chat URL published for an empty replay" || bad "bogus chat URL published"

echo "── a missing video id publishes nothing ──"
rm -f "$FIX/curl.log"
export STREAM_VIDEO_ID="unknown"
write_chat "$RECORD_CHAT_FILE" 2
publish_chat_to_repo >/dev/null 2>&1; RC=$?
[[ $RC -ne 0 && ! -s "$FIX/curl.log" ]] && ok "invalid video id rejected before any API call" || bad "invalid video id reached the API"

echo "── a missing chat file publishes nothing ──"
rm -f "$FIX/curl.log" "$RECORD_DIR/chat.json"   # also drop the RECORD_DIR fallback
export STREAM_VIDEO_ID="aE9DKeELxVk"
export RECORD_CHAT_FILE="$FIX/record/nope.json"
publish_chat_to_repo >/dev/null 2>&1; RC=$?
[[ $RC -ne 0 && ! -s "$FIX/curl.log" ]] && ok "missing replay file rejected" || bad "missing replay file reached the API"

echo
if (( FAILURES > 0 )); then
    echo "RESULT: ❌ ${FAILURES} failure(s)"
    exit 1
fi
echo "RESULT: ✅ captured chat reaches data/chat and the Discord card"
