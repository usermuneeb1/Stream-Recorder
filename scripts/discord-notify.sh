#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  📡 STREAM RECORDER — PREMIUM DISCORD NOTIFICATION SYSTEM v2.1             ║
# ║  7 notification types with rich, professional embeds:                       ║
# ║    1. 🔴 LIVE DETECTED         → ALERTS channel                           ║
# ║    2. ✅ RECORDING COMPLETE     → LINKS channel                            ║
# ║    3. ❌ RECORDING FAILED       → ALERTS channel                           ║
# ║    4. 📊 WEEKLY SUMMARY         → REPORTS channel                          ║
# ║    5. 🔄 LINKS REFRESHED        → REPORTS channel                          ║
# ║    6. 🟢 SYSTEM HEALTH          → REPORTS channel                          ║
# ║    7. 🍪 COOKIE WARNING         → ALERTS channel                           ║
# ║                                                                            ║
# ║  MULTI-WEBHOOK: Alerts, Links, and Reports go to DIFFERENT Discord         ║
# ║  channels. Falls back to main webhook if specific one isn't set.           ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

# ═══════════════════════════════════════════════════════════════════════════════
#  WEBHOOK ROUTING — Different channels for different notification types
#
#  DISCORD_WEBHOOK_ALERTS  → Live detected, recording failed, cookie warnings
#  DISCORD_WEBHOOK_LINKS   → Recording complete with download links
#  DISCORD_WEBHOOK_REPORTS → Weekly summary, link refresh, system health
#  DISCORD_WEBHOOK_URL     → Fallback for all (if specific is not set)
# ═══════════════════════════════════════════════════════════════════════════════

get_webhook_url() {
    local type="$1"  # "alerts", "links", or "reports"
    
    case "$type" in
        alerts)
            echo "${DISCORD_WEBHOOK_ALERTS:-${DISCORD_WEBHOOK_URL:-}}"
            ;;
        links)
            echo "${DISCORD_WEBHOOK_LINKS:-${DISCORD_WEBHOOK_URL:-}}"
            ;;
        reports)
            echo "${DISCORD_WEBHOOK_REPORTS:-${DISCORD_WEBHOOK_URL:-}}"
            ;;
        *)
            echo "${DISCORD_WEBHOOK_URL:-}"
            ;;
    esac
}

# ═══════════════════════════════════════════════════════════════════════════════
#  CORE WEBHOOK SENDER (with routing support)
# ═══════════════════════════════════════════════════════════════════════════════

send_discord_webhook() {
    local payload="$1"
    local channel_type="${2:-default}"  # alerts, links, reports, or default
    local webhook_url
    webhook_url=$(get_webhook_url "$channel_type")
    
    if [[ -z "$webhook_url" ]]; then
        log_error "No Discord webhook URL set for '${channel_type}' — cannot send notification"
        return 1
    fi
    
    log_debug "Sending to ${channel_type} channel..."
    
    local http_code
    http_code=$(curl -s -o /dev/null -w '%{http_code}' \
        --max-time 30 \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "$webhook_url" 2>/dev/null)
    
    if [[ "$http_code" =~ ^2[0-9]{2}$ ]]; then
        log_ok "Discord notification sent to [${channel_type}] (HTTP ${http_code})"
        return 0
    elif [[ "$http_code" == "429" ]]; then
        log_warn "Discord rate limited — waiting 5s and retrying..."
        sleep 5
        http_code=$(curl -s -o /dev/null -w '%{http_code}' \
            --max-time 30 \
            -H "Content-Type: application/json" \
            -d "$payload" \
            "$webhook_url" 2>/dev/null)
        if [[ "$http_code" =~ ^2[0-9]{2}$ ]]; then
            log_ok "Discord notification sent on retry (HTTP ${http_code})"
            return 0
        fi
    fi
    
    log_error "Discord notification failed (HTTP ${http_code})"
    return 1
}

# ═══════════════════════════════════════════════════════════════════════════════
#  NOTIFICATION 1: 🔴 LIVE STREAM DETECTED
#  Sent immediately when a live stream is found
# ═══════════════════════════════════════════════════════════════════════════════

