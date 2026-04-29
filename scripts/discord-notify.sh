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
    local url=""
    case "$type" in
        alerts)      url="${DISCORD_WEBHOOK_ALERTS:-${DISCORD_WEBHOOK_URL:-}}" ;;
        recordings)  url="${DISCORD_WEBHOOK_RECORDINGS:-${DISCORD_WEBHOOK_URL:-}}" ;;
        refresh)     url="${DISCORD_WEBHOOK_LINKS:-${DISCORD_WEBHOOK_URL:-}}" ;;
        reports)     url="${DISCORD_WEBHOOK_REPORTS:-${DISCORD_WEBHOOK_URL:-}}" ;;
        *)           url="${DISCORD_WEBHOOK_URL:-}" ;;
    esac
    echo "$url"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  CORE WEBHOOK SENDER
# ═══════════════════════════════════════════════════════════════════════════════

send_discord_webhook() {
    local payload="$1"
    local channel_type="${2:-default}"
    local wait_id_file="${3:-}"
    local webhook_url
    webhook_url=$(get_webhook_url "$channel_type")

    if [[ -z "$webhook_url" ]]; then
        log_warn "No Discord webhook for '${channel_type}' — skipping embed"
        return 0
    fi

    local req_url="$webhook_url"
    [[ -n "$wait_id_file" ]] && req_url="${webhook_url}?wait=true"

    # Write payload to temp file to avoid shell arg length limits
    local payload_tmp out_tmp
    payload_tmp=$(mktemp)
    out_tmp=$(mktemp)
    printf '%s' "$payload" > "$payload_tmp"

    local http_code
    http_code=$(curl -s -o "$out_tmp" -w '%{http_code}' \
        --max-time 30 \
        -H "Content-Type: application/json" \
        -d "@${payload_tmp}" \
        "$req_url" 2>/dev/null)

    rm -f "$payload_tmp"

    if [[ "$http_code" =~ ^2[0-9]{2}$ ]]; then
        log_ok "Discord notification sent to [${channel_type}] (HTTP ${http_code})"
        if [[ -n "$wait_id_file" ]]; then
            jq -r '.id // empty' "$out_tmp" > "$wait_id_file" 2>/dev/null || true
        fi
        rm -f "$out_tmp"
        return 0
    fi

    log_error "Discord notification FAILED (HTTP ${http_code})"
    local err_body
    err_body=$(cat "$out_tmp" 2>/dev/null)
    [[ -n "$err_body" ]] && log_debug "  Discord response: ${err_body:0:300}"
    rm -f "$out_tmp"
    return 1
}

