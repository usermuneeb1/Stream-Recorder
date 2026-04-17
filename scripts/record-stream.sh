#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  📡 STREAM RECORDER — BULLETPROOF RECORDING ENGINE                          ║
# ║  6-method, 5-attempt approach to guarantee successful recording.            ║
# ║  Methods: web_creator → tv → ios → android → mweb → streamlink            ║
# ║  Each attempt checks if stream is still live before retrying.              ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"
source "$SCRIPT_DIR/detect-stream.sh"

# ═══════════════════════════════════════════════════════════════════════════════
#  CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

RECORD_DIR="${RECORD_DIR:-/tmp/stream-recorder}"
SEGMENTS_DIR="${RECORD_DIR}/segments"
COOKIES_FILE="${COOKIES_FILE:-cookies.txt}"
RECORDED_FILES=()
RECORDING_SUCCESS=false

# ═══════════════════════════════════════════════════════════════════════════════
#  RECORDING METHOD A: Cookies + web_creator Player
#  Best quality, authenticated access, bypasses age restrictions
# ═══════════════════════════════════════════════════════════════════════════════

record_method_a() {
    local video_url="$1"
    local output_file="$2"
    local user_agent
    user_agent=$(rotate_user_agent)
    
    log_info "  Method A: Cookies + web player"
    
    # Skip if cookies are expired or missing
    if [[ "${COOKIE_STATUS:-}" == "expired" ]]; then
        log_warn "  Method A: Cookies expired — skipping"
        return 1
    fi
    
    if [[ ! -f "$COOKIES_FILE" ]] || [[ ! -s "$COOKIES_FILE" ]]; then
        log_warn "  Method A: No cookies file — skipping"
        return 1
    fi
    
    timeout "${MAX_RECORD_DURATION:-18000}" yt-dlp \
        --cookies "$COOKIES_FILE" \
        --extractor-args "youtube:player_client=web" \
        --user-agent "$user_agent" \
        --no-part \
        --no-continue \
        --no-check-certificates \
        --live-from-start \
        --fixup never \
        -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best" \
        --merge-output-format mp4 \
        -o "$output_file" \
        "$video_url" 2>&1 | tail -5
    
    return ${PIPESTATUS[0]}
}

# ═══════════════════════════════════════════════════════════════════════════════
#  RECORDING METHOD B: Cookies + tv Player
#  Sometimes bypasses bot detection that blocks web_creator
# ═══════════════════════════════════════════════════════════════════════════════

record_method_b() {
    local video_url="$1"
    local output_file="$2"
    local user_agent
    user_agent=$(rotate_user_agent)
    
    log_info "  Method B: Cookies + web_creator player"
    
    # Skip if cookies are expired or missing
    if [[ "${COOKIE_STATUS:-}" == "expired" ]]; then
        log_warn "  Method B: Cookies expired — skipping"
        return 1
    fi
    
    if [[ ! -f "$COOKIES_FILE" ]] || [[ ! -s "$COOKIES_FILE" ]]; then
        log_warn "  Method B: No cookies file — skipping"
        return 1
    fi
    
    timeout "${MAX_RECORD_DURATION:-18000}" yt-dlp \
        --cookies "$COOKIES_FILE" \
        --extractor-args "youtube:player_client=web_creator" \
        --user-agent "$user_agent" \
        --no-part \
        --no-continue \
        --no-check-certificates \
        --live-from-start \
        --fixup never \
        -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best" \
        --merge-output-format mp4 \
        -o "$output_file" \
        "$video_url" 2>&1 | tail -5
    
    return ${PIPESTATUS[0]}
}

# ═══════════════════════════════════════════════════════════════════════════════
#  RECORDING METHOD C: iOS Player (No Cookies)
#  Works for public streams without authentication
# ═══════════════════════════════════════════════════════════════════════════════

record_method_c() {
    local video_url="$1"
    local output_file="$2"
    
    log_info "  Method C: Web player (no cookies, anonymous)"
    
    timeout "${MAX_RECORD_DURATION:-18000}" yt-dlp \
        --extractor-args "youtube:player_client=web" \
        --no-part \
        --no-continue \
        --no-check-certificates \
        --live-from-start \
        --fixup never \
        -f "bestvideo+bestaudio/best" \
        --merge-output-format mp4 \
        -o "$output_file" \
        "$video_url" 2>&1 | tail -5
    
    return ${PIPESTATUS[0]}
}

# ═══════════════════════════════════════════════════════════════════════════════
#  RECORDING METHOD D: Android Player (No Cookies)
#  Fallback for mobile-format streams
# ═══════════════════════════════════════════════════════════════════════════════

