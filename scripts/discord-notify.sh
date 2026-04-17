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
    local type="$1"  # alerts, recordings, refresh, reports
    
    case "$type" in
        alerts)
            echo "${DISCORD_WEBHOOK_ALERTS:-${DISCORD_WEBHOOK_URL:-}}"
            ;;
        recordings)
            echo "${DISCORD_WEBHOOK_RECORDINGS:-${DISCORD_WEBHOOK_LINKS:-${DISCORD_WEBHOOK_URL:-}}}"
            ;;
        refresh)
            echo "${DISCORD_WEBHOOK_REFRESH:-${DISCORD_WEBHOOK_LINKS:-${DISCORD_WEBHOOK_URL:-}}}"
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
        log_warn "No Discord webhook URL set for '${channel_type}' — skipping notification (set DISCORD_WEBHOOK_URL or DISCORD_WEBHOOK_${channel_type^^} secret)"
        return 0
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
    local dashboard_url="${DASHBOARD_URL:-https://usermuneeb1.github.io/Stream-Recorder/}"
    local cookie_status="${COOKIE_STATUS:-unknown}"
    local timestamp
    timestamp=$(now_utc_iso)
    
    local cookie_icon="🟢"
    [[ "$cookie_status" == "expired" ]] && cookie_icon="🟡"
    [[ "$cookie_status" == "no_cookies" ]] && cookie_icon="🔴"
    
    local esc_title esc_channel esc_method
    esc_title=$(json_escape "$title")
    esc_channel=$(json_escape "$channel")
    esc_method=$(json_escape "$method")
    
    local payload
    payload=$(cat <<PAYLOAD
{
    "username": "${BOT_USERNAME:-☪️ The Muslim Lantern}",
    "avatar_url": "${avatar}",
    "embeds": [
        {
            "author": {
                "name": "🔴  GOING LIVE NOW",
                "icon_url": "${avatar}"
            },
            "title": "${esc_title}",
            "url": "${video_url}",
            "description": "**${esc_channel}** has started streaming. The automated recorder has been activated and is capturing the stream right now.",
            "color": 15736129,
            "image": {
                "url": "${thumbnail}"
            },
            "fields": [
                {
                    "name": "🕐  Detected At",
                    "value": "`${detect_time}`",
                    "inline": true
                },
                {
                    "name": "🔍  Method",
                    "value": "`${esc_method}`",
                    "inline": true
                },
                {
                    "name": "🍪  Cookies",
                    "value": "${cookie_icon} `${cookie_status}`",
                    "inline": true
                },
                {
                    "name": "🔗  Links",
                    "value": "[▶️ Watch Live](${video_url})  •  [📊 Dashboard](${dashboard_url})",
                    "inline": false
                }
            ],
            "footer": {
                "text": "☪️ The Muslim Lantern Archive  •  Recording in progress...",
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
    "username": "${BOT_USERNAME:-☪️ The Muslim Lantern}",
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
                "text": "☪️ The Muslim Lantern v${RECORDER_VERSION:-2.2.0} • Recording in progress...",
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
    local dashboard_url="${DASHBOARD_URL:-https://usermuneeb1.github.io/Stream-Recorder/}"
    local timestamp
    timestamp=$(now_utc_iso)
    
    local duration_fmt="${RECORD_DURATION_FMT:-00:00:00}"
    local size_human="${RECORD_SIZE_HUMAN:-0 B}"
    local resolution="${RECORD_RESOLUTION:-N/A}"
    local upload_count="${UPLOAD_SUCCESS_COUNT:-0}"
    local upload_total="${UPLOAD_TOTAL_SERVICES:-3}"
    local start_time="${STREAM_DETECTION_TIME:-N/A}"
    local end_time="${STREAM_END_TIME:-$(now_pkt)}"
    
    # Build download links value string
    local links_value=""
    if [[ -n "${GOFILE_LINKS:-}" ]]; then
        IFS=';' read -ra g_entries <<< "$GOFILE_LINKS"
        for entry in "${g_entries[@]}"; do
            local g_link; g_link=$(echo "$entry" | cut -d'|' -f2)
            [[ -n "$g_link" ]] && links_value+="[🟢 Gofile](${g_link})  "
        done
    fi
    if [[ -n "${PIXELDRAIN_LINKS:-}" ]]; then
        IFS=';' read -ra p_entries <<< "$PIXELDRAIN_LINKS"
        for entry in "${p_entries[@]}"; do
            local p_link; p_link=$(echo "$entry" | cut -d'|' -f2)
            [[ -n "$p_link" ]] && links_value+="[🔵 Pixeldrain](${p_link})  "
        done
    fi
    if [[ -n "${ARCHIVE_LINKS:-}" ]]; then
        IFS=';' read -ra a_entries <<< "$ARCHIVE_LINKS"
        for entry in "${a_entries[@]}"; do
            local a_link; a_link=$(echo "$entry" | cut -d'|' -f2)
            [[ -n "$a_link" ]] && links_value+="[🏛️ Archive](${a_link})  "
        done
    fi
    [[ -z "$links_value" ]] && links_value="*Uploading...*"
    links_value+="\n[📊 Watch on Dashboard](${dashboard_url})"
    
    # Color & emoji based on upload success
    local embed_color upload_emoji
    if (( upload_count == upload_total )); then
        embed_color=5763757; upload_emoji="✅"
    elif (( upload_count > 0 )); then
        embed_color=16761095; upload_emoji="⚠️"
    else
        embed_color=15158332; upload_emoji="❌"
    fi
    
    local esc_title esc_channel
    esc_title=$(json_escape "$title")
    esc_channel=$(json_escape "$channel")
    
    local payload
    payload=$(cat <<PAYLOAD
{
    "username": "${BOT_USERNAME:-☪️ The Muslim Lantern}",
    "avatar_url": "${avatar}",
    "embeds": [
        {
            "author": {
                "name": "✅  STREAM RECORDED SUCCESSFULLY",
                "icon_url": "${avatar}"
            },
            "title": "${esc_title}",
            "url": "${dashboard_url}",
            "description": "**${esc_channel}** — The stream has ended and been fully processed. **${upload_count}/${upload_total}** cloud mirrors are ready.",
            "color": ${embed_color},
            "image": {
                "url": "${thumbnail}"
            },
            "fields": [
                {
                    "name": "⏱️  Duration",
                    "value": "`${duration_fmt}`",
                    "inline": true
                },
                {
                    "name": "💾  Size",
                    "value": "`${size_human}`",
                    "inline": true
                },
                {
                    "name": "📐  Quality",
                    "value": "`${resolution}`",
                    "inline": true
                },
                {
                    "name": "🟢  Stream Start",
                    "value": "`${start_time}`",
                    "inline": true
                },
                {
                    "name": "🔴  Stream End",
                    "value": "`${end_time}`",
                    "inline": true
                },
                {
                    "name": "☁️  Mirrors",
                    "value": "${upload_emoji} `${upload_count}/${upload_total}` uploaded",
                    "inline": true
                },
                {
                    "name": "📥  Download & Watch",
                    "value": "${links_value}",
                    "inline": false
                }
            ],
            "footer": {
                "text": "☪️ The Muslim Lantern Archive  •  All recordings are permanent",
                "icon_url": "${avatar}"
            },
            "timestamp": "${timestamp}"
        }
    ]
}
PAYLOAD
)
    
    send_discord_webhook "$payload" "recordings"
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
    local cookie_status="${COOKIE_STATUS:-unknown}"
    local timestamp
    timestamp=$(now_utc_iso)
    local current_time
    current_time=$(now_pkt)
    
    local esc_title esc_channel esc_error
    esc_title=$(json_escape "$title")
    esc_channel=$(json_escape "$channel")
    esc_error=$(json_escape "$error_msg")
    
    # Diagnose the issue
    local diagnosis="Unknown"
    if echo "$error_msg" | grep -qi "technical difficulties"; then
        diagnosis="YouTube is blocking the IP. WARP may not be connected or the IP has been flagged."
    elif echo "$error_msg" | grep -qi "bot\|captcha\|sign in"; then
        diagnosis="YouTube detected automated access. Cookies may need refreshing."
    elif echo "$error_msg" | grep -qi "PO Token\|po_token"; then
        diagnosis="YouTube requires a PO Token for this video. This is an industry-wide limitation."
    elif echo "$error_msg" | grep -qi "not live\|no longer live"; then
        diagnosis="Stream ended before recording could start."
    else
        diagnosis="All 6 recording methods (web, web_creator, default, mweb, streamlink) failed."
    fi
    
    local payload
    payload=$(cat <<PAYLOAD
{
    "username": "${BOT_USERNAME:-☪️ The Muslim Lantern}",
    "avatar_url": "${avatar}",
    "embeds": [
        {
            "title": "❌  RECORDING FAILED",
            "description": "> 📺 **${esc_title}**\\n> 👤 **${esc_channel}**\\n\\nThe recording engine exhausted **all available methods** (6 methods × 5 attempts = 30 tries).",
            "color": ${COLOR_FAILED:-15158332},
            "thumbnail": {
                "url": "${thumbnail}"
            },
            "fields": [
                {
                    "name": "\\u200B",
                    "value": "━━━━━ **Diagnosis** ━━━━━",
                    "inline": false
                },
                {
                    "name": "🔍  Root Cause",
                    "value": "${diagnosis}",
                    "inline": false
                },
                {
                    "name": "📋  Error Details",
                    "value": "\`\`\`\\n${esc_error}\\n\`\`\`",
                    "inline": false
                },
                {
                    "name": "\\u200B",
                    "value": "━━━━━ **Status** ━━━━━",
                    "inline": false
                },
                {
                    "name": "🕐  Time",
                    "value": "\`${current_time}\`",
                    "inline": true
                },
                {
                    "name": "🍪  Cookies",
                    "value": "\`${cookie_status}\`",
                    "inline": true
                },
                {
                    "name": "🔄  Retry",
                    "value": "${retry_info}",
                    "inline": true
                },
                {
                    "name": "\\u200B",
                    "value": "━━━━━ **Troubleshooting** ━━━━━",
                    "inline": false
                },
                {
                    "name": "1️⃣  Refresh Cookies",
                    "value": "Re-export fresh cookies from Firefox",
                    "inline": false
                },
                {
                    "name": "2️⃣  Update Secret",
                    "value": "Update \`YOUTUBE_COOKIES\` in GitHub secrets",
                    "inline": false
                },
                {
                    "name": "3️⃣  Manual Run",
                    "value": "**[▶️ Check if still live](${video_url})** — Then trigger a fresh workflow",
                    "inline": false
                }
            ],
            "author": {
                "name": "${esc_channel} • Recording Failed",
                "icon_url": "${avatar}"
            },
            "footer": {
                "text": "☪️ The Muslim Lantern v${RECORDER_VERSION:-2.2.0} • Auto-retry active",
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
    
    # Performance indicator
    local perf_emoji="⭐" perf_text="Great Week!"
    if (( total_streams == 0 )); then
        perf_emoji="😴" perf_text="No Activity"
    elif (( total_streams >= 5 )); then
        perf_emoji="🔥" perf_text="Outstanding!"
    elif (( total_streams >= 3 )); then
        perf_emoji="💪" perf_text="Solid Week!"
    fi
    
    local payload
    payload=$(cat <<PAYLOAD
{
    "username": "${BOT_USERNAME:-☪️ The Muslim Lantern}",
    "avatar_url": "${avatar}",
    "embeds": [
        {
            "title": "📊  WEEKLY PERFORMANCE REPORT",
            "description": "**${week_start} — ${week_end}**\\n\\n${perf_emoji} ${perf_text} — Here's your automated recording system's weekly performance breakdown.",
            "color": ${COLOR_WEEKLY:-3447003},
            "fields": [
                {
                    "name": "\\u200B",
                    "value": "━━━━━ **This Week** ━━━━━",
                    "inline": false
                },
                {
                    "name": "📹  Streams",
                    "value": "**${total_streams}** recorded",
                    "inline": true
                },
                {
                    "name": "⏱️  Hours",
                    "value": "**${total_hours}h** captured",
                    "inline": true
                },
                {
                    "name": "💾  Storage",
                    "value": "**${total_gb} GB** saved",
                    "inline": true
                },
                {
                    "name": "📏  Avg Duration",
                    "value": "\`${avg_duration}\` per stream",
                    "inline": true
                },
                {
                    "name": "☁️  Uploads",
                    "value": "All links active ✅",
                    "inline": true
                },
                {
                    "name": "🛡️  System",
                    "value": "🟢 Operational",
                    "inline": true
                },
                {
                    "name": "\\u200B",
                    "value": "━━━━━ **Recordings** ━━━━━",
                    "inline": false
                },
                {
                    "name": "📝  This Week's Streams",
                    "value": "${esc_list}",
                    "inline": false
                },
                {
                    "name": "\\u200B",
                    "value": "━━━━━ **All-Time Stats** ━━━━━",
                    "inline": false
                },
                {
                    "name": "🏆  Total Streams",
                    "value": "**${lifetime_streams}**",
                    "inline": true
                },
                {
                    "name": "⏰  Total Hours",
                    "value": "**${lifetime_hours}h**",
                    "inline": true
                },
                {
                    "name": "📦  Total Storage",
                    "value": "**${lifetime_gb} GB**",
                    "inline": true
                }
            ],
            "author": {
                "name": "${RECORDER_NAME:-The Muslim Lantern} • Weekly Report",
                "icon_url": "${avatar}"
            },
            "footer": {
                "text": "☪️ The Muslim Lantern v${RECORDER_VERSION:-2.2.0} • Automated Recording System",
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
    
    local status_emoji="✅" status_text="All links healthy"
    local embed_color=${COLOR_REFRESH:-5763757}
    if (( total_dead > 0 )) && (( total_restored > 0 )); then
        status_emoji="🔧" status_text="${total_restored} links restored from Archive.org"
        embed_color=${COLOR_COMPLETE_PARTIAL:-16761095}
    elif (( total_dead > 0 )); then
        status_emoji="⚠️" status_text="${total_dead} dead links detected"
        embed_color=${COLOR_FAILED:-15158332}
    elif (( total_checked == 0 )); then
        status_emoji="💭" status_text="No links to check yet"
    fi
    
    # Health bar
    local health_pct=100
    if (( total_checked > 0 )); then
        health_pct=$(( (total_alive * 100) / total_checked ))
    fi
    local health_bar=""
    local filled=$(( health_pct / 10 ))
    local empty=$(( 10 - filled ))
    for ((i=0; i<filled; i++)); do health_bar+="🟢"; done
    for ((i=0; i<empty; i++)); do health_bar+="⚪"; done
    
    local payload
    payload=$(cat <<PAYLOAD
{
    "username": "${BOT_USERNAME:-☪️ The Muslim Lantern}",
    "avatar_url": "${avatar}",
    "embeds": [
        {
            "title": "🔄  CLOUD LINK PRESERVATION",
            "description": "The automated link maintenance cycle has completed. All download links have been checked, pinged, and refreshed to **prevent expiration**.\\n\\n${health_bar} **${health_pct}%** Health",
            "color": ${embed_color},
            "fields": [
                {
                    "name": "🔍  Checked",
                    "value": "**${total_checked}** links",
                    "inline": true
                },
                {
                    "name": "✅  Alive",
                    "value": "**${total_alive}** healthy",
                    "inline": true
                },
                {
                    "name": "🔄  Refreshed",
                    "value": "**${total_refreshed}** reset",
                    "inline": true
                },
                {
                    "name": "💀  Dead",
                    "value": "**${total_dead}** expired",
                    "inline": true
                },
                {
                    "name": "🏛️  Restored",
                    "value": "**${total_restored}** from Archive",
                    "inline": true
                },
                {
                    "name": "⏱️  Duration",
                    "value": "\`${refresh_time}\`",
                    "inline": true
                },
                {
                    "name": "\\u200B",
                    "value": "${status_emoji} **Status:** ${status_text}",
                    "inline": false
                }
            ],
            "author": {
                "name": "${RECORDER_NAME:-The Muslim Lantern} • Link Manager",
                "icon_url": "${avatar}"
            },
            "footer": {
                "text": "☪️ The Muslim Lantern v${RECORDER_VERSION:-2.2.0} • Next refresh in 3 days",
                "icon_url": "${avatar}"
            },
            "timestamp": "${timestamp}"
        }
    ]
}
PAYLOAD
)
    
    send_discord_webhook "$payload" "refresh"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  NOTIFICATION 6: 🛡️ SYSTEM HEALTH
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
    local cookie_status="${COOKIE_STATUS:-unknown}"
    
    local warp_text="🔴 Disconnected"
    [[ "$warp_status" == "true" ]] && warp_text="🟢 Connected"
    
    local cookie_text="❓ Unknown"
    [[ "$cookie_status" == "valid" ]] && cookie_text="✅ Valid"
    [[ "$cookie_status" == "expired" ]] && cookie_text="⚠️ Expired"
    [[ "$cookie_status" == "no_cookies" ]] && cookie_text="❌ None"
    
    # System health indicator
    local health_status="🟢 ALL SYSTEMS OPERATIONAL"
    local health_color=${COLOR_HEALTH:-10181046}
    if [[ "$cookie_status" == "expired" ]]; then
        health_status="🟡 DEGRADED — Cookies expired"
        health_color=${COLOR_COOKIE_WARN:-16744448}
    elif [[ "$warp_status" != "true" ]]; then
        health_status="🟡 DEGRADED — WARP disconnected"
        health_color=${COLOR_COOKIE_WARN:-16744448}
    fi
    
    local payload
    payload=$(cat <<PAYLOAD
{
    "username": "${BOT_USERNAME:-☪️ The Muslim Lantern}",
    "avatar_url": "${avatar}",
    "embeds": [
        {
            "title": "🛡️  SYSTEM HEALTH CHECK",
            "description": "${health_status}\\n\\nAll components have been verified and the automated recording system is ready to capture streams.",
            "color": ${health_color},
            "fields": [
                {
                    "name": "\\u200B",
                    "value": "━━━━━ **Infrastructure** ━━━━━",
                    "inline": false
                },
                {
                    "name": "💾  Disk Space",
                    "value": "\`${disk_space}/${disk_total} GB\`\\n(${disk_used}% used)",
                    "inline": true
                },
                {
                    "name": "🌐  WARP VPN",
                    "value": "${warp_text}",
                    "inline": true
                },
                {
                    "name": "🍪  Cookies",
                    "value": "${cookie_text}",
                    "inline": true
                },
                {
                    "name": "\\u200B",
                    "value": "━━━━━ **Software** ━━━━━",
                    "inline": false
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
                    "name": "⏰  Checked",
                    "value": "\`$(now_pkt)\`",
                    "inline": true
                }
            ],
            "author": {
                "name": "${RECORDER_NAME:-The Muslim Lantern} • System Monitor",
                "icon_url": "${avatar}"
            },
            "footer": {
                "text": "☪️ The Muslim Lantern v${RECORDER_VERSION:-2.2.0} • Automated Health Check",
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
    local status="${1:-expired}"
    local days_old="${2:-unknown}"
    
    local title description embed_color
    if [[ "$status" == "expired" ]]; then
        title="🚨  COOKIES EXPIRED — ACTION REQUIRED"
        description="Your YouTube cookies have **expired or stopped working**. Recording will continue with cookieless methods but **quality and reliability may be reduced**.\\n\\n⚠️ **Update your cookies immediately to restore full functionality.**"
        embed_color=${COLOR_FAILED:-15158332}
    else
        title="🍪  COOKIES EXPIRING SOON"
        description="Your YouTube cookies are **${days_old} days old** and approaching expiration. Update them soon to prevent recording issues."
        embed_color=${COLOR_COOKIE_WARN:-16744448}
    fi
    
    local payload
    payload=$(cat <<PAYLOAD
{
    "username": "${BOT_USERNAME:-☪️ The Muslim Lantern}",
    "avatar_url": "${avatar}",
    "embeds": [
        {
            "title": "${title}",
            "description": "${description}",
            "color": ${embed_color},
            "fields": [
                {
                    "name": "🍪  Cookie Age",
                    "value": "**${days_old} days**",
                    "inline": true
                },
                {
                    "name": "📊  Status",
                    "value": "\`${status}\`",
                    "inline": true
                },
                {
                    "name": "⏰  Checked",
                    "value": "\`$(now_pkt)\`",
                    "inline": true
                },
                {
                    "name": "\\u200B",
                    "value": "━━━━━ **How to Fix** ━━━━━",
                    "inline": false
                },
                {
                    "name": "1️⃣  Export Cookies",
                    "value": "Open Firefox → Go to YouTube → Make sure you're logged in → Use **cookies.txt** extension to export",
                    "inline": false
                },
                {
                    "name": "2️⃣  Encode to Base64",
                    "value": "Run: \`base64 -w 0 cookies.txt | clip\`",
                    "inline": false
                },
                {
                    "name": "3️⃣  Update GitHub Secret",
                    "value": "Go to **Settings → Secrets → Actions** → Edit \`YOUTUBE_COOKIES\` → Paste the base64 string",
                    "inline": false
                }
            ],
            "author": {
                "name": "${RECORDER_NAME:-The Muslim Lantern} • Cookie Monitor",
                "icon_url": "${avatar}"
            },
            "footer": {
                "text": "☪️ The Muslim Lantern v${RECORDER_VERSION:-2.2.0} • UPDATE COOKIES TO RESTORE",
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

