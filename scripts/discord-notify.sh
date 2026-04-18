#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  📡 STREAM RECORDER — PREMIUM DISCORD NOTIFICATIONS v3.0                   ║
# ║  7 notification types with rich professional embeds.                        ║
# ║  Built entirely with jq — no heredoc / no backtick bash escaping issues.   ║
# ║                                                                             ║
# ║  All 7 types:                                                               ║
# ║    1. 🔴 LIVE DETECTED         → ALERTS channel                            ║
# ║    2. ✅ RECORDING COMPLETE     → RECORDINGS channel                        ║
# ║    3. ❌ RECORDING FAILED       → ALERTS channel                            ║
# ║    4. 📊 WEEKLY SUMMARY         → REPORTS channel                           ║
# ║    5. 🔄 LINKS REFRESHED        → REPORTS channel                           ║
# ║    6. 🟢 SYSTEM HEALTH          → REPORTS channel                           ║
# ║    7. 🍪 COOKIE WARNING         → ALERTS channel                            ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

# ═══════════════════════════════════════════════════════════════════════════════
#  WEBHOOK ROUTING
# ═══════════════════════════════════════════════════════════════════════════════

get_webhook_url() {
    local type="$1"
    case "$type" in
        alerts)      echo "${DISCORD_WEBHOOK_ALERTS:-${DISCORD_WEBHOOK_URL:-}}" ;;
        recordings)  echo "${DISCORD_WEBHOOK_RECORDINGS:-${DISCORD_WEBHOOK_LINKS:-${DISCORD_WEBHOOK_URL:-}}}" ;;
        refresh)     echo "${DISCORD_WEBHOOK_REFRESH:-${DISCORD_WEBHOOK_LINKS:-${DISCORD_WEBHOOK_URL:-}}}" ;;
        reports)     echo "${DISCORD_WEBHOOK_REPORTS:-${DISCORD_WEBHOOK_URL:-}}" ;;
        *)           echo "${DISCORD_WEBHOOK_URL:-}" ;;
    esac
}

# ═══════════════════════════════════════════════════════════════════════════════
#  CORE WEBHOOK SENDER
# ═══════════════════════════════════════════════════════════════════════════════

send_discord_webhook() {
    local payload="$1"
    local channel_type="${2:-default}"
    local webhook_url
    webhook_url=$(get_webhook_url "$channel_type")

    if [[ -z "$webhook_url" ]]; then
        log_warn "No Discord webhook for '${channel_type}' — skipping (set DISCORD_WEBHOOK_URL secret)"
        return 0
    fi

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
        log_warn "Discord rate limited — retrying in 5s..."
        sleep 5
        http_code=$(curl -s -o /dev/null -w '%{http_code}' \
            --max-time 30 -H "Content-Type: application/json" \
            -d "$payload" "$webhook_url" 2>/dev/null)
        if [[ "$http_code" =~ ^2[0-9]{2}$ ]]; then
            log_ok "Discord notification sent on retry (HTTP ${http_code})"
            return 0
        fi
    fi

    log_error "Discord notification FAILED (HTTP ${http_code})"
    return 1
}

