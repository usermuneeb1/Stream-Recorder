#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  🏛️ IMPORT ARCHIVE.ORG PERSONAL BACKUPS                                    ║
# ║  Adds missing Internet Archive "Personal Media Backup" videos to gallery.   ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

RAW_QUERY_DEFAULT='identifier:tml-* AND (title:"Personal Media Backup" OR creator:"Media Archive Bot" OR subject:backup)'

_hms_from_seconds() {
    local sec="${1:-0}"
    [[ ! "$sec" =~ ^[0-9]+$ ]] && sec=0
    printf '%02d:%02d:%02d' $((sec/3600)) $(((sec%3600)/60)) $((sec%60))
}

_human_size() {
    local bytes="${1:-0}"
    [[ ! "$bytes" =~ ^[0-9]+$ ]] && bytes=0
    if (( bytes >= 1073741824 )); then
        awk -v b="$bytes" 'BEGIN { printf "%.1f GB", b/1073741824 }'
    elif (( bytes >= 1048576 )); then
        awk -v b="$bytes" 'BEGIN { printf "%.1f MB", b/1048576 }'
    else
        echo "${bytes} B"
    fi
}

_id_from_identifier() {
    local identifier="$1"
    local id=""
    # tml identifiers are usually: tml-YYYY-MM-VIDEOID-TIMESTAMP.
    # Extract the VIDEOID part even when it contains a dash (e.g. 1-Rb7AkebH4).
    if [[ "$identifier" =~ ^tml-[0-9]{4}-[0-9]{2}-(.+)-[0-9]{9,}$ ]]; then
        id="${BASH_REMATCH[1]}"
    else
        id=$(grep -oE '[A-Za-z0-9_-]{11}' <<< "$identifier" | grep -Ev '^(youtube_arc|Personal|backup)$' | head -1 || true)
    fi
    if [[ -n "$id" ]]; then
        echo "$id"
    else
        echo "archive-${identifier}"
    fi
}

_fetch_identifiers() {
    local query="$1" rows="$2"
    curl -fsS -G "https://archive.org/advancedsearch.php" \
        --data-urlencode "q=(${query})" \
        --data-urlencode "fl[]=identifier" \
        --data-urlencode "fl[]=title" \
        --data-urlencode "fl[]=creator" \
        --data-urlencode "fl[]=publicdate" \
        --data-urlencode "sort[]=publicdate desc" \
        --data-urlencode "rows=${rows}" \
        --data-urlencode "output=json" 2>/dev/null \
    | jq -r '.response.docs[]?.identifier // empty' 2>/dev/null
}