record_method_d() {
    local video_url="$1"
    local output_file="$2"
    
    log_info "  Method D: Default player (auto-detect best client)"
    
    timeout "${MAX_RECORD_DURATION:-18000}" yt-dlp \
        --no-part \
        --no-continue \
        --no-check-certificates \
        --live-from-start \
        --fixup never \
        -f "bestvideo+bestaudio/best" \
        --merge-output-format mp4 \
        -o "$output_file" \
        "$video_url" 2>&1 | tail -5
    
    return ${PIPESTATUS[0]}
}

# ═══════════════════════════════════════════════════════════════════════════════
#  RECORDING METHOD E: Mobile Web Player (No Cookies)
#  Simplest client, minimal chance of blocking
# ═══════════════════════════════════════════════════════════════════════════════

record_method_e() {
    local video_url="$1"
    local output_file="$2"
    local mobile_ua="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"
    
    log_info "  Method E: Mobile web player (mweb)"
    
    timeout "${MAX_RECORD_DURATION:-18000}" yt-dlp \
        --extractor-args "youtube:player_client=mweb" \
        --user-agent "$mobile_ua" \
        --no-part \
        --no-continue \
        --no-check-certificates \
        --live-from-start \
        --fixup never \
        -f "bestvideo+bestaudio/best" \
        --merge-output-format mp4 \
        -o "$output_file" \
        "$video_url" 2>&1 | tail -5
    
    return ${PIPESTATUS[0]}
}

# ═══════════════════════════════════════════════════════════════════════════════
#  RECORDING METHOD F: Streamlink (Completely Different Tool)
#  Uses HLS directly, bypasses yt-dlp entirely
# ═══════════════════════════════════════════════════════════════════════════════

record_method_f() {
    local video_url="$1"
    local output_file="$2"
    
    log_info "  Method F: Streamlink (HLS direct)"
    
    if ! command -v streamlink &>/dev/null; then
        log_warn "  Method F: streamlink not installed — skipping"
        return 1
    fi
    
    timeout "${MAX_RECORD_DURATION:-18000}" streamlink \
        --output "$output_file" \
        --force \
        --stream-segment-threads 3 \
        --hls-live-restart \
        "$video_url" best 2>&1 | tail -5
    
    return ${PIPESTATUS[0]}
}

# ═══════════════════════════════════════════════════════════════════════════════
#  FILE VALIDATOR — Check if recorded file is valid
# ═══════════════════════════════════════════════════════════════════════════════

validate_recorded_file() {
    local output_base="$1"
    local min_size="${MIN_FILE_SIZE_KB:-100}"
    local min_bytes=$(( min_size * 1024 ))
    
    # Search for any output file (yt-dlp may add extensions)
    local found_file=""
    local extensions=("mp4" "webm" "mkv" "ts" "m4a" "flv" "part")
    
    # First check the exact file
    if [[ -f "$output_base" ]]; then
        local size
        size=$(get_file_size "$output_base")
        if (( size >= min_bytes )); then
            found_file="$output_base"
        else
            log_warn "  File too small ($(format_size "$size")): $output_base" >&2
            rm -f "$output_base"
        fi
    fi
    
    # Check with various extensions
    if [[ -z "$found_file" ]]; then
        for ext in "${extensions[@]}"; do
            local check_file="${output_base%.mp4}.${ext}"
            [[ "$check_file" == "$output_base" ]] && continue
            
            if [[ -f "$check_file" ]]; then
                local size
                size=$(get_file_size "$check_file")
                if (( size >= min_bytes )); then
                    found_file="$check_file"
                    break
                else
                    log_warn "  File too small ($(format_size "$size")): $check_file" >&2
                    rm -f "$check_file"
                fi
            fi
        done
    fi
    
    # Also check for files in the same directory matching the pattern
    if [[ -z "$found_file" ]]; then
        local dir
        dir=$(dirname "$output_base")
        local base
        base=$(basename "$output_base" .mp4)
        
        while IFS= read -r f; do
            if [[ -f "$f" ]]; then
                local size
                size=$(get_file_size "$f")
                if (( size >= min_bytes )); then
                    found_file="$f"
                    break
                fi
            fi
        done < <(find "$dir" -maxdepth 1 -name "${base}*" -type f 2>/dev/null | sort -r)
    fi
    
    if [[ -n "$found_file" ]]; then
        local final_size
        final_size=$(get_file_size "$found_file")
        log_ok "  Valid recording found: $(basename "$found_file") ($(format_size "$final_size"))" >&2
        echo "$found_file"
        return 0
    fi
    
    return 1
}

# ═══════════════════════════════════════════════════════════════════════════════
#  RECORDING ATTEMPT — Tries all 6 methods in sequence
# ═══════════════════════════════════════════════════════════════════════════════