# ═══════════════════════════════════════════════════════════════════════════════
#  NOTIFICATION 1: 🔴 LIVE STREAM DETECTED
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
    local disk_space="${DISK_SPACE_GB:-N/A}"
    local timestamp
    timestamp=$(now_utc_iso)

    local cookie_icon="🟢"
    [[ "$cookie_status" == "expired" ]]      && cookie_icon="🔴"
    [[ "$cookie_status" == "no_cookies" ]]   && cookie_icon="🟡"
    [[ "$cookie_status" == "check_failed" ]] && cookie_icon="❓"

    local warp_val="🔴 Off"
    [[ "${WARP_CONNECTED:-false}" == "true" ]] && warp_val="🟢 Active"

    local payload
    payload=$(jq -n \
        --arg username    "${BOT_USERNAME:-☪️ The Muslim Lantern}" \
        --arg avatar      "$avatar" \
        --arg title       "$title" \
        --arg channel     "$channel" \
        --arg thumbnail   "$thumbnail" \
        --arg dtime       "$detect_time" \
        --arg method      "$method" \
        --arg cookie      "${cookie_icon} ${cookie_status}" \
        --arg disk        "${disk_space} GB free" \
        --arg warp        "$warp_val" \
        --arg dash_url    "$dashboard_url" \
        --arg timestamp   "$timestamp" \
        --arg bot_ver     "${RECORDER_VERSION:-3.0.0}" \
        --arg bot_name    "${RECORDER_NAME:-The Muslim Lantern}" \
        '{
            username:   $username,
            avatar_url: $avatar,
            embeds: [{
                author: {
                    name:     ("🔴  RECORDING STARTED  ─  " + $channel),
                    icon_url: $avatar
                },
                title:       $title,
                description: (
                    "A live stream from **" + $channel + "** has been detected and recording is now active.\n" +
                    "> 🎬 **Multi-method recording engine engaged** — 6 methods × 3 retries = 18 chances to capture.\n" +
                    "> ☁️ **Triple cloud upload** (Gofile · Pixeldrain · Archive.org) will begin once complete."
                ),
                color: 15212032,
                image: { url: $thumbnail },
                fields: [
                    { name: "🕐  Detected At",   value: $dtime,                inline: false },
                    { name: "🔍  Method",         value: ("`" + $method + "`"), inline: true  },
                    { name: "🍪  Cookies",         value: $cookie,              inline: true  },
                    { name: "💾  Disk Free",       value: $disk,                inline: true  },
                    { name: "🌐  WARP",            value: $warp,                inline: true  },
                    { name: "🎛️  Status",         value: "`🔴 LIVE — RECORDING`", inline: true  },
                    { name: "📊  Dashboard",       value: ("[View Archive →](" + $dash_url + ")"), inline: false }
                ],
                footer: {
                    text:     ("☪️ " + $bot_name + "  ·  Stream Recorder v" + $bot_ver + "  ·  Recording in progress…"),
                    icon_url: $avatar
                },
                timestamp: $timestamp
            }]
        }')

    send_discord_webhook "$payload" "alerts"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  NOTIFICATION 2: ✅ RECORDING COMPLETE
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

    local duration_fmt="${RECORD_DURATION_FMT:-N/A}"
    local size_human="${RECORD_SIZE_HUMAN:-N/A}"
    local resolution="${RECORD_RESOLUTION:-N/A}"
    local record_parts="${RECORD_PARTS:-1}"
    local record_date
    record_date=$(TZ='Asia/Karachi' date '+%Y-%m-%d')
    local upload_count="${UPLOAD_SUCCESS_COUNT:-0}"
    local upload_total="${UPLOAD_TOTAL_SERVICES:-3}"
    local upload_elapsed="${UPLOAD_ELAPSED_HUMAN:-N/A}"
    local process_time="${PROCESS_ELAPSED:-N/A}"
    local warp_ip="${WARP_IP:-N/A}"

    # Color based on upload success
    local color=5763757         # green — all good
    [[ "$upload_count" == "0" ]]                     && color=15158332   # red — all failed
    [[ "$upload_count" != "0" ]] && \
    [[ "$upload_count" != "$upload_total" ]]          && color=16761095   # amber — partial

    # Extract URLs from "PartName|url" semicolon-delimited env vars
    local gofile_url="" pixeldrain_url="" archive_url="" archive_id=""
    [[ -n "${GOFILE_LINKS:-}" ]]     && gofile_url=$(echo "${GOFILE_LINKS}"     | cut -d';' -f1 | cut -d'|' -f2)
    [[ -n "${PIXELDRAIN_LINKS:-}" ]] && pixeldrain_url=$(echo "${PIXELDRAIN_LINKS}" | cut -d';' -f1 | cut -d'|' -f2)
    if [[ -n "${ARCHIVE_LINKS:-}" ]]; then
        archive_url=$(echo "${ARCHIVE_LINKS}" | cut -d';' -f1 | cut -d'|' -f2)
        archive_id=$(echo  "${ARCHIVE_LINKS}" | cut -d';' -f1 | cut -d'|' -f3)
    fi

    local chat_status="❌ Not archived"
    [[ -n "${RECORD_CHAT_URL:-}" ]] && chat_status="✅ [Chat Log Available](${RECORD_CHAT_URL})"

    # Build upload status summary line
    local upstatus=""
    upstatus+=$(if [[ -n "$pixeldrain_url" ]]; then echo "🔵 Pixeldrain ✅"; else echo "🔵 Pixeldrain ❌"; fi)
    upstatus+=" · "
    upstatus+=$(if [[ -n "$gofile_url" ]]; then echo "🟠 Gofile ✅"; else echo "🟠 Gofile ❌"; fi)
    upstatus+=" · "
    upstatus+=$(if [[ -n "$archive_url" ]]; then echo "🏛 Archive.org ✅"; else echo "🏛 Archive.org ❌"; fi)

    local payload
    payload=$(jq -n \
        --arg username       "${BOT_USERNAME:-☪️ The Muslim Lantern}" \
        --arg avatar         "$avatar" \
        --arg title          "$title" \
        --arg channel        "$channel" \
        --arg thumbnail      "$thumbnail" \
        --arg duration       "$duration_fmt" \
        --arg size           "$size_human" \
        --arg resolution     "$resolution" \
        --arg date           "$record_date" \
        --arg parts          "$record_parts" \
        --arg uploads        "${upload_count}/${upload_total}" \
        --arg upstatus       "$upstatus" \
        --arg gofile_url     "$gofile_url" \
        --arg pixeldrain_url "$pixeldrain_url" \
        --arg archive_url    "$archive_url" \
        --arg archive_id     "$archive_id" \
        --arg chat_status    "$chat_status" \
        --arg dash_url       "$dashboard_url" \
        --arg timestamp      "$timestamp" \
        --arg bot_ver        "${RECORDER_VERSION:-3.0.0}" \
        --arg bot_name       "${RECORDER_NAME:-The Muslim Lantern}" \
        --argjson color      "$color" \
        '{
            username:   $username,
            avatar_url: $avatar,
            embeds: [{
                author: {
                    name:     ("✅  ARCHIVED  ─  " + $channel),
                    url:      $dash_url,
                    icon_url: $avatar
                },
                title:       ("📼  " + $title),
                url:         $dash_url,
                description: (
                    "**" + $channel + "** live stream has been fully recorded, processed, and uploaded to the cloud archive.\n" +
                    "\n" +
                    "```\n" +
                    "  ⏱  Duration   " + $duration + "\n" +
                    "  💾  File Size  " + $size + "\n" +
                    "  📐  Resolution " + $resolution + "\n" +
                    "  📅  Date       " + $date + "\n" +
                    "  📦  Parts      " + $parts + "\n" +
                    "  ☁️  Uploads   " + $uploads + " services\n" +
                    "```"
                ),
                color: $color,
                thumbnail: { url: $thumbnail },
                fields: (
                    [
                        { name: "☁️  Upload Status", value: $upstatus, inline: false },
                        (if $pixeldrain_url != "" then { name: "🔵  Pixeldrain",        value: ("[▶️ Watch / ⬇️ Download](" + $pixeldrain_url + ")"),    inline: false } else empty end),
                        (if $gofile_url     != "" then { name: "🟠  Gofile",            value: ("[▶️ Watch / ⬇️ Download](" + $gofile_url + ")"),         inline: false } else empty end),
                        (if $archive_url    != "" then { name: "🏛️  Archive.org",     value: ("[🔗 Permanent Link](" + $archive_url + ")\n`" + $archive_id + "`"), inline: false } else empty end),
                        (if ($pixeldrain_url == "" and $gofile_url == "" and $archive_url == "") then
                            { name: "❌  Downloads",  value: "All cloud uploads failed — files may be lost. Check workflow logs.", inline: false }
                        else empty end),
                        { name: "💬  Live Chat",    value: $chat_status,                                   inline: false },
                        { name: "📊  Dashboard",    value: ("[📂 View Full Archive →](" + $dash_url + ")"),  inline: false }
                    ]
                ),
                footer: {
                    text:     ("☪️ " + $bot_name + "  ·  Stream Recorder v" + $bot_ver + "  ·  Permanently Archived"),
                    icon_url: $avatar
                },
                timestamp: $timestamp
            }]
        }')

    send_discord_webhook "$payload" "recordings"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  NOTIFICATION 3: ❌ RECORDING FAILED
