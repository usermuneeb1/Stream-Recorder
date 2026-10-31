#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  BACKFILL ARCHIVE NODES — restore fast R3AL playback sources.
#  archive_direct (the /download/<id>/<file> URL) works everywhere but hops a
#  302 at play time; archive_node is the resolved storage-node URL (fastest).
#  The June+ recordings lost their node field when the old enrichment pass
#  died. This fills any entry that has archive_direct but no archive_node,
#  and re-derives archive_direct when even that is missing (deterministic:
#  identifier + safe filename).
#
#  2026-10-23 — this script had never produced a single field in production:
#    1. `IFS=$'\t' read -r vid link direct title` collapsed the EMPTY
#       archive_direct column (tab is IFS whitespace), so `title` slid into
#       `direct`, need_direct read 0 and the derivation was skipped for
#       exactly the records this script exists to repair.
#    2. The node-presence test rejected every resolved storage node because
#       `ia*.us.archive.org` contains "archive.org" → daily re-probes.
#    3. The result was written to the checkout only. repair-mirrors.yml never
#       commits that file and repair-mirrors.sh rewrites the index through the
#       Contents API from a fresh read, so the fields were discarded.
#  tests/backfill-archive-nodes-test.sh locks all three.
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

# Field separator for the jq → bash hand-off. MUST be a non-whitespace
# character: a tab collapses consecutive empty columns in `read`, which is
# what silently shifted title into archive_direct until 2026-10-23.
US=$'\x1f'

log_header "BACKFILLING ARCHIVE PLAYBACK NODES"

mapfile -t ROWS < <(jq -r --arg US "$US" '.[] | select((.archive_link // "") != "")
    | [(.video_id // ""), (.archive_link // ""), (.archive_direct // ""),
       (.archive_node // ""), (.title // "")] | join($US)' "$REC")

# Pending updates, applied to the canonical index once at the end.
UPDATES='[]'

add_update() {   # $1=video_id  $2=field  $3=value
    UPDATES=$(jq -c --arg v "$1" --arg f "$2" --arg val "$3" '
        if any(.[]; .video_id == $v)
        then map(if .video_id == $v then . + {($f): $val} else . end)
        else . + [{video_id: $v, ($f): $val}] end
    ' <<< "$UPDATES")
}

# A resolved node is an absolute non-/download/ URL (ia*.us.archive.org/...).
# The /download/ shim is NOT a node — it 302s at play time, which is the whole
# reason this field exists.
node_is_resolved() {
    local node="${1:-}"
    [[ "$node" == https* || "$node" == http* ]] || return 1
    [[ "$node" == *"/download/"* ]] && return 1
    return 0
}

fixed=0
for row in "${ROWS[@]}"; do
    IFS="$US" read -r vid link direct node title <<< "$row"
    [[ -z "$vid" ]] && continue

    ident=$(echo "$link" | sed -E 's#.*/details/##; s#/.*##')
    need_direct=0; need_node=0
    [[ -z "$direct" ]] && need_direct=1
    node_is_resolved "$node" || need_node=1
    (( need_direct == 0 && need_node == 0 )) && continue

    if (( need_direct == 1 )); then
        derived="https://archive.org/download/${ident}/$(safe_filename "$title").mp4"
        code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -L -r 0-0 "$derived" 2>/dev/null || echo 000)
        if [[ "$code" =~ ^(200|206|302)$ ]]; then
            direct="$derived"
            add_update "$vid" archive_direct "$direct"
            log_ok "${vid}: archive_direct derived"
            ((++fixed))
        else
            log_warn "${vid}: derived direct unreachable (HTTP ${code}), skipping"
        fi
    fi

    if (( need_node == 1 )) && [[ -n "$direct" ]]; then
        node=$(curl -s -o /dev/null -w '%{redirect_url}' --max-time 25 -r 0-1 "$direct" 2>/dev/null || true)
        if [[ -n "$node" && "$node" != "$direct" && "$node" == https* ]]; then
            add_update "$vid" archive_node "$node"
            log_ok "${vid}: archive_node resolved (${node:0:60}...)"
            ((++fixed))
        else
            log_warn "${vid}: node probe failed"
        fi
        sleep 1   # be gentle with archive.org
    fi
done

# ── persist ─────────────────────────────────────────────────────────────────
# The canonical index is data/recordings.json in the repo. A checkout edit is
# invisible to every later step (repair-mirrors.sh re-reads through the API),
# and repair-mirrors.yml has no commit step — so write through the Contents
# API when credentials exist, and only fall back to the local file (manual
# runs) otherwise. Reads are validated first: never write a wiped index.
merge_updates() {
    jq --argjson ups "$UPDATES" '
        map(. as $r
            | ($ups | map(select(.video_id == $r.video_id)) | first) as $u
            | if $u then $r + ($u | del(.video_id)) else $r end)
    ' "$1"
}

persist_updates() {
    [[ "$UPDATES" == "[]" ]] && { log_info "nothing to persist"; return 0; }

    if [[ -n "${GITHUB_REPOSITORY:-}" && -n "${GH_PAT:-}" ]]; then
        local current merged attempt max_attempts="${GH_WRITE_MAX_ATTEMPTS:-5}" rc
        for (( attempt=1; attempt<=max_attempts; attempt++ )); do
            current=$(github_api_read_content "data/recordings.json") || {
                log_error "canonical index unreadable via the API — refusing to write"
                return 1
            }
            if ! jq -e 'type == "array" and length > 0 and all(.[]; type == "object")' <<< "$current" >/dev/null 2>&1; then
                log_error "canonical index invalid/empty — refusing to write"
                return 1
            fi
            merged=$(printf '%s' "$current" | merge_updates /dev/stdin) || {
                log_error "merge failed — refusing to write"; return 1; }
            rc=0
            github_api_write "data/recordings.json" "$merged" "Backfill archive playback nodes" || rc=$?
            if (( rc == 0 )); then
                log_ok "persisted archive playback fields to the repo via the Contents API"
                return 0
            elif (( rc == 2 )) && (( attempt < max_attempts )); then
                log_warn "index changed concurrently; reapplying playback patch ($attempt/$max_attempts)"
                sleep "$attempt"
            else
                log_error "Contents API write failed"; return 1
            fi
        done
    fi

    local merged
    merged=$(merge_updates "$REC") || { log_error "merge failed"; return 1; }
    printf '%s\n' "$merged" > "$REC" && log_ok "persisted archive playback fields to $REC (no API credentials)"
}

if ! persist_updates; then
    log_error "archive playback backfill could not be persisted this run"
    exit 1
fi

log_ok "Backfill complete: ${fixed} field(s) restored in $REC"
