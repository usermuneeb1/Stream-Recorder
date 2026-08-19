#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# archive-chat.sh, preserve a stream's live chat BEFORE the video goes private.
#
# Streams routinely flip to private hours after airing; once that happens the
# chat is gone forever. This runs immediately after a recording lands (and on
# a schedule for stragglers) while the video is still public:
#   yt-dlp --write-subs --sub-langs live_chat  →  data/chat/<id>.json
#
# Usage: ./scripts/archive-chat.sh <video_url_or_id>
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHAT_DIR="$REPO_DIR/data/chat"
mkdir -p "$CHAT_DIR" /tmp/mla-chat

input="${1:?usage: archive-chat.sh <video_url_or_id>}"
video_id="$(echo "$input" | grep -oE '[\w-]{11}' | tail -1 || true)"
[[ -z "$video_id" ]] && { echo "cannot parse video id from: $input"; exit 1; }

out="$CHAT_DIR/$video_id.json"
if [[ -s "$out" ]]; then
  echo "chat already archived: $video_id"
  exit 0
fi

echo " capturing live chat for $video_id (while still public)…"
if ! yt-dlp --skip-download --write-subs --sub-langs live_chat \
      --no-warnings -o "/tmp/mla-chat/%(id)s" \
      "https://www.youtube.com/watch?v=$video_id"; then
  echo "⚠  yt-dlp could not fetch chat (private or none available)"
  exit 0   # not fatal, the video may simply have no chat replay
fi

raw=$(ls /tmp/mla-chat/"$video_id"*.live_chat.json 2>/dev/null | head -1 || true)
if [[ -z "$raw" ]]; then
  echo "⚠  no live_chat track returned (regular upload or replay disabled)"
  exit 0
fi

node "$REPO_DIR/scripts/convert-chat.mjs" "$raw" "$out"
rm -f "$raw"
echo "chat preserved → data/chat/$video_id.json"