# ═══════════════════════════════════════════════════════════════════════════════

notify_recording_failed() {
    log_step "Sending RECORDING FAILED notification..."

    local reason="${1:-Unknown error}"
    local retry_info="${2:-Auto-retry scheduled}"
    local title="${STREAM_TITLE:-Live Stream}"
    local channel="${STREAM_CHANNEL:-Unknown Channel}"
    local video_url="${STREAM_URL:-}"
    local thumbnail="${STREAM_THUMBNAIL:-}"
    local avatar="${AVATAR_URL:-}"
    local dashboard_url="${DASHBOARD_URL:-https://usermuneeb1.github.io/Stream-Recorder/}"
    local timestamp
    timestamp=$(now_utc_iso)
    local fail_time
    fail_time=$(now_pkt)

    local payload
    payload=$(jq -n \
        --arg username    "${BOT_USERNAME:-☪️ The Muslim Lantern}" \
        --arg avatar      "$avatar" \
        --arg title       "$title" \
        --arg url         "$video_url" \
        --arg channel     "$channel" \
        --arg thumbnail   "$thumbnail" \
        --arg reason      "$reason" \
        --arg retry_info  "$retry_info" \
        --arg fail_time   "$fail_time" \
        --arg dash_url    "$dashboard_url" \
        --arg timestamp   "$timestamp" \
        --arg bot_ver     "${RECORDER_VERSION:-2.2.0}" \
        --arg bot_name    "${RECORDER_NAME:-The Muslim Lantern}" \
        '{
            username:   $username,
            avatar_url: $avatar,
            embeds: [{
                author: {
                    name:     ("❌  RECORDING FAILED  ·  " + $channel),
                    url:      $url,
                    icon_url: $avatar
                },
                title:       $title,
                url:         $url,
                description: (
                    "**" + $channel + "** was live but the recording failed after exhausting all methods and retries.\n\n" +
                    "> ⚠️ **" + $reason + "**\n\n" +
                    "Files on disk (if any) were NOT uploaded. Check the workflow logs for full details."
                ),
                color: 15158332,
                thumbnail: { url: $thumbnail },
                fields: [
                    { name: "⏰  Failed At",    value: $fail_time,    inline: true  },
                    { name: "🔄  Retry Status", value: $retry_info,   inline: true  },
                    { name: "📊  Dashboard",    value: ("[📂 View Archive →](" + $dash_url + ")"), inline: false }
                ],
                footer: {
                    text:     ("☪️ " + $bot_name + "  ·  v" + $bot_ver + "  ·  Auto-retry dispatched"),
                    icon_url: $avatar
                },
                timestamp: $timestamp
            }]
        }')

    send_discord_webhook "$payload" "alerts"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  NOTIFICATION 4: 📊 WEEKLY SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════

notify_weekly_summary() {
    log_step "Sending WEEKLY SUMMARY notification..."

    local total_streams="${LIFETIME_TOTAL_STREAMS:-0}"
    local total_hours="${LIFETIME_TOTAL_HOURS:-0}"
    local total_gb="${LIFETIME_TOTAL_GB:-0}"
    local avg_duration="${LIFETIME_AVG_DURATION:-0}"
    local last_title="${STREAM_TITLE:-N/A}"
    local last_channel="${STREAM_CHANNEL:-N/A}"
    local avatar="${AVATAR_URL:-}"
    local dashboard_url="${DASHBOARD_URL:-https://usermuneeb1.github.io/Stream-Recorder/}"
    local timestamp
    timestamp=$(now_utc_iso)
    local week_date
    week_date=$(TZ='Asia/Karachi' date '+%Y-%m-%d')

    local payload
    payload=$(jq -n \
        --arg username       "${BOT_USERNAME:-☪️ The Muslim Lantern}" \
        --arg avatar         "$avatar" \
        --arg total_streams  "$total_streams" \
        --arg total_hours    "$total_hours" \
        --arg total_gb       "$total_gb" \
        --arg avg_duration   "$avg_duration" \
        --arg last_title     "$last_title" \
        --arg last_channel   "$last_channel" \
        --arg week_date      "$week_date" \
        --arg dash_url       "$dashboard_url" \
        --arg timestamp      "$timestamp" \
        --arg bot_ver        "${RECORDER_VERSION:-2.2.0}" \
        --arg bot_name       "${RECORDER_NAME:-The Muslim Lantern}" \
        '{
            username:   $username,
            avatar_url: $avatar,
            embeds: [{
                author: {
                    name:     "📊  WEEKLY ARCHIVE REPORT",
                    icon_url: $avatar
                },
                title: "☪️ The Muslim Lantern — Weekly Summary",
                description: (
                    "Here is your weekly archive summary for the recording bot.\n\n" +
                    "**Week ending:** `" + $week_date + "`"
                ),
                color: 5793522,
                fields: [
                    { name: "🎬  Total Streams",    value: ("`" + $total_streams + "` recordings"),   inline: true  },
                    { name: "⏱️  Total Hours",      value: ("`" + $total_hours + "h`"),               inline: true  },
                    { name: "💾  Total Archived",   value: ("`" + $total_gb + " GB`"),                inline: true  },
                    { name: "📏  Avg Duration",     value: ("`" + $avg_duration + "h` per stream"),   inline: true  },
                    { name: "📺  Last Stream",      value: ("**" + $last_title + "**\nby " + $last_channel), inline: false },
                    { name: "📊  Full Archive",     value: ("[Open Dashboard →](" + $dash_url + ")"), inline: false }
                ],
                footer: {
                    text:     ("☪️ " + $bot_name + "  ·  v" + $bot_ver + "  ·  Weekly Report"),
                    icon_url: $avatar
                },
                timestamp: $timestamp
            }]
        }')

    send_discord_webhook "$payload" "reports"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  NOTIFICATION 5: 🔄 LINKS REFRESHED
# ═══════════════════════════════════════════════════════════════════════════════

notify_links_refreshed() {
    log_step "Sending LINKS REFRESHED notification..."

    local checked="${REFRESH_CHECKED:-0}"
    local active="${REFRESH_ACTIVE:-0}"
    local expired="${REFRESH_EXPIRED:-0}"
    local avatar="${AVATAR_URL:-}"
    local dashboard_url="${DASHBOARD_URL:-https://usermuneeb1.github.io/Stream-Recorder/}"
    local timestamp
    timestamp=$(now_utc_iso)
    local refresh_time
    refresh_time=$(now_pkt)

    local status_icon="✅"
    [[ "${expired:-0}" != "0" ]] && status_icon="⚠️"

    local payload
    payload=$(jq -n \
        --arg username    "${BOT_USERNAME:-☪️ The Muslim Lantern}" \
        --arg avatar      "$avatar" \
        --arg checked     "$checked" \
        --arg active      "$active" \
        --arg expired     "$expired" \
        --arg status_icon "$status_icon" \
        --arg rtime       "$refresh_time" \
        --arg dash_url    "$dashboard_url" \
        --arg timestamp   "$timestamp" \
        --arg bot_ver     "${RECORDER_VERSION:-2.2.0}" \
        --arg bot_name    "${RECORDER_NAME:-The Muslim Lantern}" \
        '{
            username:   $username,
            avatar_url: $avatar,
            embeds: [{
                author: {
                    name:     ("🔄  LINKS REFRESHED  ·  " + $status_icon),
                    icon_url: $avatar
                },
                title:       "Download Link Health Check",
                description: "Periodic link refresh complete. All download links have been pinged to prevent expiry.",
                color: 5763757,
                fields: [
                    { name: "🔗  Links Checked",   value: ("`" + $checked + "`"),   inline: true  },
                    { name: "✅  Active Links",    value: ("`" + $active + "`"),    inline: true  },
                    { name: "❌  Expired Links",   value: ("`" + $expired + "`"),   inline: true  },
                    { name: "🕐  Refreshed At",    value: $rtime,                   inline: false },
                    { name: "📊  Dashboard",       value: ("[Open Archive →](" + $dash_url + ")"), inline: false }
                ],
                footer: {
                    text:     ("☪️ " + $bot_name + "  ·  v" + $bot_ver),
                    icon_url: $avatar
                },
                timestamp: $timestamp
            }]
        }')

    send_discord_webhook "$payload" "refresh"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  NOTIFICATION 6: 🟢 SYSTEM HEALTH
# ═══════════════════════════════════════════════════════════════════════════════

notify_system_health() {
    log_step "Sending SYSTEM HEALTH notification..."

    local disk_space="${DISK_SPACE_GB:-N/A}"
    local cookie_status="${COOKIE_STATUS:-unknown}"
    local warp="${WARP_CONNECTED:-false}"
    local avatar="${AVATAR_URL:-}"
    local dashboard_url="${DASHBOARD_URL:-https://usermuneeb1.github.io/Stream-Recorder/}"
    local timestamp
    timestamp=$(now_utc_iso)
    local check_time
    check_time=$(now_pkt)

    local cookie_icon="🟢 Valid"
    [[ "$cookie_status" == "expired" ]]      && cookie_icon="🔴 Expired"
    [[ "$cookie_status" == "no_cookies" ]]   && cookie_icon="🟡 None"
    [[ "$cookie_status" == "check_failed" ]] && cookie_icon="❓ Unknown"

    local warp_val="🔴 Off"
    [[ "$warp" == "true" ]] && warp_val="🟢 Connected"

    local yt_dlp_ver
    yt_dlp_ver=$(yt-dlp --version 2>/dev/null || echo "N/A")

    local payload
    payload=$(jq -n \
        --arg username    "${BOT_USERNAME:-☪️ The Muslim Lantern}" \
        --arg avatar      "$avatar" \
        --arg disk        "${disk_space} GB" \
        --arg cookie_icon "$cookie_icon" \
        --arg warp_val    "$warp_val" \
        --arg yt_dlp_ver  "$yt_dlp_ver" \
        --arg check_time  "$check_time" \
        --arg dash_url    "$dashboard_url" \
        --arg timestamp   "$timestamp" \
        --arg bot_ver     "${RECORDER_VERSION:-2.2.0}" \
        --arg bot_name    "${RECORDER_NAME:-The Muslim Lantern}" \
        '{
            username:   $username,
            avatar_url: $avatar,
            embeds: [{
                author: {
                    name:     "🟢  SYSTEM HEALTH CHECK",
                    icon_url: $avatar
                },
                title:       "Recorder System Status",
                description: "Automated health check results for the stream recorder bot.",
                color: 10181046,
                fields: [
                    { name: "💾  Disk Space",   value: $disk,           inline: true  },
                    { name: "🍪  Cookies",       value: $cookie_icon,    inline: true  },
                    { name: "🌐  WARP",          value: $warp_val,       inline: true  },
                    { name: "🤖  yt-dlp",        value: ("`" + $yt_dlp_ver + "`"),  inline: true  },
                    { name: "🕐  Checked At",    value: $check_time,     inline: false },
                    { name: "📊  Dashboard",     value: ("[Open Archive →](" + $dash_url + ")"), inline: false }
                ],
                footer: {
                    text:     ("☪️ " + $bot_name + "  ·  v" + $bot_ver),
                    icon_url: $avatar
                },
                timestamp: $timestamp
            }]
        }')

    send_discord_webhook "$payload" "reports"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  NOTIFICATION 7: 🍪 COOKIE WARNING
# ═══════════════════════════════════════════════════════════════════════════════

notify_cookie_warning() {
    log_step "Sending COOKIE WARNING notification..."

    local status="${1:-expired}"
    local days_old="${2:-unknown}"
    local avatar="${AVATAR_URL:-}"
    local dashboard_url="${DASHBOARD_URL:-https://usermuneeb1.github.io/Stream-Recorder/}"
    local timestamp
    timestamp=$(now_utc_iso)
    local warn_time
    warn_time=$(now_pkt)

    local warn_title="Cookies Expired — Action Required"
    local warn_desc="Your YouTube cookies have **expired**. Recording will fail until they are renewed."
    local warn_color=15158332
    if [[ "$status" == "warning" ]]; then
        warn_title="Cookie Expiry Warning — Update Soon"
        warn_desc="Your YouTube cookies are getting old (**${days_old} days**). They may expire soon. Update them proactively to avoid missed recordings."
        warn_color=16744448
    fi

    local payload
    payload=$(jq -n \
        --arg username    "${BOT_USERNAME:-☪️ The Muslim Lantern}" \
        --arg avatar      "$avatar" \
        --arg warn_title  "$warn_title" \
        --arg warn_desc   "$warn_desc" \
        --arg status      "$status" \
        --arg days_old    "$days_old" \
        --arg warn_time   "$warn_time" \
        --arg timestamp   "$timestamp" \
        --arg bot_ver     "${RECORDER_VERSION:-2.2.0}" \
        --arg bot_name    "${RECORDER_NAME:-The Muslim Lantern}" \
        --arg color       "$warn_color" \
        '{
            username:   $username,
            avatar_url: $avatar,
            embeds: [{
                author: {
                    name:     ("🍪  COOKIE ALERT  ·  " + $status),
                    icon_url: $avatar
                },
                title:       $warn_title,
                description: $warn_desc,
                color: ($color | tonumber),
                fields: [
                    { name: "📅  Cookie Age",    value: ("`" + $days_old + " days`"),  inline: true  },
                    { name: "⚠️  Status",        value: ("`" + $status + "`"),         inline: true  },
                    { name: "🕐  Alert At",       value: $warn_time,                   inline: true  },
                    {
                        name:  "🔧  How to Fix (3 steps)",
                        value: (
                            "**1.** Open Chrome → YouTube → sign in\n" +
                            "**2.** Install *EditThisCookie* → Export cookies\n" +
                            "**3.** `base64 cookies.txt` → paste into **YOUTUBE_COOKIES** secret\n\n" +
                            "*Go to: GitHub → Settings → Secrets → Actions → YOUTUBE_COOKIES*"
                        ),
                        inline: false
                    }
                ],
                footer: {
                    text:     ("☪️ " + $bot_name + "  ·  v" + $bot_ver + "  ·  UPDATE COOKIES TO RESTORE RECORDING"),
                    icon_url: $avatar
                },
                timestamp: $timestamp
            }]
        }')

    send_discord_webhook "$payload" "alerts"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
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
