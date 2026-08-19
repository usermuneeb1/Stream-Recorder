#!/usr/bin/env bash
# Add (or update) a guest appearance for a recording in data/guests.json.
#
# Usage:
#   add-guest.sh <video_id> "<Guest Name>" <join_seconds> [leave_seconds]
#
#   - join_seconds: when the guest comes on air (mm:ss accepted, e.g. "5:30")
#   - leave_seconds: when they leave (optional; defaults to join → no-op)
#
# Examples:
#   add-guest.sh eIn7iwVa8fg "Dr. Bilal" 12:34 1:02:10
#   add-guest.sh eIn7iwVa8fg "Sheikh X" 300
#
# This edits data/guests.json in place (a JSON object keyed by video id).
# Commit the result; the dashboard reads it from the CDN on next deploy.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GUESTS_FILE="$REPO_ROOT/data/guests.json"

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

# "mm:ss" or "hh:mm:ss" or plain seconds → integer seconds
to_seconds() {
  local v="$1"
  if [[ "$v" =~ ^[0-9]+$ ]]; then
    echo "$v"
    return
  fi
  local h=0 m=0 s=0
  local parts
  IFS=':' read -ra parts <<< "$v"
  case ${#parts[@]} in
    1) s=${parts[0]} ;;
    2) m=${parts[0]}; s=${parts[1]} ;;
    3) h=${parts[0]}; m=${parts[1]}; s=${parts[2]} ;;
    *) echo "0" ;;
  esac
  echo $(( h*3600 + m*60 + s ))
}

[[ $# -lt 3 ]] && usage

VIDEO_ID="$1"
NAME="$2"
JOIN=$(to_seconds "$3")
LEAVE="${4:-$JOIN}"
[[ "$LEAVE" == "$JOIN" ]] && LEAVE=$(to_seconds "$4")
LEAVE=$(to_seconds "${4:-$JOIN}")

[[ -z "$NAME" ]] && { echo "error: guest name required" >&2; usage; }

if [[ ! -f "$GUESTS_FILE" ]]; then
  echo '{}' > "$GUESTS_FILE"
fi

if ! jq -e . "$GUESTS_FILE" >/dev/null 2>&1; then
  echo "error: $GUESTS_FILE is not valid JSON" >&2
  exit 1
fi

# Replace an existing segment with the same name+join (idempotent), else append.
UPDATED=$(jq --arg vid "$VIDEO_ID" --arg name "$NAME" \
  --argjson join "$JOIN" --argjson leave "$LEAVE" '
    (.[$vid] // []) as $cur
    | ($cur | map(select(.name != $name or .join != $join))) as $rest
    | .[$vid] = ($rest + [{ name: $name, join: $join, leave: $leave }]
                  | sort_by(.join))
  ' "$GUESTS_FILE")

printf '%s\n' "$UPDATED" > "$GUESTS_FILE"
echo "✓ $NAME added: ${VIDEO_ID} @ ${JOIN}s → ${LEAVE}s"
echo "  data/guests.json updated — commit it to publish."
