#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  📡 STREAM RECORDER — TRIPLE-LAYER LIVE STREAM DETECTION                   ║
# ║  Uses 3 independent methods to detect if a YouTube channel is live.         ║
# ║  If ANY method detects a live stream → proceed to recording.               ║
# ║  If ALL methods find nothing → exit silently.                              ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

# ═══════════════════════════════════════════════════════════════════════════════
#  GLOBAL VARIABLES — set by detection methods
# ═══════════════════════════════════════════════════════════════════════════════

DETECTED_VIDEO_ID=""
DETECTED_TITLE=""
DETECTED_CHANNEL=""
DETECTED_THUMBNAIL=""
DETECTED_METHOD=""
DETECTED_URL=""

# ═══════════════════════════════════════════════════════════════════════════════
#  URL SANITIZER
#  Handles whether the user entered a raw handle or a full YouTube URL
# ═══════════════════════════════════════════════════════════════════════════════

get_live_url() {
    local channel_input
    channel_input=$(echo "${YOUTUBE_CHANNEL_ID:-$DEFAULT_CHANNEL_HANDLE}" | tr -d '[:space:]')
    local channel_handle
    
    if [[ "$channel_input" =~ youtube\.com/([^/\?]+) ]]; then
        channel_handle="${BASH_REMATCH[1]}"
    else
        channel_handle="$channel_input"
    fi
    
    # Ensure it has @ if not a channel/ format
    if [[ "$channel_handle" != "@"* ]] && [[ "$channel_handle" != "channel/"* ]] && [[ "$channel_handle" != "c/"* ]]; then
        channel_handle="@${channel_handle}"
    fi
    
    echo "https://www.youtube.com/${channel_handle}/live"
}

