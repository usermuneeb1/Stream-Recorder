#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  📡 STREAM RECORDER — PERSISTENT STATISTICS ENGINE                          ║
# ║  Tracks lifetime recording statistics in stats.json via GitHub API.         ║
# ║  Every recording updates: total_streams, total_hours, total_gb, averages.  ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

# ═══════════════════════════════════════════════════════════════════════════════
#  UPDATE STATISTICS
# ═══════════════════════════════════════════════════════════════════════════════

update_stats() {
    log_header "📊 UPDATING STATISTICS"
    
    local duration_sec="${RECORD_DURATION_SEC:-0}"
    local size_bytes="${RECORD_SIZE_BYTES:-0}"
    local stream_title="${STREAM_TITLE:-Unknown Stream}"
    local stream_channel="${STREAM_CHANNEL:-Unknown Channel}"
    local current_date
    current_date=$(now_pkt)
    
    local duration_hours
    duration_hours=$(echo "scale=4; $duration_sec / 3600" | bc)
    [[ "$duration_hours" == .* ]] && duration_hours="0${duration_hours}"
    local size_gb
    size_gb=$(echo "scale=4; $size_bytes / 1073741824" | bc)
    [[ "$size_gb" == .* ]] && size_gb="0${size_gb}"
    
    log_info "New recording data:"
    log_info "  Duration : $(format_duration "$duration_sec") (${duration_hours}h)"
    log_info "  Size     : $(format_size "$size_bytes") (${size_gb} GB)"
    log_info "  Title    : ${stream_title}"
    
    # ── Read existing stats ──────────────────────────────────────────────────
    log_step "Reading existing stats.json..."
    
    local existing_stats
    existing_stats=$(github_api_read_content "stats.json" 2>/dev/null) || existing_stats=""
    
    local total_streams=0 total_hours=0 total_gb=0 avg_duration=0
    local src_archive=0 src_mega=0 src_pixel=0 src_gofile=0
    
    if [[ -n "$existing_stats" ]]; then
        total_streams=$(echo "$existing_stats" | jq -r '.total_streams // 0' 2>/dev/null)
        total_hours=$(echo "$existing_stats" | jq -r '.total_hours // 0' 2>/dev/null)
        total_gb=$(echo "$existing_stats" | jq -r '.total_gb // 0' 2>/dev/null)
        src_archive=$(echo "$existing_stats" | jq -r '.sources.archive // 0' 2>/dev/null)
        src_mega=$(echo "$existing_stats" | jq -r '.sources.mega // 0' 2>/dev/null)
        src_pixel=$(echo "$existing_stats" | jq -r '.sources.pixel // .sources.pixeldrain // 0' 2>/dev/null)
        src_gofile=$(echo "$existing_stats" | jq -r '.sources.gofile // 0' 2>/dev/null)
        log_info "Existing: ${total_streams} streams, ${total_hours}h, ${total_gb} GB"
    else
        log_info "No existing stats — creating from scratch"
    fi
    
    # ── Calculate new totals ─────────────────────────────────────────────────
    log_step "Calculating new totals..."
    
    total_streams=$(( total_streams + 1 ))
    total_hours=$(echo "scale=2; $total_hours + $duration_hours" | bc)
    total_gb=$(echo "scale=2; $total_gb + $size_gb" | bc)
    avg_duration=$(echo "scale=2; $total_hours / $total_streams" | bc)
    # Normalize bc output — bc omits leading zero (.13 → 0.13) which breaks jq tonumber
    [[ "$total_hours"   == .* ]] && total_hours="0${total_hours}"
    [[ "$total_gb"      == .* ]] && total_gb="0${total_gb}"
    [[ "$avg_duration"  == .* ]] && avg_duration="0${avg_duration}"
    [[ "$size_gb"       == .* ]] && size_gb="0${size_gb}"
    
    # Count one provider hit per recording if at least one link was produced.
    [[ -n "${ARCHIVE_LINKS:-}" ]] && src_archive=$(( src_archive + 1 ))
    [[ -n "${MEGA_LINKS:-}" ]] && src_mega=$(( src_mega + 1 ))
    [[ -n "${PIXELDRAIN_LINKS:-}" ]] && src_pixel=$(( src_pixel + 1 ))
    [[ -n "${GOFILE_LINKS:-}" ]] && src_gofile=$(( src_gofile + 1 ))
    
    log_info "Updated: ${total_streams} streams, ${total_hours}h, ${total_gb} GB, avg ${avg_duration}h"
    log_info "Sources: archive=${src_archive}, mega=${src_mega}, pixel=${src_pixel}, gofile=${src_gofile}"
    
    # ── Build new stats JSON ─────────────────────────────────────────────────
    local new_stats
    new_stats=$(jq -n \
        --arg total_streams      "$total_streams" \
        --arg total_hours        "$total_hours" \
        --arg total_gb           "$total_gb" \
        --arg avg_duration_hours "$avg_duration" \
        --arg src_archive        "$src_archive" \
        --arg src_mega           "$src_mega" \
        --arg src_pixel          "$src_pixel" \
        --arg src_gofile         "$src_gofile" \
        --arg last_title         "$stream_title" \
        --arg last_channel       "$stream_channel" \
        --arg last_date          "$current_date" \
        --arg last_duration      "$(format_duration "$duration_sec")" \
        --arg last_size_gb       "$size_gb" \
        --arg updated_at         "$(now_utc_iso)" \
        '{
            total_streams: ($total_streams | tonumber // 0 | floor),
            total_hours: ($total_hours | tonumber // 0),
            total_gb: ($total_gb | tonumber // 0),
            avg_duration_hours: ($avg_duration_hours | tonumber // 0),
            sources: {
                archive: ($src_archive | tonumber // 0),
                mega: ($src_mega | tonumber // 0),
                pixel: ($src_pixel | tonumber // 0),
                gofile: ($src_gofile | tonumber // 0)
            },
            last_stream: {
                title: $last_title,
                channel: $last_channel,
                date: $last_date,
                duration: $last_duration,
                size_gb: ($last_size_gb | tonumber // 0)
            },
            updated_at: $updated_at
        }')
    
    # ── Write to GitHub ──────────────────────────────────────────────────────
    log_step "Saving stats.json to GitHub..."
    
    if github_api_write "stats.json" "$new_stats" "📊 Stats update: ${total_streams} streams, ${total_hours}h, ${total_gb} GB"; then
        log_ok "Statistics updated successfully"
    else
        log_error "Failed to update stats.json"
        return 1
    fi
    
    # ── Export for other scripts ─────────────────────────────────────────────
    set_env "LIFETIME_TOTAL_STREAMS" "$total_streams"
    set_env "LIFETIME_TOTAL_HOURS" "$total_hours"
    set_env "LIFETIME_TOTAL_GB" "$total_gb"
    set_env "LIFETIME_AVG_DURATION" "$avg_duration"
    
    log_separator
    log_ok "═══ STATISTICS SUMMARY ═══"
    log_info "  Total Streams : ${total_streams}"
    log_info "  Total Hours   : ${total_hours}h"
    log_info "  Total GB      : ${total_gb} GB"
    log_info "  Avg Duration  : ${avg_duration}h"
    
    # ── Update Last Video ID (for duplicate detection) ───────────────────────
    if [[ -n "${STREAM_VIDEO_ID:-}" ]]; then
        github_api_write "last_video_id.txt" "$STREAM_VIDEO_ID" "📝 Record last video ID: ${STREAM_VIDEO_ID}" >/dev/null 2>&1 || true
    fi

    # ── Update dashboard feed (data/recordings.json) ───────────────────────
    update_recordings_json || true
    
    return 0
}

update_recordings_json() {
    local vid="${STREAM_VIDEO_ID:-}"
    [[ -z "$vid" ]] && return 0
    local expected="${CHANNEL_DISPLAY_NAME:-${RECORDER_NAME:-The Muslim Lantern}}"
    if [[ -n "${STREAM_CHANNEL:-}" ]] && [[ "${STREAM_CHANNEL}" != *"Muslim Lantern"* ]]; then
        log_warn "Skipping recordings.json — not ${expected}"
        return 0
    fi

    log_step "Updating data/recordings.json for dashboard..."

    local gofile_link="" pixeldrain_link="" archive_link="" mega_link=""
    if [[ -n "${GOFILE_LINKS:-}" ]]; then
        gofile_link=$(echo "${GOFILE_LINKS}" | tr ';' '\n' | head -1 | cut -d'|' -f2)
    fi
    if [[ -n "${PIXELDRAIN_LINKS:-}" ]]; then
        pixeldrain_link=$(echo "${PIXELDRAIN_LINKS}" | tr ';' '\n' | head -1 | cut -d'|' -f2)
    fi
    if [[ -n "${ARCHIVE_LINKS:-}" ]]; then
        archive_link=$(echo "${ARCHIVE_LINKS}" | tr ';' '\n' | head -1 | cut -d'|' -f2)
    fi
    if [[ -n "${MEGA_LINKS:-}" ]]; then
        mega_link=$(echo "${MEGA_LINKS}" | tr ';' '\n' | head -1 | cut -d'|' -f2)
    fi

    local existing
    existing=$(github_api_read_content "data/recordings.json" 2>/dev/null) || existing='[]'
    [[ -z "$existing" || "$existing" != "["* ]] && existing='[]'

    local month
    month=$(TZ='Asia/Karachi' date '+%Y-%m')
    local entry
    entry=$(jq -n \
        --arg video_id "$vid" \
        --arg title "${STREAM_TITLE:-Unknown}" \
        --arg channel "${CHANNEL_DISPLAY_NAME:-${RECORDER_NAME:-The Muslim Lantern}}" \
        --arg video_url "${STREAM_URL:-}" \
        --arg thumbnail "${THUMBNAIL_CLOUD_URL:-${STREAM_THUMBNAIL:-}}" \
        --arg thumbnail_mega "${THUMBNAIL_MEGA_URL:-}" \
        --arg duration_sec "${RECORD_DURATION_SEC:-0}" \
        --arg duration_fmt "${RECORD_DURATION_FMT:-00:00:00}" \
        --arg size_bytes "${RECORD_SIZE_BYTES:-0}" \
        --arg size_human "${RECORD_SIZE_HUMAN:-0 B}" \
        --arg size_gb "${RECORD_SIZE_GB:-0}" \
        --arg resolution "${RECORD_RESOLUTION:-N/A}" \
        --arg date "$(TZ='Asia/Karachi' date '+%Y-%m-%d')" \
        --arg month "$month" \
        --arg gofile_link "$gofile_link" \
        --arg pixeldrain_link "$pixeldrain_link" \
        --arg archive_link "$archive_link" \
        --arg mega_link "$mega_link" \
        --arg recorded_at "$(now_utc_iso)" \
        '{
            video_id: $video_id,
            title: $title,
            channel: $channel,
            video_url: $video_url,
            thumbnail: $thumbnail,
            thumbnail_mega: $thumbnail_mega,
            duration_sec: ($duration_sec | tonumber? // 0),
            duration_fmt: $duration_fmt,
            size_bytes: ($size_bytes | tonumber? // 0),
            size_human: $size_human,
            size_gb: ($size_gb | tonumber? // 0),
            resolution: $resolution,
            date: $date,
            month: $month,
            gofile_link: $gofile_link,
            pixeldrain_link: $pixeldrain_link,
            archive_link: $archive_link,
            mega_link: $mega_link,
            chat_url: "",
            recorded_at: $recorded_at
        }')

    local merged
    merged=$(echo "$existing" | jq --argjson e "$entry" '
        [$e] + .
        | reduce .[] as $item ([];
            if any(.[]; .video_id == $item.video_id) then . else . + [$item] end
          )
    ' 2>/dev/null) || merged="[$entry]"
    github_api_write "data/recordings.json" "$merged" "📊 Dashboard: ${STREAM_TITLE:-recording}" >/dev/null 2>&1 || true
}

# ═══════════════════════════════════════════════════════════════════════════════
#  READ STATISTICS (used by weekly report)
# ═══════════════════════════════════════════════════════════════════════════════

read_stats() {
    local stats_content
    stats_content=$(github_api_read_content "stats.json" 2>/dev/null) || {
        echo '{"total_streams":0,"total_hours":0,"total_gb":0,"avg_duration_hours":0}'
        return 1
    }
    echo "$stats_content"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  UPLOAD CHAT FILE TO GITHUB PAGES
#  Saves chat.json to data/chats/{video_id}.json so the dashboard can load it
# ═══════════════════════════════════════════════════════════════════════════════



# ═══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    update_stats
fi