patch_discord_webhook() {
    local payload="$1"
    local channel_type="${2:-default}"
    local message_id="$3"
    
    local webhook_url
    webhook_url=$(get_webhook_url "$channel_type")
    
    if [[ -z "$webhook_url" ]] || [[ -z "$message_id" ]] || [[ "$message_id" == "null" ]]; then
        return 1
    fi
    
    local patch_url="${webhook_url}/messages/${message_id}"
    local payload_tmp
    payload_tmp=$(mktemp)
    printf '%s' "$payload" > "$payload_tmp"
    
    local http_code
    http_code=$(curl -s -o /dev/null -w '%{http_code}' \
        -X PATCH \
        --max-time 30 \
        -H "Content-Type: application/json" \
        -d "@${payload_tmp}" \
        "$patch_url" 2>/dev/null)
    
    rm -f "$payload_tmp"
        
    if [[ "$http_code" =~ ^2[0-9]{2}$ ]]; then
        log_ok "Discord message patched successfully [${channel_type}] (HTTP ${http_code})"
        return 0
    fi
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
    local video_id="${STREAM_VIDEO_ID:-}"
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

    # Resolve best working thumbnail URL (tests maxres → sd → hq → mq)
    if [[ -n "$video_id" ]]; then
        local resolved_thumb
        resolved_thumb=$(resolve_youtube_thumbnail "$video_id")
        [[ -n "$resolved_thumb" ]] && thumbnail="$resolved_thumb"
        log_info "  Thumbnail resolved: $thumbnail"
    fi

    local payload
    payload=$(jq -n \
        --arg username    "${BOT_USERNAME:-☪️ The Muslim Lantern}" \
        --arg avatar      "$avatar" \
        --arg title       "$title" \
        --arg channel     "$channel" \
        --arg url         "$video_url" \
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
        --arg repo_url    "https://github.com/${GITHUB_REPOSITORY:-usermuneeb1/Stream-Recorder}" \
        '{
            username:   $username,
            avatar_url: $avatar,
            embeds: [{
                author: {
                    name:     ("🔴  LIVE NOW  ─  " + $channel),
                    icon_url: $avatar,
                    url:      $url
                },
                title:       ("🎬  " + $title),
                url:         $url,
                description: (
                    "> 🔴 **STREAM IS LIVE — RECORDING STARTED**\n" +
                    "> \n" +
                    "> A live stream from **" + $channel + "** has been\n" +
                    "> detected and recording is now **active**.\n" +
                    "\n" +
                    "╔══════════════════════════════════════╗\n" +
                    "║  🎯 **Recording Engine Active**            ║\n" +
                    "║  6 methods × 3 retries = 18 chances    ║\n" +
                    "║  ☁️ Triple cloud upload on completion    ║\n" +
                    "╚══════════════════════════════════════╝"
                ),
                color: 16711680,
                image: { url: $thumbnail },
                fields: [
                    { name: "⸻⸻⸻⸻⸻⸻⸻", value: "**📡  System Status**", inline: false },
                    { name: "🕐  Detected",      value: $dtime,                inline: true  },
                    { name: "🔍  Method",         value: ("`" + $method + "`"), inline: true  },
                    { name: "🍪  Cookies",        value: $cookie,              inline: true  },
                    { name: "💾  Disk Free",      value: $disk,                inline: true  },
                    { name: "🌐  WARP",           value: $warp,                inline: true  },
                    { name: "🎛️  Status",        value: "```diff\n+ 🔴 LIVE — RECORDING IN PROGRESS\n```", inline: false }
                ],
                footer: {
                    text:     ("☪️ " + $bot_name + " v" + $bot_ver + "  ·  Recording in progress…  ·  Made with ❤️ by Muneeb Ahmad"),
                    icon_url: $avatar
                },
                timestamp: $timestamp
            }],
            components: [
                {
                    type: 1,
                    components: [
                        { type: 2, style: 5, label: "🔴 Watch Live", url: $url },
                        { type: 2, style: 5, label: "📊 Dashboard", url: $dash_url },
                        { type: 2, style: 5, label: "⚙️ Actions", url: ($repo_url + "/actions") }
                    ]
                }
            ]
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
    local video_id="${STREAM_VIDEO_ID:-}"
    local avatar="${AVATAR_URL:-}"
    local dashboard_url="${DASHBOARD_URL:-https://usermuneeb1.github.io/Stream-Recorder/}"
    local timestamp
    timestamp=$(now_utc_iso)
    
    # Resolve best working thumbnail
    if [[ -n "$video_id" ]]; then
        local resolved_thumb
        resolved_thumb=$(resolve_youtube_thumbnail "$video_id")
        [[ -n "$resolved_thumb" ]] && thumbnail="$resolved_thumb"
    fi

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
    # HD links (first entry or "HD" tagged)
    local gofile_url="" pixeldrain_url="" archive_url="" archive_id=""
    local streamtape_url=""
    # Compressed links
    local gofile_comp="" pixeldrain_comp="" archive_comp="" streamtape_comp=""
    
    if [[ -n "${GOFILE_LINKS:-}" ]]; then
        IFS=';' read -ra _g <<< "${GOFILE_LINKS}"
        for entry in "${_g[@]}"; do
            local _part _link
            _part=$(echo "$entry" | cut -d'|' -f1)
            _link=$(echo "$entry" | cut -d'|' -f2)
            if [[ "$_part" == "Compressed" ]]; then
                gofile_comp="$_link"
            elif [[ -z "$gofile_url" ]]; then
                gofile_url="$_link"
            fi
        done
    fi
    if [[ -n "${PIXELDRAIN_LINKS:-}" ]]; then
        IFS=';' read -ra _p <<< "${PIXELDRAIN_LINKS}"
        for entry in "${_p[@]}"; do
            local _part _link
            _part=$(echo "$entry" | cut -d'|' -f1)
            _link=$(echo "$entry" | cut -d'|' -f2)
            if [[ "$_part" == "Compressed" ]]; then
                pixeldrain_comp="$_link"
            elif [[ -z "$pixeldrain_url" ]]; then
                pixeldrain_url="$_link"
            fi
        done
    fi
    if [[ -n "${ARCHIVE_LINKS:-}" ]]; then
        IFS=';' read -ra _a <<< "${ARCHIVE_LINKS}"
        for entry in "${_a[@]}"; do
            local _part _link _id
            _part=$(echo "$entry" | cut -d'|' -f1)
            _link=$(echo "$entry" | cut -d'|' -f2)
            _id=$(echo "$entry" | cut -d'|' -f3)
            if [[ "$_part" == "Compressed" ]]; then
                archive_comp="$_link"
            elif [[ -z "$archive_url" ]]; then
                archive_url="$_link"
                archive_id="$_id"
            fi
        done
    fi
    if [[ -n "${STREAMTAPE_LINKS:-}" ]]; then
        IFS=';' read -ra _st <<< "${STREAMTAPE_LINKS}"
        for entry in "${_st[@]}"; do
            local _part _link
            _part=$(echo "$entry" | cut -d'|' -f1)
            _link=$(echo "$entry" | cut -d'|' -f2)
            if [[ "$_part" == "Compressed" ]]; then
                streamtape_comp="$_link"
            elif [[ -z "$streamtape_url" ]]; then
                streamtape_url="$_link"
            fi
        done
    fi

    local chat_status="❌ Not archived"
    [[ -n "${RECORD_CHAT_URL:-}" ]] && chat_status="✅ [Chat Log Available](${RECORD_CHAT_URL})"

    # Build upload status summary line
    local upstatus=""
    upstatus+=$(if [[ -n "$pixeldrain_url" ]]; then echo "🔵 Pixeldrain ✅"; else echo "🔵 Pixeldrain ❌"; fi)
    upstatus+=" · "
    upstatus+=$(if [[ -n "$gofile_url" ]]; then echo "🟠 Gofile ✅"; else echo "🟠 Gofile ❌"; fi)
    upstatus+=" · "
    upstatus+=$(if [[ -n "$streamtape_url" ]]; then echo "🎥 Streamtape ✅"; else echo "🎥 Streamtape ❌"; fi)
    upstatus+=" · "
    upstatus+=$(if [[ -n "$archive_url" ]]; then echo "🏛 Archive.org ✅"; else echo "🏛 Archive.org ❌"; fi)
    
    # Compressed info
    local comp_info="${COMPRESSED_SIZE_HUMAN:-}"
    local comp_reduction="${COMPRESSED_REDUCTION:-}"

    local payload
    payload=$(jq -n \
        --arg username       "${BOT_USERNAME:-☪️ The Muslim Lantern}" \
        --arg avatar         "$avatar" \
        --arg title          "$title" \
        --arg channel        "$channel" \
        --arg video_url      "$video_url" \
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
        --arg streamtape_url "$streamtape_url" \
        --arg gofile_comp    "$gofile_comp" \
        --arg pixeldrain_comp "$pixeldrain_comp" \
        --arg streamtape_comp "$streamtape_comp" \
        --arg archive_comp   "$archive_comp" \
        --arg comp_info      "$comp_info" \
        --arg comp_reduction "$comp_reduction" \
        --arg chat_status    "$chat_status" \
        --arg dash_url       "$dashboard_url" \
        --arg timestamp      "$timestamp" \
        --arg bot_ver        "${RECORDER_VERSION:-3.0.0}" \
        --arg bot_name       "${RECORDER_NAME:-The Muslim Lantern}" \
        --arg repo_url       "https://github.com/${GITHUB_REPOSITORY:-usermuneeb1/Stream-Recorder}" \
        --argjson color      "$color" \
        '{
            username:   $username,
            avatar_url: $avatar,
            embeds: [
              {
                author: {
                    name:     ("✅  ARCHIVED SUCCESSFULLY  ─  " + $channel),
                    url:      $video_url,
                    icon_url: $avatar
                },
                title:       ("🔥  " + $title),
                url:         $video_url,
                description: (
                    "> **" + $channel + "** live stream has been **recorded**, **processed**, and\n" +
                    "> **uploaded** to the cloud archive.\n" +
                    "\n" +
                    "```ansi\n" +
                    "\u001b[1;32m╔══════════════════════════════════════╗\u001b[0m\n" +
                    "\u001b[1;32m║\u001b[0m  ⏱  Duration   " + $duration + "\n" +
                    "\u001b[1;32m║\u001b[0m  💾  File Size  " + $size + "\n" +
                    "\u001b[1;32m║\u001b[0m  📐  Resolution " + $resolution + "\n" +
                    "\u001b[1;32m║\u001b[0m  📅  Date       " + $date + "\n" +
                    "\u001b[1;32m║\u001b[0m  📦  Parts      " + $parts + "\n" +
                    "\u001b[1;32m║\u001b[0m  ☁️  Uploads   " + $uploads + " services\n" +
                    "\u001b[1;32m╚══════════════════════════════════════╝\u001b[0m\n" +
                    "```"
                ),
                color: $color,
                thumbnail: { url: $thumbnail },
                fields: (
                    [
                        { name: "⸻⸻⸻⸻⸻⸻⸻", value: ("**☁️  Upload Status**\n" + $upstatus), inline: false },
                        
                        (if ($pixeldrain_url != "" or $gofile_url != "" or $archive_url != "") then
                            { name: "╔══  📀 HD  ══════════════════════╗", value: ("**Original quality** • " + $size), inline: false }
                        else empty end),
                        (if $pixeldrain_url != "" then { name: "🔵  Pixeldrain",     value: ("[▶️ Watch / ⬇️ Download](" + $pixeldrain_url + ")"),    inline: true } else empty end),
                        (if $gofile_url     != "" then { name: "🟠  Gofile",         value: ("[▶️ Watch / ⬇️ Download](" + $gofile_url + ")"),         inline: true } else empty end),
                        (if $streamtape_url != "" then { name: "🎥  Streamtape",     value: ("[▶️ Stream / ⬇️ Download](" + $streamtape_url + ")"),    inline: true } else empty end),
                        (if $archive_url    != "" then { name: "🏛️  Archive.org",  value: ("[🔗 Permanent Link](" + $archive_url + ")\n`" + $archive_id + "`"), inline: false } else empty end),
                        
                        (if ($pixeldrain_comp != "" or $gofile_comp != "" or $streamtape_comp != "" or $archive_comp != "") then
                            { name: ("╔══  📱 Compressed (" + $comp_info + " • " + $comp_reduction + " smaller)  ══╗"), value: "**480p** • Tiny file size • For storage", inline: false }
                        else empty end),
                        (if $pixeldrain_comp != "" then { name: "🔵  Pixeldrain",  value: ("[⬇️ Quick Download](" + $pixeldrain_comp + ")"), inline: true } else empty end),
                        (if $gofile_comp     != "" then { name: "🟠  Gofile",      value: ("[⬇️ Quick Download](" + $gofile_comp + ")"),     inline: true } else empty end),
                        (if $streamtape_comp != "" then { name: "🎥  Streamtape",  value: ("[⬇️ Quick Download](" + $streamtape_comp + ")"), inline: true } else empty end),
                        (if $archive_comp    != "" then { name: "🏛️  Archive.org", value: ("[🔗 Permanent](" + $archive_comp + ")"),          inline: false } else empty end),
                        
                        (if ($pixeldrain_url == "" and $gofile_url == "" and $archive_url == "") then
                            { name: "❌  Downloads",  value: "All cloud uploads failed — files may be lost. Check workflow logs.", inline: false }
                        else empty end),
                        { name: "⸻⸻⸻⸻⸻⸻⸻", value: "**📋  Additional Info**", inline: false },
                        { name: "💬  Live Chat",    value: $chat_status,   inline: true },
                        { name: "📺  Original",     value: ("[Watch on YT](" + $video_url + ")"), inline: true }
                    ]
                ),
                footer: {
                    text:     ("☪️ " + $bot_name + " v" + $bot_ver + "  ·  Permanently Archived  ·  Made with ❤️ by Muneeb Ahmad"),
                    icon_url: $avatar
                },
                timestamp: $timestamp
              }
            ],
            components: [
                {
                    type: 1,
                    components: (
                        [
                            (if $pixeldrain_url != "" then { type: 2, style: 5, label: "📀 Download HD", url: $pixeldrain_url } else empty end),
                            (if $pixeldrain_comp != "" then { type: 2, style: 5, label: "📱 Compressed", url: $pixeldrain_comp }
                             elif $gofile_comp != "" then { type: 2, style: 5, label: "📱 Compressed", url: $gofile_comp }
                             else empty end),
                            { type: 2, style: 5, label: "📺 Watch Original", url: $video_url },
                            { type: 2, style: 5, label: "📊 Dashboard", url: $dash_url }
                        ]
                    )
                },
                (if $archive_url != "" then
                {
                    type: 1,
                    components: [
                        { type: 2, style: 5, label: "🏛️ Archive.org (Permanent)", url: $archive_url }
                    ]
                } else empty end)
            ]
        }')

    # Capture Message ID
    local id_file
    id_file=$(mktemp)
    if send_discord_webhook "$payload" "recordings" "$id_file"; then
        local msg_id
        msg_id=$(cat "$id_file" 2>/dev/null || echo "")
        rm -f "$id_file"
        if [[ -n "$msg_id" ]]; then
            export RECORD_DISCORD_MSG_ID="$msg_id"
        fi
    else
        rm -f "$id_file"
    fi
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
    local video_id="${STREAM_VIDEO_ID:-}"
    local avatar="${AVATAR_URL:-}"
    local dashboard_url="${DASHBOARD_URL:-https://usermuneeb1.github.io/Stream-Recorder/}"
    local timestamp
    timestamp=$(now_utc_iso)
    
    # Resolve best working thumbnail
    if [[ -n "$video_id" ]]; then
        local resolved_thumb
        resolved_thumb=$(resolve_youtube_thumbnail "$video_id")
        [[ -n "$resolved_thumb" ]] && thumbnail="$resolved_thumb"
    fi
    
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
        --arg bot_ver     "${RECORDER_VERSION:-3.0.0}" \
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
                    text:     ("☪️ " + $bot_name + " v" + $bot_ver + "  ·  Auto-retry dispatched  ·  Made with ❤️ by Muneeb Ahmad"),
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
    local week_streams="${WEEK_STREAMS:-0}"
    local week_hours="${WEEK_HOURS:-0}"
    local week_gb="${WEEK_GB:-0}"
    local avg_duration="${LIFETIME_AVG_DURATION:-0}"
    local avatar="${AVATAR_URL:-}"
    local timestamp
    timestamp=$(now_utc_iso)
    
    # Calculate dynamically string dates for "Apr 13 — Apr 17, 2026"
    local start_date
    start_date=$(date -d "7 days ago" '+%b %d' 2>/dev/null || date -v-7d '+%b %d' 2>/dev/null || echo "1 Week Ago")
    local end_date
    end_date=$(date '+%b %d, %Y')
    
    local greeting="😴 No Activity"
    local status="No streams recorded this week 😴"
    if [[ "$week_streams" != "0" ]]; then
        greeting="🎉 Great Week"
        status="${week_streams} streams successfully archived."
    fi

    local payload
    payload=$(jq -n \
        --arg username       "${BOT_USERNAME:-☪️ The Muslim Lantern}" \
        --arg avatar         "$avatar" \
        --arg total_streams  "$total_streams" \
        --arg total_hours    "$total_hours" \
        --arg total_gb       "$total_gb" \
        --arg week_streams   "$week_streams" \
        --arg week_hours     "$week_hours" \
        --arg week_gb        "$week_gb" \
        --arg avg_duration   "$avg_duration" \
        --arg date_range     "${start_date} — ${end_date}" \
        --arg greeting       "$greeting" \
        --arg status         "$status" \
        --arg timestamp      "$timestamp" \
        --arg bot_ver        "${RECORDER_VERSION:-2.2.0}" \
        --arg bot_name       "${RECORDER_NAME:-The Muslim Lantern}" \
        '{
            username:   $username,
            avatar_url: $avatar,
            embeds: [{
                author: {
                    name:     "The Muslim Lantern • Weekly Report",
                    icon_url: $avatar
                },
                title: ("📊  WEEKLY PERFORMANCE REPORT\n" + $date_range),
                description: (
                    $greeting + " — Here'\''s your automated recording system'\''s weekly performance breakdown.\n\n" +
                    "━━━━━ This Week ━━━━━\n" + 
                    "📹  **Streams**\n" + $week_streams + " recorded\n" +
                    "⏱️  **Hours**\n" + $week_hours + "h captured\n" +
                    "💾  **Storage**\n" + $week_gb + " GB saved\n" +
                    "📏  **Avg Duration**\n" + $avg_duration + "h per stream\n" +
                    "☁️  **Uploads**\nAll links active ✅\n" +
                    "🛡️  **System**\n🟢 Operational\n\n" +
                    
                    "━━━━━ Recordings ━━━━━\n" +
                    "📝  **This Week'\''s Streams**\n" + $status + "\n\n" +
                    
                    "━━━━━ All-Time Stats ━━━━━\n" +
                    "🏆  **Total Streams**\n" + $total_streams + "\n" +
                    "⏰  **Total Hours**\n" + $total_hours + "h\n" +
                    "📦  **Total Storage**\n" + $total_gb + " GB\n"
                ),
                color: 5793522,
                footer: {
                    text:     ("☪️ " + $bot_name + " v" + $bot_ver + "  ·  Weekly Report  ·  Made with ❤️ by Muneeb Ahmad"),
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
        --arg bot_ver     "${RECORDER_VERSION:-3.0.0}" \
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
                description: (
                    "Periodic link refresh complete. All download links have been pinged to prevent expiry.\n\n" +
                    "> 📁 **Gofile** — Expires after 10 days of inactivity\n" +
                    "> 💧 **Pixeldrain** — Expires after 60 days of inactivity\n" +
                    "> 🏛️ **Archive.org** — Permanently safely archived"
                ),
                color: 5763757,
                fields: [
                    { name: "🔗  Links Checked",   value: ("`" + $checked + "`"),   inline: true  },
                    { name: "✅  Active Links",    value: ("`" + $active + "`"),    inline: true  },
                    { name: "❌  Expired Links",   value: ("`" + $expired + "`"),   inline: true  },
                    { name: "🕐  Refreshed At",    value: $rtime,                   inline: false }
                ],
                footer: {
                    text:     ("☪️ " + $bot_name + " v" + $bot_ver + "  ·  Link Refresh  ·  Made with ❤️ by Muneeb Ahmad"),
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
        --arg bot_ver     "${RECORDER_VERSION:-3.0.0}" \
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
                    text:     ("☪️ " + $bot_name + " v" + $bot_ver + "  ·  System Health  ·  Made with ❤️ by Muneeb Ahmad"),
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
        --arg bot_ver     "${RECORDER_VERSION:-3.0.0}" \
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
                    text:     ("☪️ " + $bot_name + " v" + $bot_ver + "  ·  ⚠️ UPDATE COOKIES  ·  Made with ❤️ by Muneeb Ahmad"),
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