get_streams_url() {
    local channel_input
    channel_input=$(echo "${YOUTUBE_CHANNEL_ID:-$DEFAULT_CHANNEL_HANDLE}" | tr -d '[:space:]')
    local channel_handle
    
    if [[ "$channel_input" =~ youtube\.com/([^/\?]+) ]]; then
        channel_handle="${BASH_REMATCH[1]}"
    else
        channel_handle="$channel_input"
    fi
    
    if [[ "$channel_handle" != "@"* ]] && [[ "$channel_handle" != "channel/"* ]] && [[ "$channel_handle" != "c/"* ]]; then
        channel_handle="@${channel_handle}"
    fi
    
    echo "https://www.youtube.com/${channel_handle}/streams"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  METHOD 1: /live Redirect Check (Fastest — 1-2 seconds)
#  Checks if youtube.com/@channel/live redirects to a video page
# ═══════════════════════════════════════════════════════════════════════════════

detect_method_1_redirect() {
    log_step "Method 1: Checking /live redirect..."
    
    local live_url
    live_url=$(get_live_url)
    local user_agent
    user_agent=$(rotate_user_agent)
    
    # Follow redirects and capture the final URL
    local bypass_cookie="CONSENT=YES+cb.20230101-00-p0.en+FX+414; SOCS=CAI"
    local final_url
    final_url=$(curl -sL -o /dev/null -w '%{url_effective}' \
        --max-time 15 \
        -H "User-Agent: ${user_agent}" \
        -H "Cookie: ${bypass_cookie}" \
        -H "Accept-Language: en-US,en;q=0.9" \
        -H "Accept: text/html,application/xhtml+xml" \
        "$live_url" 2>/dev/null) || {
        log_warn "Method 1: curl failed"
        return 1
    }
    
    log_debug "Method 1: Final URL = ${final_url}"
    
    # Check if it redirected to a video (contains /watch?v= or video ID in URL)
    local video_id=""
    if [[ "$final_url" =~ watch\?v=([a-zA-Z0-9_-]{11}) ]]; then
        video_id="${BASH_REMATCH[1]}"
    elif [[ "$final_url" =~ /live/([a-zA-Z0-9_-]{11}) ]]; then
        video_id="${BASH_REMATCH[1]}"
    elif [[ "$final_url" =~ youtu\.be/([a-zA-Z0-9_-]{11}) ]]; then
        video_id="${BASH_REMATCH[1]}"
    fi
    
    if [[ -z "$video_id" ]]; then
        log_info "Method 1: No live stream detected (no redirect to video)"
        return 1
    fi
    
    log_info "Method 1: Found video ID = ${video_id}"
    
    # Verify it's actually live by fetching the page
    random_sleep 1 3
    local page_content
    page_content=$(curl -s --max-time 15 \
        -H "User-Agent: ${user_agent}" \
        -H "Accept-Language: en-US,en;q=0.9" \
        "https://www.youtube.com/watch?v=${video_id}" 2>/dev/null) || {
        log_warn "Method 1: Failed to fetch video page"
        return 1
    }
    
    # Check for live indicators (strictly isLiveNow to avoid VOD false positives)
    if ! grep -qE '"isLiveNow"\s*:\s*true' <<< "$page_content"; then
        log_info "Method 1: Video found but NOT currently live"
        return 1
    fi
    
    # Extract metadata from page
    local title=""
    title=$(grep -oP '"title"\s*:\s*"\K[^"]+' <<< "$page_content" | head -1 || echo "")
    [[ -z "$title" ]] && title=$(grep -oP '<title>\K[^<]+' <<< "$page_content" | head -1 | sed 's/ - YouTube$//' || echo "")
    
    local channel=""
    channel=$(grep -oP '"ownerChannelName"\s*:\s*"\K[^"]+' <<< "$page_content" | head -1 || echo "")
    [[ -z "$channel" ]] && channel=$(grep -oP '"author"\s*:\s*"\K[^"]+' <<< "$page_content" | head -1 || echo "")
    
    local thumbnail="https://i.ytimg.com/vi/${video_id}/maxresdefault_live.jpg"
    
    # Set global variables
    DETECTED_VIDEO_ID="$video_id"
    DETECTED_TITLE="${title:-Live Stream}"
    DETECTED_CHANNEL="${channel:-Unknown Channel}"
    DETECTED_THUMBNAIL="$thumbnail"
    DETECTED_METHOD="Redirect Check (/live)"
    DETECTED_URL="https://www.youtube.com/watch?v=${video_id}"
    
    log_ok "Method 1: ✅ LIVE DETECTED — ${DETECTED_TITLE}"
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
#  METHOD 2: yt-dlp JSON Dump (Reliable — 5-10 seconds)
#  Uses yt-dlp to get stream metadata and check live status
# ═══════════════════════════════════════════════════════════════════════════════

detect_method_2_ytdlp() {
    log_step "Method 2: yt-dlp JSON dump..."
    
    local live_url
    live_url=$(get_live_url)
    local cookies_arg=""
    
    # Use cookies if available and not explicitly expired
    if [[ -f "cookies.txt" ]] && [[ -s "cookies.txt" ]] && [[ "$COOKIE_STATUS" != "expired" ]]; then
        cookies_arg="--cookies cookies.txt"
    fi
    
    local user_agent
    user_agent=$(rotate_user_agent)
    
    # Try yt-dlp dump-json
    local json_output
    json_output=$(timeout 30 yt-dlp \
        --dump-json \
        --no-download \
        --no-playlist \
        --user-agent "$user_agent" \
        --extractor-args "youtube:player_client=web" \
        $cookies_arg \
        "$live_url" 2>/dev/null) || {
        log_warn "Method 2: yt-dlp dump-json failed"
        return 1
    }
    
    if [[ -z "$json_output" ]]; then
        log_info "Method 2: No JSON output"
        return 1
    fi
    
    # Check if stream is live
    local is_live live_status
    is_live=$(echo "$json_output" | jq -r '.is_live // false' 2>/dev/null)
    live_status=$(echo "$json_output" | jq -r '.live_status // "not_live"' 2>/dev/null)
    
    if [[ "$is_live" != "true" ]] && [[ "$live_status" != "is_live" ]]; then
        log_info "Method 2: Stream is not live (is_live=${is_live}, live_status=${live_status})"
        return 1
    fi
    
    # Extract metadata
    local video_id title channel thumbnail
    video_id=$(echo "$json_output" | jq -r '.id // empty' 2>/dev/null)
    title=$(echo "$json_output" | jq -r '.title // "Live Stream"' 2>/dev/null)
    channel=$(echo "$json_output" | jq -r '.channel // .uploader // "Unknown"' 2>/dev/null)
    thumbnail=$(echo "$json_output" | jq -r '.thumbnail // empty' 2>/dev/null)
    
    if [[ -z "$video_id" ]]; then
        log_warn "Method 2: Could not extract video ID"
        return 1
    fi
    
    [[ -z "$thumbnail" ]] && thumbnail="https://i.ytimg.com/vi/${video_id}/maxresdefault_live.jpg"
    
    # Set global variables
    DETECTED_VIDEO_ID="$video_id"
    DETECTED_TITLE="$title"
    DETECTED_CHANNEL="$channel"
    DETECTED_THUMBNAIL="$thumbnail"
    DETECTED_METHOD="yt-dlp JSON Dump"
    DETECTED_URL="https://www.youtube.com/watch?v=${video_id}"
    
    log_ok "Method 2: ✅ LIVE DETECTED — ${DETECTED_TITLE}"
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
#  METHOD 3: /streams Tab Scan (Most Thorough — 10-20 seconds)
#  Scans the channel's Streams tab for any currently live video
# ═══════════════════════════════════════════════════════════════════════════════

detect_method_3_streams_tab() {
    log_step "Method 3: Scanning /streams tab..."
    
    local streams_url
    streams_url=$(get_streams_url)
    local user_agent
    user_agent=$(rotate_user_agent)
    
    # Fetch the streams tab
    local bypass_cookie="CONSENT=YES+cb.20230101-00-p0.en+FX+414; SOCS=CAI"
    local page_content
    page_content=$(curl -s --max-time 20 \
        -H "User-Agent: ${user_agent}" \
        -H "Cookie: ${bypass_cookie}" \
        -H "Accept-Language: en-US,en;q=0.9" \
        -H "Accept: text/html,application/xhtml+xml" \
        "$streams_url" 2>/dev/null) || {
        log_warn "Method 3: Failed to fetch /streams tab"
        return 1
    }
    
    if [[ -z "$page_content" ]]; then
        log_info "Method 3: Empty page response"
        return 1
    fi
    
    # Quickly parse the HTML to find a video tied to the LIVE badge
    # By splitting the HTML at each videoId, we correctly constrain the search to that video's metadata block
    local live_video_id
    live_video_id=$(echo "$page_content" | awk -F'"videoId":"' '{
        for(i=2; i<=NF; i++) {
            vid = substr($i, 1, 11);
            if ($i ~ /"style":"LIVE"/) {
                print vid;
                exit;
            }
        }
    }')
    
    if [[ -z "$live_video_id" ]]; then
        log_info "Method 3: No live streams found on /streams tab"
        return 1
    fi
    
    local video_id="$live_video_id"
    log_info "Method 3: Video ${video_id} is LIVE!"
    
    # Extract title from the video block in the HTML
    local title
    title=$(echo "$page_content" | awk -F'"videoId":"'"$video_id"'"' '{
        split($2, a, "\"text\":\"");
        if (length(a) > 1) {
            split(a[2], b, "\"");
            print b[1];
        }
    }' | head -1)
    [[ -z "$title" ]] && title=$(echo "$page_content" | grep -oP '"title":\{"runs":\[\{"text":"\K[^"]+' | head -1 || true)
    [[ -z "$title" ]] && title="Live Stream"
    
    # Extract channel name from the page
    local channel
    channel=$(echo "$page_content" | grep -oP '"channelName":"\K[^"]+' | head -1 || true)
    [[ -z "$channel" ]] && channel=$(echo "$page_content" | grep -oP '"ownerChannelName":"\K[^"]+' | head -1 || true)
    [[ -z "$channel" ]] && channel=$(echo "$page_content" | grep -oP '"c4TabbedHeaderRenderer".*?"title":"\K[^"]+' | head -1 || true)
    # Fallback: extract from page metadata
    [[ -z "$channel" ]] && channel=$(echo "$page_content" | grep -oP '<link itemprop="name" content="\K[^"]+' | head -1 || true)
    [[ -z "$channel" ]] && channel=$(echo "$page_content" | grep -oP '"author":"\K[^"]+' | head -1 || true)
    [[ -z "$channel" ]] && {
        # Last resort: extract from the URL handle
        local handle
        handle=$(echo "${YOUTUBE_CHANNEL_ID:-}" | grep -oP '@\K[^/]+' || true)
        channel="${handle:-Unknown Channel}"
    }
    
    DETECTED_VIDEO_ID="$video_id"
    DETECTED_TITLE="$title"
    DETECTED_CHANNEL="$channel"
    DETECTED_THUMBNAIL="https://i.ytimg.com/vi/${video_id}/maxresdefault_live.jpg"
    DETECTED_METHOD="Streams Tab Scan"
    DETECTED_URL="https://www.youtube.com/watch?v=${video_id}"
    
    log_ok "Method 3: ✅ LIVE DETECTED — ${DETECTED_TITLE} by ${DETECTED_CHANNEL}"
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN DETECTION ORCHESTRATOR
#  Runs all 3 methods sequentially. Stops at first detection.
# ═══════════════════════════════════════════════════════════════════════════════

detect_live_stream() {
    log_header "🔍 LIVE STREAM DETECTION"
    
    local channel="${YOUTUBE_CHANNEL_ID:-$DEFAULT_CHANNEL_HANDLE}"
    log_info "Monitoring channel: ${channel}"
    log_info "Detection started at: $(now_pkt)"
    log_separator
    
    # ── Method 1: Redirect Check (fastest) ───────────────────────────────────
    if detect_method_1_redirect; then
        _export_detection_results || return 1
        return 0
    fi
    
    random_sleep 1 3
    
    # ── Method 2: yt-dlp JSON Dump ───────────────────────────────────────────
    if detect_method_2_ytdlp; then
        _export_detection_results || return 1
        return 0
    fi
    
    random_sleep 1 3
    
    # ── Method 3: /streams Tab Scan (most thorough) ──────────────────────────
    if detect_method_3_streams_tab; then
        _export_detection_results || return 1
        return 0
    fi
    
    # ── All methods found nothing ────────────────────────────────────────────
    log_separator
    log_info "All 3 detection methods completed — channel is NOT live"
    log_info "Detection completed at: $(now_pkt)"
    
    set_output "is_live" "false"
    set_env "STREAM_IS_LIVE" "false"
    
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
#  EXPORT HELPER — Write detection results to GitHub Actions outputs
# ═══════════════════════════════════════════════════════════════════════════════

_export_detection_results() {
    # ── Duplicate Check ──────────────────────────────────────────────────────
    if [[ "${ENABLE_DUPLICATE_CHECK:-true}" == "true" ]]; then
        local last_id
        last_id=$(github_api_read_content "last_video_id.txt" 2>/dev/null) || last_id=""
        if [[ -n "$last_id" ]] && [[ "$last_id" == "$DETECTED_VIDEO_ID" ]]; then
            log_warn "Duplicate Detection: Stream ${DETECTED_VIDEO_ID} already recorded. Skipping."
            set_output "is_live" "false"
            set_env "STREAM_IS_LIVE" "false"
            return 0
        fi
    fi
    
    log_separator
    log_ok "═══ LIVE STREAM CONFIRMED ═══"
    log_info "  Video ID  : ${DETECTED_VIDEO_ID}"
    log_info "  Title     : ${DETECTED_TITLE}"
    log_info "  Channel   : ${DETECTED_CHANNEL}"
    log_info "  Method    : ${DETECTED_METHOD}"
    log_info "  URL       : ${DETECTED_URL}"
    log_info "  Thumbnail : ${DETECTED_THUMBNAIL}"
    log_info "  Time      : $(now_pkt)"
    log_separator
    
    # Export to GitHub Actions
    set_output "is_live" "true"
    set_output "video_id" "$DETECTED_VIDEO_ID"
    set_output "stream_title" "$DETECTED_TITLE"
    set_output "channel_name" "$DETECTED_CHANNEL"
    set_output "thumbnail_url" "$DETECTED_THUMBNAIL"
    set_output "detection_method" "$DETECTED_METHOD"
    set_output "stream_url" "$DETECTED_URL"
    set_output "detection_time" "$(now_pkt)"
    
    set_env "STREAM_IS_LIVE" "true"
    set_env "STREAM_VIDEO_ID" "$DETECTED_VIDEO_ID"
    set_env "STREAM_TITLE" "$DETECTED_TITLE"
    set_env "STREAM_CHANNEL" "$DETECTED_CHANNEL"
    set_env "STREAM_THUMBNAIL" "$DETECTED_THUMBNAIL"
    set_env "STREAM_URL" "$DETECTED_URL"
    set_env "STREAM_DETECTION_METHOD" "$DETECTED_METHOD"
    set_env "STREAM_DETECTION_TIME" "$(now_pkt)"
    set_env "STREAM_START_EPOCH" "$(now_epoch)"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  QUICK CHECK — Lightweight check if stream is still live (used during recording)
# ═══════════════════════════════════════════════════════════════════════════════

is_stream_still_live() {
    local video_id="${1:-$DETECTED_VIDEO_ID}"
    if [[ -z "$video_id" ]]; then
        return 1
    fi
    
    local user_agent
    user_agent=$(rotate_user_agent)
    local bypass_cookie="CONSENT=YES+cb.20230101-00-p0.en+FX+414; SOCS=CAI"
    
    # Method A: Direct video page check with bypass cookies (Fastest & most accurate)
    local video_page
    video_page=$(curl -s --max-time 10 \
        -H "User-Agent: ${user_agent}" \
        -H "Cookie: ${bypass_cookie}" \
        -H "Accept-Language: en-US,en;q=0.9" \
        "https://www.youtube.com/watch?v=${video_id}" 2>/dev/null) || true
    
    if grep -qE '"isLiveNow"\s*:\s*true' <<< "$video_page"; then
        return 0
    fi
    
    # Method B: yt-dlp json check (Definitive but slower)
    local is_live
    is_live=$(yt-dlp --dump-json --no-download --extractor-args "youtube:player_client=mweb" "https://www.youtube.com/watch?v=${video_id}" 2>/dev/null | jq -r '.is_live // false' 2>/dev/null)
    if [[ "$is_live" == "true" ]]; then
        return 0
    fi
    
    return 1
}

# ═══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    detect_live_stream
    exit 0
fi