notify_live_detected() {
    log_step "Sending LIVE DETECTED notification..."
    
    local title="${STREAM_TITLE:-Live Stream}"
    local channel="${STREAM_CHANNEL:-Unknown Channel}"
    local video_url="${STREAM_URL:-}"
    local thumbnail="${STREAM_THUMBNAIL:-}"
    local method="${STREAM_DETECTION_METHOD:-Unknown}"
    local detect_time="${STREAM_DETECTION_TIME:-$(now_pkt)}"
    local avatar="${AVATAR_URL:-}"
    local cookie_status="${COOKIE_STATUS:-unknown}"
    local disk_space
    disk_space=$(get_disk_space_gb 2>/dev/null || echo "N/A")
    local timestamp
    timestamp=$(now_utc_iso)
    
    local esc_title esc_channel esc_method
    esc_title=$(json_escape "$title")
    esc_channel=$(json_escape "$channel")
    esc_method=$(json_escape "$method")
    
    # Cookie status indicator
    local cookie_indicator="✅ Valid"
    [[ "$cookie_status" == "expired" ]] && cookie_indicator="⚠️ Expired"
    [[ "$cookie_status" == "no_cookies" ]] && cookie_indicator="❌ None"
    [[ "$cookie_status" == "check_failed" ]] && cookie_indicator="❓ Unknown"
    
    local payload
    payload=$(cat <<PAYLOAD
{
    "username": "${BOT_USERNAME:-📡 Stream Recorder}",
    "avatar_url": "${avatar}",
    "embeds": [
        {
            "title": "🔴  LIVE STREAM DETECTED",
            "description": "> **${esc_title}**\\n\\n🎥 Recording has been **initiated automatically**. The system is capturing the stream using the multi-method recording engine.",
            "color": ${COLOR_LIVE_DETECTED:-15736129},
            "thumbnail": {
                "url": "${thumbnail}"
            },
            "fields": [
                {
                    "name": "📺  Channel",
                    "value": "**${esc_channel}**",
                    "inline": true
                },
                {
                    "name": "🔍  Method",
                    "value": "\`${esc_method}\`",
                    "inline": true
                },
                {
                    "name": "🕐  Detected",
                    "value": "\`${detect_time}\`",
                    "inline": true
                },
                {
                    "name": "\\u200B",
                    "value": "**[▶️ Watch Live on YouTube](${video_url})**",
                    "inline": false
                },
                {
                    "name": "🍪  Cookies",
                    "value": "${cookie_indicator}",
                    "inline": true
                },
                {
                    "name": "💾  Disk",
                    "value": "\`${disk_space} GB\` free",
                    "inline": true
                },
                {
                    "name": "🛡️  Status",
                    "value": "🟢 Recording...",
                    "inline": true
                }
            ],
            "author": {
                "name": "${esc_channel} is LIVE",
                "url": "${video_url}",
                "icon_url": "${avatar}"
            },
            "footer": {
                "text": "📡 Stream Recorder v${RECORDER_VERSION:-2.1.0} • Recording in progress...",
                "icon_url": "${avatar}"
            },
            "timestamp": "${timestamp}"
        }
    ]
}
PAYLOAD
)
    
    send_discord_webhook "$payload" "alerts"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  NOTIFICATION 2: ✅ RECORDING COMPLETE
#  Sent when recording, processing, and uploading are all done
#  The most detailed notification — includes ALL download links
# ═══════════════════════════════════════════════════════════════════════════════

notify_recording_complete() {
    log_step "Sending RECORDING COMPLETE notification..."
    
    local title="${STREAM_TITLE:-Live Stream}"
    local channel="${STREAM_CHANNEL:-Unknown Channel}"
    local video_url="${STREAM_URL:-}"
    local thumbnail="${STREAM_THUMBNAIL:-}"
    local avatar="${AVATAR_URL:-}"
    local timestamp
    timestamp=$(now_utc_iso)
    
    # Recording details
    local duration_fmt="${RECORD_DURATION_FMT:-00:00:00}"
    local duration_sec="${RECORD_DURATION_SEC:-0}"
    local size_human="${RECORD_SIZE_HUMAN:-0 B}"
    local size_gb="${RECORD_SIZE_GB:-0.00}"
    local resolution="${RECORD_RESOLUTION:-N/A}"
    local parts="${RECORD_PARTS:-1}"
    local process_time="${PROCESSING_TIME_FMT:-N/A}"
    local upload_time="${UPLOAD_TIME_FMT:-N/A}"
    
    # Upload results
    local upload_count="${UPLOAD_SUCCESS_COUNT:-0}"
    local upload_total="${UPLOAD_TOTAL_SERVICES:-3}"
    
    # Times
    local start_time="${STREAM_DETECTION_TIME:-N/A}"
    local end_time="${STREAM_END_TIME:-$(now_pkt)}"
    
    # Determine color based on upload status
    local embed_color
    if (( upload_count == upload_total )); then
        embed_color=${COLOR_COMPLETE_SUCCESS:-5763757}
    elif (( upload_count > 0 )); then
        embed_color=${COLOR_COMPLETE_PARTIAL:-16761095}
    else
        embed_color=${COLOR_COMPLETE_FAILED:-15158332}
    fi
    
    # Upload status emoji
    local upload_emoji
    if (( upload_count == upload_total )); then
        upload_emoji="✅"
    elif (( upload_count > 0 )); then
        upload_emoji="⚠️"
    else
        upload_emoji="❌"
    fi
    
    # Build Gofile links section
    local gofile_section="*No links available*"
    if [[ -n "${GOFILE_LINKS:-}" ]]; then
        gofile_section=""
        IFS=';' read -ra g_entries <<< "$GOFILE_LINKS"
        for entry in "${g_entries[@]}"; do
            local g_part g_link
            g_part=$(echo "$entry" | cut -d'|' -f1)
            g_link=$(echo "$entry" | cut -d'|' -f2)
            if [[ -n "$g_link" ]]; then
                gofile_section+="[📥 Download ${g_part}](${g_link})\\n"
            fi
        done
    fi
    
    # Build Pixeldrain links section
    local pixeldrain_section="*No links available*"
    if [[ -n "${PIXELDRAIN_LINKS:-}" ]]; then
        pixeldrain_section=""
        IFS=';' read -ra p_entries <<< "$PIXELDRAIN_LINKS"
        for entry in "${p_entries[@]}"; do
            local p_part p_link
            p_part=$(echo "$entry" | cut -d'|' -f1)
            p_link=$(echo "$entry" | cut -d'|' -f2)
            if [[ -n "$p_link" ]]; then
                pixeldrain_section+="[📥 Download ${p_part}](${p_link})\\n"
            fi
        done
    fi
    
    # Build Archive.org links section
    local archive_section="*No links available*"
    if [[ -n "${ARCHIVE_LINKS:-}" ]]; then
        archive_section=""
        IFS=';' read -ra a_entries <<< "$ARCHIVE_LINKS"
        for entry in "${a_entries[@]}"; do
            local a_part a_link
            a_part=$(echo "$entry" | cut -d'|' -f1)
            a_link=$(echo "$entry" | cut -d'|' -f2)
            if [[ -n "$a_link" ]]; then
                archive_section+="[📥 ${a_part} — Permanent Archive](${a_link})\\n"
            fi
        done
        archive_section+="*☝️ These links never expire*"
    fi
    
    local esc_title esc_channel
    esc_title=$(json_escape "$title")
    esc_channel=$(json_escape "$channel")
    
    local payload
    payload=$(cat <<PAYLOAD
{
    "username": "${BOT_USERNAME:-📡 Stream Recorder}",
    "avatar_url": "${avatar}",
    "embeds": [
        {
            "title": "✅  RECORDING COMPLETE",
            "description": "The live stream has been **successfully recorded**, processed, and uploaded to cloud storage.\\n\\n> **${esc_title}**",
            "color": ${embed_color},
            "thumbnail": {
                "url": "${thumbnail}"
            },
            "fields": [
                {
                    "name": "👤  Channel",
                    "value": "${esc_channel}",
                    "inline": true
                },
                {
                    "name": "⏱️  Duration",
                    "value": "\`${duration_fmt}\`",
                    "inline": true
                },
                {
                    "name": "💾  File Size",
                    "value": "\`${size_human}\`",
                    "inline": true
                },
                {
                    "name": "📐  Resolution",
                    "value": "\`${resolution}\`",
                    "inline": true
                },
                {
                    "name": "📦  Parts",
                    "value": "\`${parts}\` part(s)",
                    "inline": true
                },
                {
                    "name": "☁️  Uploads",
                    "value": "${upload_emoji} \`${upload_count}/${upload_total}\`",
                    "inline": true
                },
                {
                    "name": "🕐  Start Time",
                    "value": "\`${start_time}\`",
                    "inline": true
                },
                {
                    "name": "🕐  End Time",
                    "value": "\`${end_time}\`",
                    "inline": true
                },
                {
                    "name": "⚙️  Processing",
                    "value": "\`${process_time}\`",
                    "inline": true
                },
                {
                    "name": "🔗  YouTube",
                    "value": "**[▶️ Watch Original](${video_url})**",
                    "inline": false
                }
            ],
            "author": {
                "name": "${RECORDER_NAME:-Muneeb Ahmad} • Stream Recorder",
                "icon_url": "${avatar}"
            },
            "footer": {
                "text": "📡 Stream Recorder v${RECORDER_VERSION:-2.0.0} • © ${RECORDER_NAME:-Muneeb Ahmad} • Upload: ${upload_count}/${upload_total}",
                "icon_url": "${avatar}"
            },
            "timestamp": "${timestamp}"
        },
        {
            "title": "📥  Download Links",
            "description": "Click any link below to download the recording. Multiple mirrors provided for reliability.",
            "color": ${embed_color},
            "fields": [
                {
                    "name": "🟢  Gofile — Fast Download",
                    "value": "${gofile_section}",
                    "inline": false
                },
                {
                    "name": "🔵  Pixeldrain — Reliable Mirror",
                    "value": "${pixeldrain_section}",
                    "inline": false
                },
                {
                    "name": "🏛️  Archive.org — Permanent Storage",
                    "value": "${archive_section}",
                    "inline": false
                }
            ],
            "footer": {
                "text": "⏱️ Upload took ${upload_time} • 📡 Stream Recorder v${RECORDER_VERSION:-2.0.0}",
                "icon_url": "${avatar}"
            },
            "timestamp": "${timestamp}"
        }
    ]
}
PAYLOAD
)
    
    send_discord_webhook "$payload" "links"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  NOTIFICATION 3: ❌ RECORDING FAILED
#  Sent when all recording methods fail
# ═══════════════════════════════════════════════════════════════════════════════

notify_recording_failed() {
    log_step "Sending RECORDING FAILED notification..."
    
    local title="${STREAM_TITLE:-Live Stream}"
    local channel="${STREAM_CHANNEL:-Unknown Channel}"
    local video_url="${STREAM_URL:-}"
    local thumbnail="${STREAM_THUMBNAIL:-}"
    local avatar="${AVATAR_URL:-}"
    local error_msg="${1:-All recording methods exhausted}"
    local retry_info="${2:-Auto-retry triggered in 2 minutes}"
    local timestamp
    timestamp=$(now_utc_iso)
    local current_time
    current_time=$(now_pkt)
    
    local esc_title esc_channel esc_error
    esc_title=$(json_escape "$title")
    esc_channel=$(json_escape "$channel")
    esc_error=$(json_escape "$error_msg")
    
    local payload
    payload=$(cat <<PAYLOAD
{
    "username": "${BOT_USERNAME:-📡 Stream Recorder}",
    "avatar_url": "${avatar}",
    "embeds": [
        {
            "title": "❌  RECORDING FAILED",
            "description": "The recording engine has **exhausted all available methods**. The system will automatically retry.\\n\\n> ⚠️ ${esc_error}",
            "color": ${COLOR_FAILED:-15158332},
            "thumbnail": {
                "url": "${thumbnail}"
            },
            "fields": [
                {
                    "name": "📺  Stream",
                    "value": "[${esc_title}](${video_url})",
                    "inline": false
                },
                {
                    "name": "👤  Channel",
                    "value": "${esc_channel}",
                    "inline": true
                },
                {
                    "name": "🕐  Failed At",
                    "value": "\`${current_time}\`",
                    "inline": true
                },
                {
                    "name": "🔄  Auto-Retry",
                    "value": "${retry_info}",
                    "inline": true
                },
                {
                    "name": "📋  Error Details",
                    "value": "\`\`\`\\n${esc_error}\\n\`\`\`",
                    "inline": false
                },
                {
                    "name": "ℹ️  What Happens Next?",
                    "value": "The system will **automatically retry** the recording workflow in 2 minutes. If the stream is still live, it will attempt all 6 recording methods again (5 attempts × 6 methods = 30 chances).",
                    "inline": false
                }
            ],
            "author": {
                "name": "${RECORDER_NAME:-Muneeb Ahmad} • Stream Recorder",
                "icon_url": "${avatar}"
            },
            "footer": {
                "text": "📡 Stream Recorder v${RECORDER_VERSION:-2.0.0} • © ${RECORDER_NAME:-Muneeb Ahmad} • AUTO-RETRY TRIGGERED",
                "icon_url": "${avatar}"
            },
            "timestamp": "${timestamp}"
        }
    ]
}
PAYLOAD
)
    
    send_discord_webhook "$payload" "alerts"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  NOTIFICATION 4: 📊 WEEKLY SUMMARY
#  Detailed weekly analytics with per-stream breakdown
# ═══════════════════════════════════════════════════════════════════════════════

notify_weekly_summary() {
    log_step "Sending WEEKLY SUMMARY notification..."
    
    local avatar="${AVATAR_URL:-}"
    local timestamp
    timestamp=$(now_utc_iso)
    
    # These should be set by the weekly-report.sh script
    local total_streams="${WEEKLY_TOTAL_STREAMS:-0}"
    local total_hours="${WEEKLY_TOTAL_HOURS:-0}"
    local total_gb="${WEEKLY_TOTAL_GB:-0}"
    local avg_duration="${WEEKLY_AVG_DURATION:-0}"
    local streams_list="${WEEKLY_STREAMS_LIST:-No streams recorded this week.}"
    local lifetime_streams="${LIFETIME_TOTAL_STREAMS:-0}"
    local lifetime_hours="${LIFETIME_TOTAL_HOURS:-0}"
    local lifetime_gb="${LIFETIME_TOTAL_GB:-0}"
    
    local week_start week_end
    week_start=$(TZ='Asia/Karachi' date -d 'last monday' '+%b %d' 2>/dev/null || date '+%b %d')
    week_end=$(TZ='Asia/Karachi' date '+%b %d, %Y')
    
    local esc_list
    esc_list=$(json_escape "$streams_list")
    
    local payload
    payload=$(cat <<PAYLOAD
{
    "username": "${BOT_USERNAME:-📡 Stream Recorder}",
    "avatar_url": "${avatar}",
    "embeds": [
        {
            "title": "📊  WEEKLY SUMMARY",
            "description": "Performance report for the week of **${week_start} — ${week_end}**\\n\\nHere's what your automated recording system accomplished this week:",
            "color": ${COLOR_WEEKLY:-3447003},
            "fields": [
                {
                    "name": "📹  Streams Recorded",
                    "value": "\`${total_streams}\`",
                    "inline": true
                },
                {
                    "name": "⏱️  Total Hours",
                    "value": "\`${total_hours}h\`",
                    "inline": true
                },
                {
                    "name": "💾  Total Size",
                    "value": "\`${total_gb} GB\`",
                    "inline": true
                },
                {
                    "name": "📏  Avg Duration",
                    "value": "\`${avg_duration}\`",
                    "inline": true
                },
                {
                    "name": "☁️  Cloud Status",
                    "value": "All links active ✅",
                    "inline": true
                },
                {
                    "name": "🟢  System Status",
                    "value": "Operational",
                    "inline": true
                },
                {
                    "name": "\\u200B",
                    "value": "\\u200B",
                    "inline": false
                },
                {
                    "name": "📋  This Week's Recordings",
                    "value": "${esc_list}",
                    "inline": false
                }
            ],
            "author": {
                "name": "${RECORDER_NAME:-Muneeb Ahmad} • Weekly Report",
                "icon_url": "${avatar}"
            },
            "footer": {
                "text": "📡 Stream Recorder v${RECORDER_VERSION:-2.0.0} • Lifetime: ${lifetime_streams} streams | ${lifetime_hours}h | ${lifetime_gb} GB",
                "icon_url": "${avatar}"
            },
            "timestamp": "${timestamp}"
        }
    ]
}
PAYLOAD
)
    
    send_discord_webhook "$payload" "reports"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  NOTIFICATION 5: 🔄 CLOUD LINKS REFRESHED
#  Sent after the link preservation cycle runs
# ═══════════════════════════════════════════════════════════════════════════════

notify_links_refreshed() {
    log_step "Sending LINKS REFRESHED notification..."
    
    local avatar="${AVATAR_URL:-}"
    local timestamp
    timestamp=$(now_utc_iso)
    
    local total_checked="${REFRESH_TOTAL_CHECKED:-0}"
    local total_alive="${REFRESH_TOTAL_ALIVE:-0}"
    local total_refreshed="${REFRESH_TOTAL_REFRESHED:-0}"
    local total_dead="${REFRESH_TOTAL_DEAD:-0}"
    local total_restored="${REFRESH_TOTAL_RESTORED:-0}"
    local refresh_time="${REFRESH_TIME_FMT:-N/A}"
    
    local status_emoji="✅"
    local status_text="All links healthy"
    if (( total_dead > 0 )) && (( total_restored > 0 )); then
        status_emoji="🔧"
        status_text="${total_restored} restored from Archive.org"
    elif (( total_dead > 0 )); then
        status_emoji="⚠️"
        status_text="${total_dead} dead links found"
    fi
    
    local payload
    payload=$(cat <<PAYLOAD
{
    "username": "${BOT_USERNAME:-📡 Stream Recorder}",
    "avatar_url": "${avatar}",
    "embeds": [
        {
            "title": "🔄  CLOUD LINKS REFRESHED",
            "description": "The automated link preservation system has completed its maintenance cycle.\\nAll download links have been checked and refreshed to prevent expiration.",
            "color": ${COLOR_REFRESH:-5763757},
            "fields": [
                {
                    "name": "🔗  Links Checked",
                    "value": "\`${total_checked}\`",
                    "inline": true
                },
                {
                    "name": "✅  Links Alive",
                    "value": "\`${total_alive}\`",
                    "inline": true
                },
                {
                    "name": "🔄  Links Refreshed",
                    "value": "\`${total_refreshed}\`",
                    "inline": true
                },
                {
                    "name": "💀  Dead Links",
                    "value": "\`${total_dead}\`",
                    "inline": true
                },
                {
                    "name": "🏛️  Restored from Archive",
                    "value": "\`${total_restored}\`",
                    "inline": true
                },
                {
                    "name": "⏱️  Duration",
                    "value": "\`${refresh_time}\`",
                    "inline": true
                },
                {
                    "name": "📋  Status",
                    "value": "${status_emoji} ${status_text}",
                    "inline": false
                }
            ],
            "author": {
                "name": "${RECORDER_NAME:-Muneeb Ahmad} • Link Manager",
                "icon_url": "${avatar}"
            },
            "footer": {
                "text": "📡 Stream Recorder v${RECORDER_VERSION:-2.0.0} • © ${RECORDER_NAME:-Muneeb Ahmad} • Next refresh in 3 days",
                "icon_url": "${avatar}"
            },
            "timestamp": "${timestamp}"
        }
    ]
}
PAYLOAD
)
    
    send_discord_webhook "$payload" "reports"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  NOTIFICATION 6: 🟢 SYSTEM HEALTH (Bonus)
#  General system health check notification
# ═══════════════════════════════════════════════════════════════════════════════

notify_system_health() {
    log_step "Sending SYSTEM HEALTH notification..."
    
    local avatar="${AVATAR_URL:-}"
    local timestamp
    timestamp=$(now_utc_iso)
    
    local disk_space
    disk_space=$(get_disk_space_gb 2>/dev/null || echo "N/A")
    local disk_total
    disk_total=$(get_total_disk_gb 2>/dev/null || echo "N/A")
    local disk_used
    disk_used=$(get_disk_used_percent 2>/dev/null || echo "N/A")
    local ytdlp_ver
    ytdlp_ver=$(yt-dlp --version 2>/dev/null || echo "N/A")
    local ffmpeg_ver
    ffmpeg_ver=$(ffmpeg -version 2>/dev/null | head -1 | awk '{print $3}' || echo "N/A")
    local warp_status="${WARP_CONNECTED:-false}"
    local current_ip
    current_ip=$(get_public_ip 2>/dev/null || echo "N/A")
    
    local warp_text="🔴 Disconnected"
    [[ "$warp_status" == "true" ]] && warp_text="🟢 Connected"
    
    local payload
    payload=$(cat <<PAYLOAD
{
    "username": "${BOT_USERNAME:-📡 Stream Recorder}",
    "avatar_url": "${avatar}",
    "embeds": [
        {
            "title": "🟢  SYSTEM HEALTH CHECK",
            "description": "All systems operational. The automated stream recorder is running correctly.",
            "color": ${COLOR_HEALTH:-10181046},
            "fields": [
                {
                    "name": "💾  Disk Space",
                    "value": "\`${disk_space}/${disk_total} GB\` (${disk_used}% used)",
                    "inline": true
                },
                {
                    "name": "🌐  WARP",
                    "value": "${warp_text}",
                    "inline": true
                },
                {
                    "name": "🔒  IP Address",
                    "value": "\`${current_ip}\`",
                    "inline": true
                },
                {
                    "name": "📦  yt-dlp",
                    "value": "\`v${ytdlp_ver}\`",
                    "inline": true
                },
                {
                    "name": "🎬  ffmpeg",
                    "value": "\`v${ffmpeg_ver}\`",
                    "inline": true
                },
                {
                    "name": "⏰  Checked At",
                    "value": "\`$(now_pkt)\`",
                    "inline": true
                }
            ],
            "author": {
                "name": "${RECORDER_NAME:-Muneeb Ahmad} • System Monitor",
                "icon_url": "${avatar}"
            },
            "footer": {
                "text": "📡 Stream Recorder v${RECORDER_VERSION:-2.0.0} • © ${RECORDER_NAME:-Muneeb Ahmad} • ALL SYSTEMS GO",
                "icon_url": "${avatar}"
            },
            "timestamp": "${timestamp}"
        }
    ]
}
PAYLOAD
)
    
    send_discord_webhook "$payload" "reports"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  NOTIFICATION 7: 🍪 COOKIE EXPIRY WARNING
#  Sent when cookie health check fails or cookies are getting old
# ═══════════════════════════════════════════════════════════════════════════════

notify_cookie_warning() {
    log_step "Sending COOKIE WARNING notification..."
    
    local avatar="${AVATAR_URL:-}"
    local timestamp
    timestamp=$(now_utc_iso)
    local status="${1:-expired}"  # "expired" or "expiring_soon"
    local days_old="${2:-unknown}"
    
    local title description
    if [[ "$status" == "expired" ]]; then
        title="🍪  COOKIES EXPIRED — ACTION REQUIRED"
        description="Your YouTube cookies have **expired or stopped working**. The recorder will keep trying with cookieless methods, but **recording quality may be lower** and some streams may fail.\n\n**You need to update your cookies to fix this.**"
    else
        title="🍪  COOKIES EXPIRING SOON"
        description="Your YouTube cookies are **${days_old} days old** and may expire soon. Consider updating them to prevent recording issues."
    fi
    
    local payload
    payload=$(cat <<PAYLOAD
{
    "username": "${BOT_USERNAME:-📡 Stream Recorder}",
    "avatar_url": "${avatar}",
    "embeds": [
        {
            "title": "${title}",
            "description": "${description}",
            "color": ${COLOR_COOKIE_WARN:-16744448},
            "fields": [
                {
                    "name": "🍪  Cookie Age",
                    "value": "\`${days_old} days\`",
                    "inline": true
                },
                {
                    "name": "📋  Status",
                    "value": "${status}",
                    "inline": true
                },
                {
                    "name": "⏰  Checked At",
                    "value": "\`$(now_pkt)\`",
                    "inline": true
                },
                {
                    "name": "🔧  How to Fix",
                    "value": "1. Open your browser → go to YouTube\n2. Make sure you're logged in\n3. Use cookies.txt extension to export\n4. Encode with: \`base64 -w 0 cookies.txt\`\n5. Update the \`YOUTUBE_COOKIES\` secret in GitHub",
                    "inline": false
                }
            ],
            "author": {
                "name": "${RECORDER_NAME:-Muneeb Ahmad} • Cookie Monitor",
                "icon_url": "${avatar}"
            },
            "footer": {
                "text": "📡 Stream Recorder v${RECORDER_VERSION:-2.1.0} • © ${RECORDER_NAME:-Muneeb Ahmad} • UPDATE YOUR COOKIES",
                "icon_url": "${avatar}"
            },
            "timestamp": "${timestamp}"
        }
    ]
}
PAYLOAD
)
    
    send_discord_webhook "$payload" "alerts"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT — called with a notification type argument
# ═══════════════════════════════════════════════════════════════════════════════

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    case "${1:-}" in
        live_detected)      notify_live_detected ;;
        recording_complete) notify_recording_complete ;;
        recording_failed)   notify_recording_failed "${2:-}" "${3:-}" ;;
        weekly_summary)     notify_weekly_summary ;;
        links_refreshed)    notify_links_refreshed ;;
        system_health)      notify_system_health ;;
        cookie_warning)     notify_cookie_warning "${2:-expired}" "${3:-unknown}" ;;
        *)
            echo "Usage: $0 {live_detected|recording_complete|recording_failed|weekly_summary|links_refreshed|system_health|cookie_warning}"
            exit 1
            ;;
    esac
fi
