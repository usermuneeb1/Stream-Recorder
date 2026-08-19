#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║   BACKFILL MIRRORS — derive missing permanent mirror URLs for old recordings ║
# ║                                                                            ║
# ║  For every recording in data/recordings.json that has an archive_link but   ║
# ║  is missing archive_direct / archive_node, this resolves them from the      ║
# ║  Archive.org metadata API so the dashboard player shows the permanent MP4   ║
# ║  mirrors (not just the YouTube-unlisted source).                            ║
# ║                                                                            ║
# ║  Read-only against Archive.org; no upload secrets needed. Run in CI (has    ║
# ║  network) or locally. Same derivation logic as update-links.sh.             ║
# ║                                                                            ║
# ║  Usage:  bash scripts/backfill-mirrors.sh [--write]                         ║
# ║    (default: dry-run, prints what would change; --write updates the file)   ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REC_FILE="$REPO_ROOT/data/recordings.json"

WRITE=false
[[ "${1:-}" == "--write" ]] && WRITE=true

if [[ ! -f "$REC_FILE" ]]; then
  echo "error: $REC_FILE not found" >&2
  exit 1
fi
jq -e 'type == "array"' "$REC_FILE" >/dev/null 2>&1 || { echo "error: $REC_FILE not a JSON array" >&2; exit 1; }

# Derive archive_direct + archive_node from an archive.org /details/<id> link.
# Prints two lines: archive_direct \n archive_node (may be empty).
resolve_archive() {
  local archive_link="$1"
  local rec_id mp4 meta enc direct node
  rec_id=$(echo "$archive_link" | sed -E 's#.*/details/##; s#/.*##')
  [[ -z "$rec_id" ]] && { echo ""; echo ""; return; }

  meta=$(curl -s -m 30 "https://archive.org/metadata/${rec_id}" 2>/dev/null) || meta=""
  mp4=$(echo "$meta" | jq -r '
      (.files // [])
      | map(select((.name|test("\\.(mp4|m4v|webm|mkv)$";"i")) and (.name|test("_thumb")|not)))
      | sort_by(.size|tonumber? // 0) | reverse | .[0].name // empty' 2>/dev/null)
  if [[ -n "$mp4" ]]; then
    enc=$(printf '%s' "$mp4" | jq -sRr @uri | sed 's/%2F/\//g')
    direct="https://archive.org/download/${rec_id}/${enc}"
    node=$(curl -s -o /dev/null -w "%{redirect_url}" -r 0-1 -m 20 "$direct" 2>/dev/null) || node=""
    echo "$direct"
    echo "$node"
  else
    echo ""
    echo ""
  fi
}

# Process each recording; enrich missing fields via jq.
changed=0
total=$(jq 'length' "$REC_FILE")
for i in $(jq -r 'keys[]' "$REC_FILE"); do
  rec=$(jq ".[$i]" "$REC_FILE")
  vid=$(echo "$rec" | jq -r '.video_id // empty')
  arch=$(echo "$rec" | jq -r '.archive_link // empty')
  have_direct=$(echo "$rec" | jq -r '.archive_direct // empty')
  have_node=$(echo "$rec" | jq -r '.archive_node // empty')

  [[ -z "$arch" ]] && continue
  [[ -n "$have_direct" && -n "$have_node" ]] && continue

  echo "→ $vid: resolving archive_direct/archive_node..."
  mapfile -t resolved < <(resolve_archive "$arch")
  direct="${resolved[0]:-}"
  node="${resolved[1]:-}"

  if [[ -n "$direct" ]]; then
    if [[ "$WRITE" == "true" ]]; then
      REC_FILE_WRITE="$REC_FILE" REC_INDEX="$i" REC_DIRECT="$direct" REC_NODE="$node" jq \
        '.[$ENV.REC_INDEX | tonumber] |= (.archive_direct = $ENV.REC_DIRECT
          | (if ($ENV.REC_NODE != "") then .archive_node = $ENV.REC_NODE else . end))' \
        "$REC_FILE" > "$REC_FILE.tmp"
      mv "$REC_FILE.tmp" "$REC_FILE"
    fi
    changed=$(( changed + 1 ))
    echo "   ✓ archive_direct=$(basename "$direct" 2>/dev/null || echo "$direct")"
    [[ -n "$node" ]] && echo "   ✓ archive_node=$node"
  else
    echo "   ✗ no media file found for $vid (archive id may be missing the mp4)"
  fi
done

echo ""
echo "Backfill complete: $changed of $total recordings enriched"
if [[ "$WRITE" == "false" ]]; then
  echo "(dry run — re-run with --write to persist changes to data/recordings.json)"
fi
