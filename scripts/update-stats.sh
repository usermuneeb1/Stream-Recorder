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
    local size_gb
    size_gb=$(echo "scale=4; $size_bytes / 1073741824" | bc)
    
    log_info "New recording data:"
    log_info "  Duration : $(format_duration "$duration_sec") (${duration_hours}h)"
    log_info "  Size     : $(format_size "$size_bytes") (${size_gb} GB)"
    log_info "  Title    : ${stream_title}"
    
    # ── Read existing stats ──────────────────────────────────────────────────
    log_step "Reading existing stats.json..."
    
    local existing_stats
    existing_stats=$(github_api_read_content "stats.json" 2>/dev/null) || existing_stats=""
    
    local total_streams=0 total_hours=0 total_gb=0 avg_duration=0
    
    if [[ -n "$existing_stats" ]]; then
        total_streams=$(echo "$existing_stats" | jq -r '.total_streams // 0' 2>/dev/null)
        total_hours=$(echo "$existing_stats" | jq -r '.total_hours // 0' 2>/dev/null)
        total_gb=$(echo "$existing_stats" | jq -r '.total_gb // 0' 2>/dev/null)
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
    
    log_info "Updated: ${total_streams} streams, ${total_hours}h, ${total_gb} GB, avg ${avg_duration}h"
    
    # ── Build new stats JSON ─────────────────────────────────────────────────
    local esc_title esc_channel esc_date
    esc_title=$(json_escape "$stream_title")
    esc_channel=$(json_escape "$stream_channel")
    esc_date=$(json_escape "$current_date")
    
    local new_stats
    new_stats=$(jq -n \
        --argjson total_streams "$total_streams" \
        --arg total_hours "$total_hours" \
        --arg total_gb "$total_gb" \
        --arg avg_duration_hours "$avg_duration" \
        --arg last_title "$stream_title" \
        --arg last_channel "$stream_channel" \
        --arg last_date "$current_date" \
        --arg last_duration "$(format_duration "$duration_sec")" \
        --arg last_size_gb "$size_gb" \
        --arg updated_at "$(now_utc_iso)" \
        '{
            total_streams: $total_streams,
            total_hours: ($total_hours | tonumber),
            total_gb: ($total_gb | tonumber),
            avg_duration_hours: ($avg_duration_hours | tonumber),
            last_stream: {
                title: $last_title,
                channel: $last_channel,
                date: $last_date,
                duration: $last_duration,
                size_gb: ($last_size_gb | tonumber)
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
    
    return 0
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
#  UPDATE RECORDINGS.JSON (for web dashboard)
#  Appends the current recording to the recordings array
# ═══════════════════════════════════════════════════════════════════════════════

update_recordings_json() {
    log_step "Updating recordings.json for web dashboard..."
    
    local video_id="${STREAM_VIDEO_ID:-}"
    local title="${STREAM_TITLE:-Unknown Stream}"
    local channel="${STREAM_CHANNEL:-Unknown Channel}"
    local video_url="${STREAM_URL:-}"
    local thumbnail="${STREAM_THUMBNAIL:-}"
    local duration_sec="${RECORD_DURATION_SEC:-0}"
    local duration_fmt="${RECORD_DURATION_FMT:-00:00:00}"
    local size_bytes="${RECORD_SIZE_BYTES:-0}"
    local size_human="${RECORD_SIZE_HUMAN:-0 B}"
    local size_gb="${RECORD_SIZE_GB:-0.00}"
    local resolution="${RECORD_RESOLUTION:-N/A}"
    local record_date
    record_date=$(TZ='Asia/Karachi' date '+%Y-%m-%d')
    local month_folder
    month_folder=$(TZ='Asia/Karachi' date '+%Y-%m')
    
    # Build download links (env vars are semicolon-delimited: "PartName|url;PartName|url")
    local gofile_link="" pixeldrain_link="" archive_link=""
    if [[ -n "${GOFILE_LINKS:-}" ]]; then
        gofile_link=$(echo "$GOFILE_LINKS" | cut -d';' -f1 | cut -d'|' -f2)
    fi
    if [[ -n "${PIXELDRAIN_LINKS:-}" ]]; then
        pixeldrain_link=$(echo "$PIXELDRAIN_LINKS" | cut -d';' -f1 | cut -d'|' -f2)
    fi
    if [[ -n "${ARCHIVE_LINKS:-}" ]]; then
        archive_link=$(echo "$ARCHIVE_LINKS" | cut -d';' -f1 | cut -d'|' -f2)
    fi
    
    # If no thumbnail from stream, use YouTube default
    if [[ -z "$thumbnail" ]] && [[ -n "$video_id" ]]; then
        thumbnail="https://i.ytimg.com/vi/${video_id}/maxresdefault.jpg"
    fi
    
    # Build new recording entry
    local new_entry
    new_entry=$(jq -n \
        --arg video_id "$video_id" \
        --arg title "$title" \
        --arg channel "$channel" \
        --arg video_url "$video_url" \
        --arg thumbnail "$thumbnail" \
        --argjson duration_sec "$duration_sec" \
        --arg duration_fmt "$duration_fmt" \
        --argjson size_bytes "$size_bytes" \
        --arg size_human "$size_human" \
        --arg size_gb "$size_gb" \
        --arg resolution "$resolution" \
        --arg date "$record_date" \
        --arg month "$month_folder" \
        --arg gofile_link "$gofile_link" \
        --arg pixeldrain_link "$pixeldrain_link" \
        --arg archive_link "$archive_link" \
        --arg chat_url "${RECORD_CHAT_URL:-}" \
        --arg recorded_at "$(now_utc_iso)" \
        '{
            video_id: $video_id,
            title: $title,
            channel: $channel,
            video_url: $video_url,
            thumbnail: $thumbnail,
            duration_sec: $duration_sec,
            duration_fmt: $duration_fmt,
            size_bytes: $size_bytes,
            size_human: $size_human,
            size_gb: ($size_gb | tonumber),
            resolution: $resolution,
            date: $date,
            month: $month,
            gofile_link: $gofile_link,
            pixeldrain_link: $pixeldrain_link,
            archive_link: $archive_link,
            chat_url: $chat_url,
            recorded_at: $recorded_at
        }')
    
    # Read existing recordings
    local existing
    existing=$(github_api_read_content "data/recordings.json" 2>/dev/null) || existing="[]"
    
    # Ensure it's valid JSON array
    if ! echo "$existing" | jq -e 'type == "array"' >/dev/null 2>&1; then
        existing="[]"
    fi
    
    # Prepend new entry (newest first)
    local updated
    updated=$(echo "$existing" | jq --argjson entry "$new_entry" '[$entry] + .')
    
    if github_api_write "data/recordings.json" "$updated" "📹 Add recording: ${title}"; then
        log_ok "recordings.json updated — dashboard will show this recording"
    else
        log_warn "Failed to update recordings.json — dashboard won't show this recording"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    update_stats
    update_recordings_json || true
fi
