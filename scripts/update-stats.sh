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
    # Normalize bc output — bc omits leading zero (.13 → 0.13) which breaks jq tonumber
    [[ "$total_hours"   == .* ]] && total_hours="0${total_hours}"
    [[ "$total_gb"      == .* ]] && total_gb="0${total_gb}"
    [[ "$avg_duration"  == .* ]] && avg_duration="0${avg_duration}"
    [[ "$size_gb"       == .* ]] && size_gb="0${size_gb}"
    
    log_info "Updated: ${total_streams} streams, ${total_hours}h, ${total_gb} GB, avg ${avg_duration}h"
    
    # ── Build new stats JSON ─────────────────────────────────────────────────
    local esc_title esc_channel esc_date
    esc_title=$(json_escape "$stream_title")
    esc_channel=$(json_escape "$stream_channel")
    esc_date=$(json_escape "$current_date")
    
    local new_stats
    new_stats=$(jq -n \
        --arg total_streams      "$total_streams" \
        --arg total_hours        "$total_hours" \
        --arg total_gb           "$total_gb" \
        --arg avg_duration_hours "$avg_duration" \
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
#  UPLOAD CHAT FILE TO GITHUB PAGES
#  Saves chat.json to data/chats/{video_id}.json so the dashboard can load it
# ═══════════════════════════════════════════════════════════════════════════════



# ═══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    update_stats
fi