_metadata_entry() {
    local identifier="$1" display_title="$2"
    local metadata files video_file duration size_bytes publicdate date video_id archive_link thumbnail
    metadata=$(curl -fsS --max-time 30 "https://archive.org/metadata/${identifier}" 2>/dev/null) || return 1
    files=$(jq -c '.files // []' <<< "$metadata")
    video_file=$(jq -r '
      [.[]
       | select(.name | test("\\.(mp4|m4v|webm|mkv)$"; "i"))
       | select(.name | test("(_thumb|_ia_thumb)"; "i") | not)
       | . + {score: (
           (if (.name|test("\\.mp4$";"i")) then 120 else 0 end) +
           (if ((.format // "")|test("MPEG4|h\\.264|h264";"i")) then 60 else 0 end) +
           (((.size // "0")|tonumber? // 0) / 1000000000)
         )}
      ] | sort_by(.score) | reverse | .[0] // empty
    ' <<< "$files")
    [[ -z "$video_file" || "$video_file" == "null" ]] && return 1

    duration=$(jq -r '.length // .duration // "0"' <<< "$video_file" 2>/dev/null | awk -F. '{print $1}')
    [[ ! "$duration" =~ ^[0-9]+$ ]] && duration=0
    size_bytes=$(jq -r '.size // "0"' <<< "$video_file" 2>/dev/null)
    [[ ! "$size_bytes" =~ ^[0-9]+$ ]] && size_bytes=0
    publicdate=$(jq -r '.metadata.publicdate // .created // empty' <<< "$metadata" 2>/dev/null)
    date=$(grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}' <<< "$publicdate" | head -1 || true)
    [[ -z "$date" ]] && date=$(date -u '+%Y-%m-%d')
    video_id=$(_id_from_identifier "$identifier")
    archive_link="https://archive.org/details/${identifier}"
    thumbnail="https://archive.org/services/img/${identifier}"

    jq -n \
      --arg video_id "$video_id" \
      --arg title "$display_title" \
      --arg channel "${CHANNEL_DISPLAY_NAME:-The Muslim Lantern}" \
      --arg video_url "" \
      --arg thumbnail "$thumbnail" \
      --arg duration_sec "$duration" \
      --arg duration_fmt "$(_hms_from_seconds "$duration")" \
      --arg size_bytes "$size_bytes" \
      --arg size_human "$(_human_size "$size_bytes")" \
      --arg size_gb "$(awk -v b="$size_bytes" 'BEGIN { printf "%.4f", b/1073741824 }')" \
      --arg date "$date" \
      --arg month "${date:0:7}" \
      --arg archive_link "$archive_link" \
      --arg imported_at "$(now_utc_iso)" \
      '{
        video_id: $video_id,
        title: $title,
        channel: $channel,
        video_url: $video_url,
        thumbnail: $thumbnail,
        duration_sec: ($duration_sec | tonumber? // 0),
        duration_fmt: $duration_fmt,
        size_bytes: ($size_bytes | tonumber? // 0),
        size_human: $size_human,
        size_gb: ($size_gb | tonumber? // 0),
        date: $date,
        month: $month,
        archive_link: $archive_link,
        mega_link: "",
        pixeldrain_link: "",
        gofile_link: "",
        chat_url: "",
        imported_from_archive: true,
        imported_at: $imported_at
      }'
}

import_archive_backups() {
    log_header "🏛️ IMPORT ARCHIVE.ORG PERSONAL BACKUPS"

    local query="${ARCHIVE_QUERY:-$RAW_QUERY_DEFAULT}"
    local rows="${MAX_ITEMS:-100}"
    local display_title="${DISPLAY_TITLE:-Non-Muslims Question Islam Live! Muhammed Ali}"
    local dry_run="${DRY_RUN:-false}"

    log_info "Archive query: $query"
    log_info "Display title: $display_title"

    local existing
    existing=$(github_api_read_content "data/recordings.json" 2>/dev/null) || existing="$(cat data/recordings.json 2>/dev/null || echo '[]')"
    [[ -z "$existing" || "$existing" != "["* ]] && existing='[]'

    local existing_ids existing_archive_ids existing_base_ids
    existing_ids=$(jq -r '.[].video_id // empty' <<< "$existing" 2>/dev/null | sort -u)
    existing_archive_ids=$(jq -r '.[].archive_link // empty' <<< "$existing" 2>/dev/null | sed -E 's#.*archive\.org/details/([^/?#]+).*#\1#' | sort -u)
    existing_base_ids=$(jq -r '.[].archive_link // empty' <<< "$existing" 2>/dev/null         | while IFS= read -r archive_url; do
            [[ "$archive_url" == *archive.org/details/* ]] || continue
            archive_identifier=$(sed -E 's#.*archive\.org/details/([^/?#]+).*#\1#' <<< "$archive_url")
            [[ -n "$archive_identifier" ]] && _id_from_identifier "$archive_identifier"
          done | sort -u)

    local imported=0 skipped=0 failed=0 entries="[]"
    while IFS= read -r identifier; do
        [[ -z "$identifier" ]] && continue
        local video_id
        video_id=$(_id_from_identifier "$identifier")
        if grep -qxF "$identifier" <<< "$existing_archive_ids"             || grep -qxF "$video_id" <<< "$existing_ids"             || grep -qxF "$video_id" <<< "$existing_base_ids"; then
            log_info "Skip duplicate: $identifier (base video: $video_id)"
            skipped=$((skipped + 1))
            continue
        fi

        log_info "Importing: $identifier"
        local entry
        if entry=$(_metadata_entry "$identifier" "$display_title"); then
            entries=$(jq --argjson e "$entry" '. + [$e]' <<< "$entries")
            imported=$((imported + 1))
        else
            log_warn "Failed to build entry for $identifier"
            failed=$((failed + 1))
        fi
    done < <(_fetch_identifiers "$query" "$rows")

    log_info "Imported candidates: $imported; skipped: $skipped; failed: $failed"
    if (( imported == 0 )); then
        log_ok "No new Archive.org backup videos to import"
        return 0
    fi

    local merged
    merged=$(jq -s '.[0] + .[1] | reduce .[] as $item ([]; if any(.[]; (.archive_link == $item.archive_link) or (.video_id == $item.video_id)) then . else . + [$item] end) | sort_by(.date) | reverse' <(echo "$entries") <(echo "$existing")) || return 1

    if [[ "$dry_run" == "true" ]]; then
        log_warn "DRY_RUN=true — not writing data/recordings.json"
        echo "$entries" | jq .
        return 0
    fi

    github_api_write "data/recordings.json" "$merged" "🏛️ Import Archive.org personal backups ($(now_pkt))"
    log_ok "Imported $imported new backup video(s) into gallery"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    import_archive_backups
fi
