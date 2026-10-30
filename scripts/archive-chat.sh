#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# archive-chat.sh, preserve a stream's live chat BEFORE the video goes private.
#
# Streams routinely flip to private hours after airing; once that happens the
# chat is gone forever. This is the ONE implementation of "capture a chat
# replay", used by:
#   • scripts/record-stream.sh  (--output into the recording dir, so the
#     uploader can publish it minutes after the stream ends)
#   • .github/workflows/chat-archiver.yml  (default: data/chat/<id>.json)
#
# Two independent capture paths, because each fails differently:
#   1. yt-dlp --write-subs --sub-langs live_chat   (JSON Lines)
#   2. chat-downloader --output <file>             (JSON array)
# Both feed scripts/convert-chat.mjs, which normalises either dump into the
# compact replay format the dashboard serves:
#       data/chat/<video_id>.json  →  { messages: [{t,a,m,p?,k?}] }
#
# History (2026-10-30): yt-dlp's raw dump was handed straight to the dashboard,
# convert-chat could not read chat-downloader's array at all, and a non-empty
# file counted as "archived" — so a bare `[]` blocked every retry while the
# Discord card said "Live Chat: ❌ Not archived". Only real messages count now.
#
# Usage:
#   archive-chat.sh <video_url_or_id> [--output FILE] [--wait SECS] [--force]
#     --output FILE   write the replay here instead of data/chat/<id>.json
#     --wait SECS     keep retrying for a replay up to SECS (post-stream lag)
#     --force         re-capture even if a replay already exists
# Env:   CHAT_DIR (default <repo>/data/chat) · CHAT_FORCE=1 · CHAT_REPLAY_TIMEOUT
#        CHAT_RETRY_SLEEP (default 60s between --wait retries; tests set 0)
# Exit:  0 archived (or already archived) · 2 nothing available · 3 tooling
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHAT_DIR="${CHAT_DIR:-$REPO_DIR/data/chat}"
CONVERT="$REPO_DIR/scripts/convert-chat.mjs"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mla-chat.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

input=""
output=""
wait_budget=0
force="${CHAT_FORCE:-0}"

while (( $# > 0 )); do
    case "$1" in
        --output|-o) output="${2:?--output needs a path}"; shift 2 ;;
        --wait)      wait_budget="${2:-0}"; shift 2 ;;
        --force)     force=1; shift ;;
        -h|--help)   sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *)           input="$1"; shift ;;
    esac
done

[[ -z "$input" ]] && { echo "usage: archive-chat.sh <video_url_or_id> [--output FILE] [--wait SECS] [--force]"; exit 2; }

video_id="$(echo "$input" | grep -oE '[A-Za-z0-9_-]{11}' | tail -1 || true)"
[[ -z "$video_id" ]] && { echo "cannot parse video id from: $input"; exit 2; }

url="https://www.youtube.com/watch?v=$video_id"
if [[ -n "$output" ]]; then
    out="$output"
    mkdir -p "$(dirname "$out")"
else
    out="$CHAT_DIR/$video_id.json"
    mkdir -p "$CHAT_DIR"
fi

tool_timeout="${CHAT_REPLAY_TIMEOUT:-180}"

# A replay counts as archived only if it actually holds messages — an empty
# `[]` / `{"messages":[]}` is a failed capture, not an archive.
message_count() {
    local f="$1"
    [[ -s "$f" ]] || { echo 0; return 0; }
    # `demo: true` is the dashboard's SAMPLE replay (data/chat/eIn7iwVa8fg.json),
    # not a capture of that video — checked before conversion, which strips the
    # flag. A JSON-Lines dump is not a single JSON object, so jq just says no.
    if jq -e '.demo == true' "$f" >/dev/null 2>&1; then
        echo 0
        return 0
    fi
    node "$CONVERT" "$f" "$TMP_DIR/probe.json" >/dev/null 2>&1 || { echo 0; return 0; }
    jq -r '(.messages // []) | length' "$TMP_DIR/probe.json" 2>/dev/null || echo 0
}

existing=$(message_count "$out")
if (( existing > 0 )) && [[ "$force" != "1" ]]; then
    echo "chat already archived: $video_id ($existing messages)"
    exit 0
fi

