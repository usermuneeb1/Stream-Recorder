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
    log_header "📊 UPDATING STATISTICS (drift-proof: recomputed from recordings.json)"

    local duration_sec="${RECORD_DURATION_SEC:-0}"
    local size_bytes="${RECORD_SIZE_BYTES:-0}"
    local stream_title="${STREAM_TITLE:-Unknown Stream}"
    local stream_channel="${STREAM_CHANNEL:-Unknown Channel}"

    log_info "New recording data:"
    log_info "  Duration : $(format_duration "$duration_sec")"
    log_info "  Size     : $(format_size "$size_bytes")"
    log_info "  Title    : ${stream_title}"

    # ── 1. Build this run's entry (canonical schema) ─────────────────────────
    local vid="${STREAM_VIDEO_ID:-}"
    local gofile_link="" pixeldrain_link="" archive_link="" mega_link="" archive_id=""
    if [[ -n "${GOFILE_LINKS:-}" ]]; then
        gofile_link=$(echo "${GOFILE_LINKS}" | tr ';' '\n' | head -1 | cut -d'|' -f2)
    fi
    if [[ -n "${PIXELDRAIN_LINKS:-}" ]]; then
        pixeldrain_link=$(echo "${PIXELDRAIN_LINKS}" | tr ';' '\n' | head -1 | cut -d'|' -f2)
    fi
    if [[ -n "${ARCHIVE_LINKS:-}" ]]; then
        archive_link=$(echo "${ARCHIVE_LINKS}" | tr ';' '\n' | head -1 | cut -d'|' -f2)
        archive_id=$(echo "${ARCHIVE_LINKS}" | tr ';' '\n' | head -1 | cut -d'|' -f3)
    fi
    if [[ -n "${MEGA_LINKS:-}" ]]; then
        mega_link=$(echo "${MEGA_LINKS}" | tr ';' '\n' | head -1 | cut -d'|' -f2)
    fi

    local entry
    entry=$(jq -n \
        --arg video_id "$vid" \
        --arg title "${STREAM_TITLE:-Unknown}" \
        --arg channel "${CHANNEL_DISPLAY_NAME:-${RECORDER_NAME:-The Muslim Lantern}}" \
        --arg video_url "${STREAM_URL:-}" \
        --arg thumbnail "${THUMBNAIL_CLOUD_URL:-${STREAM_THUMBNAIL:-}}" \
        --arg thumbnail_mega "${THUMBNAIL_MEGA_URL:-}" \
        --argjson duration_sec "$((${duration_sec:-0}))" \
        --arg duration_fmt "${RECORD_DURATION_FMT:-00:00:00}" \
        --argjson size_bytes "$((${size_bytes:-0}))" \
        --arg size_human "${RECORD_SIZE_HUMAN:-0 B}" \
        --argjson size_gb "${RECORD_SIZE_GB:-0}" \
        --arg resolution "${RECORD_RESOLUTION:-N/A}" \
        --arg date "$(TZ='Asia/Karachi' date '+%Y-%m-%d')" \
        --arg month "$(TZ='Asia/Karachi' date '+%Y-%m')" \
        --arg gofile_link "$gofile_link" \
        --arg pixeldrain_link "$pixeldrain_link" \
        --arg archive_link "$archive_link" \
        --arg archive_id "$archive_id" \
        --arg mega_link "$mega_link" \
        --arg chat_url "${RECORD_CHAT_URL:-}" \
        --arg recorded_at "$(now_utc_iso)" \
        '{
            video_id: $video_id,
            title: $title,
            channel: $channel,
            video_url: $video_url,
            thumbnail: $thumbnail,
            thumbnail_mega: $thumbnail_mega,
            duration_sec: $duration_sec,
            duration_fmt: $duration_fmt,
            size_bytes: $size_bytes,
            size_human: $size_human,
            size_gb: $size_gb,
            resolution: $resolution,
            date: $date,
            month: $month,
            archive_link: $archive_link,
            archive_id: $archive_id,
            gofile_link: $gofile_link,
            pixeldrain_link: $pixeldrain_link,
            mega_link: $mega_link,
            chat_url: $chat_url,
            recorded_at: $recorded_at
        }')

    # ── 2. Upsert into data/recordings.json (field-level merge, never drops ──
    #       telegram_link / cf_stream / chapters / storyboard on re-records) ──
    log_step "Upserting entry into data/recordings.json..."
    local current
    current=$(github_api_read_content "data/recordings.json" 2>/dev/null) || current=""
    [[ -z "$current" || "$current" != "["* ]] && current='[]'
    echo "$current" | jq -e 'type=="array"' >/dev/null 2>&1 || current='[]'

    local merged
    merged=$(echo "$current" | jq --argjson e "$entry" '
        ($e | with_entries(select(.value != "" and .value != null))) as $clean
        | [ .[] | if .video_id == $clean.video_id then . * $clean else . end ] as $upserted
        | if any($upserted[]; .video_id == $clean.video_id)
          then $upserted
          else [$e] + $upserted
          end
        | sort_by(.date) | reverse
    ' 2>/dev/null) || merged="[$entry]"

    if github_api_write "data/recordings.json" "$merged" "📊 Dashboard: ${stream_title}"; then
        log_ok "recordings.json updated (upsert by video_id)"
    else
        log_warn "Failed to update recordings.json via API — will use local merged list"
    fi

    # ── 3. Recompute stats.json FROM the canonical list (no drift possible) ──
    log_step "Recomputing stats.json from recordings.json..."
    local new_stats
    new_stats=$(echo "$merged" | jq --arg now "$(now_utc_iso)" '
        {
            total_streams: length,
            total_hours: ([.[].duration_sec // 0] | add / 3600 | . * 100 | round / 100),
            total_gb: ([.[].size_bytes // 0] | add / 1073741824 | . * 100 | round / 100),
            avg_duration_hours: (if length > 0 then ([.[].duration_sec // 0] | add / 3600 / length | . * 100 | round / 100) else 0 end),
            sources: {
                archive: ([.[] | select((.archive_link // "") | startswith("http"))] | length),
                mega: ([.[] | select((.mega_link // "") | startswith("http"))] | length),
                pixel: ([.[] | select((.pixeldrain_link // "") | startswith("http"))] | length),
                gofile: ([.[] | select((.gofile_link // "") | startswith("http"))] | length)
            },
            last_stream: (.[0] | {
                title: .title,
                channel: .channel,
                date: .date,
                duration: .duration_fmt,
                size_gb: (.size_gb // 0)
            }),
            updated_at: $now
        }') || { log_error "jq failed to recompute stats"; return 1; }

    if github_api_write "stats.json" "$new_stats" "📊 Stats recomputed: $(echo "$new_stats" | jq -r '.total_streams') streams, $(echo "$new_stats" | jq -r '.total_hours')h, $(echo "$new_stats" | jq -r '.total_gb') GB"; then
        log_ok "Statistics recomputed successfully"
    else
        log_error "Failed to update stats.json"
        return 1
    fi

    local total_streams total_hours total_gb avg_duration
    total_streams=$(echo "$new_stats" | jq -r '.total_streams // 0')
    total_hours=$(echo "$new_stats" | jq -r '.total_hours // 0')
    total_gb=$(echo "$new_stats" | jq -r '.total_gb // 0')
    avg_duration=$(echo "$new_stats" | jq -r '.avg_duration_hours // 0')

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
    if [[ -n "$vid" ]]; then
        github_api_write "last_video_id.txt" "$vid" "📝 Record last video ID: ${vid}" >/dev/null 2>&1 || true
    fi

    return 0
}

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
