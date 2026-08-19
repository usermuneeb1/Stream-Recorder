#!/usr/bin/env bash
# Add/remove topics (tags) for a recording in data/topics.json.
#
# A topic is a free-form label: a series ("Debates 2026"), a subject
# ("Trinity"), or a format ("Q&A"). The dashboard shows them as chips and
# lets viewers filter by topic.
#
# Usage:
#   add-topic.sh <video_id> "<Topic>" [ "<Topic2>" ... ]   add one or more
#   add-topic.sh --remove <video_id> "<Topic>"             remove one
#   add-topic.sh --list <video_id>                         list current topics
#
# Examples:
#   add-topic.sh eIn7iwVa8fg "Street Dawah" "Trinity"
#   add-topic.sh --remove eIn7iwVa8fg "Trinity"
#
# Edits data/topics.json in place (JSON object keyed by video id). Commit the
# result; the dashboard reads it from the CDN on next deploy.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TOPICS_FILE="$REPO_ROOT/data/topics.json"

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

[[ ! -f "$TOPICS_FILE" ]] && echo '{}' > "$TOPICS_FILE"
jq -e . "$TOPICS_FILE" >/dev/null 2>&1 || { echo "error: $TOPICS_FILE invalid JSON" >&2; exit 1; }

MODE="add"
[[ "${1:-}" == "--remove" ]] && { MODE="remove"; shift; }
[[ "${1:-}" == "--list" ]] && { MODE="list"; shift; }
[[ $# -lt 1 ]] && usage

VIDEO_ID="$1"; shift

if [[ "$MODE" == "list" ]]; then
  echo "Topics for $VIDEO_ID:"
  jq -r ".[\"$VIDEO_ID\"] // [] | .[]" "$TOPICS_FILE" 2>/dev/null || echo "  (none)"
  exit 0
fi

[[ $# -lt 1 ]] && usage

if [[ "$MODE" == "remove" ]]; then
  UPDATED=$(jq --arg vid "$VIDEO_ID" --arg t "$1" \
    '.[$vid] = (([$vid] as $v | .[$vid] // []) | map(select(. != $t)))' "$TOPICS_FILE")
else
  # add: append each arg, dedupe, sort
  ARGS_JSON=$(printf '%s\n' "$@" | jq -Rsc 'split("\n") | map(select(length>0))')
  UPDATED=$(jq --arg vid "$VIDEO_ID" --argjson topics "$ARGS_JSON" \
    '.[$vid] = (((.[$vid] // []) + $topics) | unique)' "$TOPICS_FILE")
fi

printf '%s\n' "$UPDATED" > "$TOPICS_FILE"
echo "✓ topics for $VIDEO_ID:"
jq -r ".[\"$VIDEO_ID\"] // [] | .[]" "$TOPICS_FILE" | sed 's/^/  · /'