if ! command -v node >/dev/null 2>&1; then
    echo "node is required to convert chat dumps (data/chat/*.json)"
    exit 3
fi

# One pass over both tools. Echoes the best message count found and leaves the
# winning dump in $TMP_DIR/best.<ext> (empty string when nothing was captured).
capture_once() {
    local best=0 bestfile=""

    if command -v yt-dlp >/dev/null 2>&1; then
        mkdir -p "$TMP_DIR/ytdlp"
        timeout "$tool_timeout" yt-dlp --skip-download --write-subs --sub-langs live_chat \
            --no-warnings --no-progress \
            -o "$TMP_DIR/ytdlp/%(id)s" \
            "$url" >"$TMP_DIR/ytdlp.log" 2>&1 || true

        local cand
        cand=$(ls "$TMP_DIR/ytdlp/$video_id"*.json 2>/dev/null | head -1 || true)
        if [[ -n "$cand" ]]; then
            local n
            n=$(message_count "$cand")
            (( n > best )) && { best=$n; bestfile="$cand"; }
        fi
        echo "  yt-dlp: ${best} messages" >&2
    fi

    if (( best == 0 )); then
        local chat_bin=""
        if command -v chat_downloader  >/dev/null 2>&1; then chat_bin="chat_downloader"
        elif command -v chat-downloader >/dev/null 2>&1; then chat_bin="chat-downloader"
        elif python3 -c "import chat_downloader" >/dev/null 2>&1; then chat_bin="__module__"; fi

        if [[ -n "$chat_bin" ]]; then
            local cdl="$TMP_DIR/cdl.json"
            if [[ "$chat_bin" == "__module__" ]]; then
                timeout "$tool_timeout" python3 -m chat_downloader "$url" \
                    --output "$cdl" --message_groups all >"$TMP_DIR/cdl.log" 2>&1 || true
            else
                timeout "$tool_timeout" "$chat_bin" "$url" \
                    --output "$cdl" --message_groups all >"$TMP_DIR/cdl.log" 2>&1 || true
            fi
            if [[ -s "$cdl" ]]; then
                local n
                n=$(message_count "$cdl")
                (( n > best )) && { best=$n; bestfile="$cdl"; }
            fi
            echo "  chat-downloader: ${best} messages ($(tail -1 "$TMP_DIR/cdl.log" 2>/dev/null | cut -c1-90))" >&2
        fi
    fi

    if (( best > 0 )) && [[ -n "$bestfile" ]]; then
        cp -f "$bestfile" "$TMP_DIR/best.json" 2>/dev/null || true
    fi
    echo "$best"
}

echo " capturing live chat for $video_id (while still public)…"
best=$(capture_once)
retry_sleep="${CHAT_RETRY_SLEEP:-60}"
(( retry_sleep < 0 )) && retry_sleep=0
# Progress must be guaranteed: a 0s sleep (tests) would otherwise loop forever
# on the same `waited` value, so attempts are capped as well as time-boxed.
step=$(( retry_sleep > 0 ? retry_sleep : 60 ))
# --wait 0 (the default) means "one pass, no retries" — not one extra sleep.
max_attempts=$(( wait_budget > 0 ? wait_budget / step + 1 : 0 ))
waited=0
attempts=0
while (( best == 0 && attempts < max_attempts )); do
    (( ++attempts ))
    echo "  replay not built yet, retrying (attempt ${attempts}/${max_attempts}, ${waited}/${wait_budget}s)…"
    [[ "$retry_sleep" -gt 0 ]] && sleep "$retry_sleep"
    (( waited += step ))
    best=$(capture_once)
done

if (( best == 0 )) || [[ ! -s "$TMP_DIR/best.json" ]]; then
    echo "⚠  no live-chat replay available for $video_id (private, none, or not processed yet)"
    exit 2
fi

# ── Write atomically: a half-written replay must never replace a good one ───
tmp_out="$TMP_DIR/final.json"
node "$CONVERT" "$TMP_DIR/best.json" "$tmp_out" >/dev/null 2>&1 || { echo "⚠  chat conversion failed"; exit 3; }
mv -f "$tmp_out" "$out" || { echo "⚠  could not write $out"; exit 3; }
echo "chat preserved → ${out} ($best messages)"
exit 0