attempt_recording() {
    local video_url="$1"
    local attempt_num="$2"
    local output_base="${SEGMENTS_DIR}/segment_$(printf '%03d' "$attempt_num").mp4"
    
    log_step "Recording attempt ${attempt_num}/${MAX_RECORD_ATTEMPTS:-5}"
    log_info "  URL: ${video_url}"
    log_info "  Output: ${output_base}"
    
    local methods=(
        "record_method_a"
        "record_method_b"
        "record_method_c"
        "record_method_d"
        "record_method_e"
        "record_method_f"
    )
    local method_names=(
        "A: Cookies+web"
        "B: Cookies+web_creator"
        "C: Web (anonymous)"
        "D: Default (auto)"
        "E: Mobile Web"
        "F: Streamlink"
    )
    
    for i in "${!methods[@]}"; do
        log_separator
        log_info "  Trying method ${method_names[$i]}..."
        
        # Try the recording method
        ${methods[$i]} "$video_url" "$output_base" || true
        
        # Check if a valid file was produced
        local valid_file
        valid_file=$(validate_recorded_file "$output_base") && {
            log_ok "  ✅ Method ${method_names[$i]} succeeded!"
            RECORDED_FILES+=("$valid_file")
            return 0
        }
        
        log_warn "  Method ${method_names[$i]} — no valid file produced"
        
        # Small delay between methods
        sleep "${METHOD_RETRY_DELAY:-5}"
    done
    
    log_error "  All 6 methods failed for attempt ${attempt_num}"
    return 1
}

# ═══════════════════════════════════════════════════════════════════════════════
#  SEGMENT MERGER — Combine multiple segments into one file
# ═══════════════════════════════════════════════════════════════════════════════

