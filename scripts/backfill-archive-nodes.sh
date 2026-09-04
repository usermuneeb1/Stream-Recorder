#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  BACKFILL ARCHIVE NODES — restore fast R3AL playback sources.
#  archive_direct (the /download/<id>/<file> URL) works everywhere but hops a
#  302 at play time; archive_node is the resolved storage-node URL (fastest).
#  The June+ recordings lost their node field when the old enrichment pass
#  died. This fills any entry that has archive_direct but no archive_node,
#  and re-derives archive_direct when even that is missing (deterministic:
#  identifier + safe filename).
# ═══════════════════════════════════════════════════════════════════════════════

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

REC="${RECORDINGS_JSON:-data/recordings.json}"
[[ -f "$REC" ]] || { log_error "recordings.json missing"; exit 1; }

safe_filename() {
    local s="$1"
    s=$(echo "$s" | LC_ALL=C sed 's/[^[:print:]]//g')
    s=$(echo "$s" | sed 's/[^a-zA-Z0-9._\-]/_/g; s/__*/_/g' | cut -c1-200)
    echo "${s:-recording.mp4}"
}

log_header "BACKFILLING ARCHIVE PLAYBACK NODES"

mapfile -t ROWS < <(jq -r '.[] | select((.archive_link // "") != "") | [(.video_id // ""), (.archive_link // ""), (.archive_direct // ""), (.title // "")] | @tsv' "$REC")

fixed=0
for row in "${ROWS[@]}"; do
    IFS=$'\t' read -r vid link direct title <<< "$row"
    [[ -z "$vid" ]] && continue

    local_ident=$(echo "$link" | sed -E 's#.*/details/##; s#/.*##')
    need_direct=0; need_node=0
    [[ -z "$direct" ]] && need_direct=1
    # node considered missing unless it is a non-archive.org absolute URL
    if ! jq -e --arg v "$vid" 'any(.[]; .video_id == $v and (.archive_node // "" | test("^https?://") ) and ((.archive_node // "") | contains("archive.org") | not))' "$REC" >/dev/null 2>&1; then
        need_node=1
    fi
    (( need_direct == 0 && need_node == 0 )) && continue

    if (( need_direct == 1 )); then
        derived="https://archive.org/download/${local_ident}/$(safe_filename "$title").mp4"
        code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -L -r 0-0 "$derived" 2>/dev/null || echo 000)
        if [[ "$code" =~ ^(200|206|302)$ ]]; then
            direct="$derived"
            jq --arg v "$vid" --arg d "$direct" 'map(if .video_id == $v then .archive_direct = $d else . end)' "$REC" > "$REC.tmp" && mv "$REC.tmp" "$REC"
            log_ok "${vid}: archive_direct derived"
            ((++fixed))
        else
            log_warn "${vid}: derived direct unreachable (HTTP ${code}), skipping"
        fi
    fi

    if (( need_node == 1 )) && [[ -n "$direct" ]]; then
        node=$(curl -s -o /dev/null -w '%{redirect_url}' --max-time 25 -r 0-1 "$direct" 2>/dev/null || true)
        if [[ -n "$node" && "$node" != "$direct" && "$node" == https* ]]; then
            jq --arg v "$vid" --arg n "$node" 'map(if .video_id == $v then .archive_node = $n else . end)' "$REC" > "$REC.tmp" && mv "$REC.tmp" "$REC"
            log_ok "${vid}: archive_node resolved (${node:0:60}...)"
            ((++fixed))
        else
            log_warn "${vid}: node probe failed"
        fi
        sleep 1   # be gentle with archive.org
    fi
done

log_ok "Backfill complete: ${fixed} field(s) restored in $REC"