merge_segments() {
    local output_file="$1"
    
    if [[ ${#RECORDED_FILES[@]} -eq 0 ]]; then
        log_error "No segments to merge"
        return 1
    fi
    
    if [[ ${#RECORDED_FILES[@]} -eq 1 ]]; then
        log_info "Single segment — moving to output"
        mv "${RECORDED_FILES[0]}" "$output_file"
        return 0
    fi
    
    log_step "Merging ${#RECORDED_FILES[@]} segments..."
    
    # Create concat file for ffmpeg
    local concat_file="${RECORD_DIR}/concat_list.txt"
    > "$concat_file"
    for segment in "${RECORDED_FILES[@]}"; do
        echo "file '$(realpath "$segment")'" >> "$concat_file"
    done
    
    log_debug "Concat file contents:"
    cat "$concat_file"
    
    # Try lossless concat first
    if ffmpeg -y -f concat -safe 0 -i "$concat_file" \
        -c copy -movflags +faststart \
        "$output_file" 2>/dev/null; then
        log_ok "Segments merged successfully (lossless)"
        # Clean up individual segments
        for segment in "${RECORDED_FILES[@]}"; do
            rm -f "$segment"
        done
        rm -f "$concat_file"
        return 0
    fi
    
    log_warn "Lossless merge failed — trying re-encode merge..."
    
    # Fallback: re-encode merge
    if ffmpeg -y -f concat -safe 0 -i "$concat_file" \
        -c:v libx264 -crf "${REENCODE_CRF:-18}" -preset "${REENCODE_PRESET:-medium}" \
        -c:a aac -b:a "${REENCODE_AUDIO_BITRATE:-192k}" \
        -movflags +faststart \
        "$output_file" 2>/dev/null; then
        log_ok "Segments merged successfully (re-encoded)"
        for segment in "${RECORDED_FILES[@]}"; do
            rm -f "$segment"
        done
        rm -f "$concat_file"
        return 0
    fi
    
    log_warn "Merge failed — using largest single segment"
    
    # Fallback: use the largest segment
    local largest_file=""
    local largest_size=0
    for segment in "${RECORDED_FILES[@]}"; do
        local size
        size=$(get_file_size "$segment")
        if (( size > largest_size )); then
            largest_size=$size
            largest_file="$segment"
        fi
    done
    
    if [[ -n "$largest_file" ]]; then
        mv "$largest_file" "$output_file"
        # Clean up other segments
        for segment in "${RECORDED_FILES[@]}"; do
            rm -f "$segment"
        done
        log_ok "Using largest segment: $(format_size "$largest_size")"
        return 0
    fi
    
    rm -f "$concat_file"
    return 1
}

# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN RECORDING ORCHESTRATOR
#  Runs up to MAX_RECORD_ATTEMPTS, checking if stream is still live between
# ═══════════════════════════════════════════════════════════════════════════════

record_stream() {
    log_header "🎬 BULLETPROOF RECORDING ENGINE"
    
    local video_url="${STREAM_URL:-}"
    local video_id="${STREAM_VIDEO_ID:-}"
    local stream_title="${STREAM_TITLE:-Live Stream}"
    
    if [[ -z "$video_url" ]]; then
        log_error "No stream URL provided (STREAM_URL not set)"
        return 1
    fi
    
    log_info "Stream    : ${stream_title}"
    log_info "Video ID  : ${video_id}"
    log_info "URL       : ${video_url}"
    log_info "Max Tries : ${MAX_RECORD_ATTEMPTS:-5} attempts × 6 methods = $((${MAX_RECORD_ATTEMPTS:-5} * 6)) chances"
    log_info "Started   : $(now_pkt)"
    
    # ── Prepare directories ──────────────────────────────────────────────────
    mkdir -p "$RECORD_DIR" "$SEGMENTS_DIR"
    
    # ── Generate output filename ─────────────────────────────────────────────
    local safe_title
    safe_title=$(generate_output_filename "$stream_title")
    local raw_output="${RECORD_DIR}/${safe_title}_raw.mp4"
    local final_output="${RECORD_DIR}/${safe_title}.mp4"
    
    set_env "RECORD_OUTPUT_TITLE" "$safe_title"
    set_env "RECORD_RAW_FILE" "$raw_output"
    
    # ── Live Chat Extractor ──────────────────────────────────────────────────
    local chat_output="${RECORD_DIR}/chat.json"
    local chat_pid=""
    
    log_info "Spawning chat-downloader in background..."
    if command -v chat_downloader &>/dev/null; then
        chat_downloader "$video_url" --output "$chat_output" >/dev/null 2>&1 &
        chat_pid=$!
        log_info "Chat downloader started (PID: $chat_pid)"
    else
        log_warn "chat_downloader not found, skipping chat extraction"
    fi
    
    # ── Recording Loop ───────────────────────────────────────────────────────
    local max_attempts="${MAX_RECORD_ATTEMPTS:-5}"
    local attempt=1
    
    while (( attempt <= max_attempts )); do
        log_separator
        
        # Try to record
        if attempt_recording "$video_url" "$attempt"; then
            RECORDING_SUCCESS=true
            log_ok "Attempt ${attempt} produced a valid recording"
        else
            log_warn "Attempt ${attempt} failed to produce a recording"
        fi
        
        # Check if stream is still live (only if we haven't reached max attempts)
        if (( attempt < max_attempts )); then
            log_info "Checking if stream is still live..."
            random_sleep 3 8
            
            if is_stream_still_live "$video_id"; then
                log_info "Stream is still live — recording next segment"
                (( attempt++ ))
                continue
            else
                log_info "Stream has ended — stopping recording loop"
                break
            fi
        fi
        
        (( attempt++ ))
    done
    
    # ── Check Results ────────────────────────────────────────────────────────
    log_separator
    
    # Stop chat downloader gracefully
    if [[ -n "${chat_pid:-}" ]]; then
        log_info "Stopping chat downloader..."
        kill -2 "$chat_pid" 2>/dev/null || kill -9 "$chat_pid" 2>/dev/null
        wait "$chat_pid" 2>/dev/null || true
        set_env "RECORD_CHAT_FILE" "$chat_output"
    fi
    
    if [[ ${#RECORDED_FILES[@]} -eq 0 ]]; then
        log_error "═══ RECORDING FAILED ═══"
        log_error "All ${max_attempts} attempts × 6 methods failed to produce a valid file"
        set_env "RECORDING_SUCCESS" "false"
        set_output "recording_success" "false"
        return 1
    fi
    
    log_ok "═══ RECORDED ${#RECORDED_FILES[@]} SEGMENT(S) ═══"
    for f in "${RECORDED_FILES[@]}"; do
        log_info "  → $(basename "$f") ($(format_size "$(get_file_size "$f")"))"
    done
    
    # ── Merge segments ───────────────────────────────────────────────────────
    if merge_segments "$raw_output"; then
        log_ok "Final raw file: $(basename "$raw_output") ($(format_size "$(get_file_size "$raw_output")"))"
    else
        log_error "Failed to produce final output file"
        set_env "RECORDING_SUCCESS" "false"
        set_output "recording_success" "false"
        return 1
    fi
    
    # ── Record end time ──────────────────────────────────────────────────────
    set_env "STREAM_END_EPOCH" "$(now_epoch)"
    set_env "STREAM_END_TIME" "$(now_pkt)"
    set_env "RECORDING_SUCCESS" "true"
    set_env "RECORDING_RAW_FILE" "$raw_output"
    set_output "recording_success" "true"
    set_output "raw_file" "$raw_output"
    
    log_ok "Recording completed at: $(now_pkt)"
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    record_stream
fi
