#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  📡 STREAM RECORDER — SMART POST-PROCESSING & SPLITTING                    ║
# ║  Stage 1: Repair & optimize (remux → re-encode fallback)                   ║
# ║  Stage 2: Quality check & validation                                       ║
# ║  Stage 3: Smart splitting (30-min parts at keyframes)                      ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

# ═══════════════════════════════════════════════════════════════════════════════
#  CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

RECORD_DIR="${RECORD_DIR:-/tmp/stream-recorder}"
PROCESSED_FILES=()

# ═══════════════════════════════════════════════════════════════════════════════
#  STAGE 1: REPAIR & OPTIMIZE
#  Try lossless remux first, then re-encode if needed
# ═══════════════════════════════════════════════════════════════════════════════

repair_and_optimize() {
    local input_file="$1"
    local output_file="$2"
    
    log_step "Stage 1: Repair & Optimize"
    log_info "  Input : $(basename "$input_file") ($(format_size "$(get_file_size "$input_file")"))"
    
    # ── Attempt 1: Lossless remux with faststart ────────────────────────────
    log_info "  Trying lossless remux (copy streams, add faststart)..."
    
    local remux_start
    remux_start=$(now_epoch)
    
    if ffmpeg -y -i "$input_file" \
        -c copy \
        -movflags +faststart \
        -fflags +genpts \
        -err_detect ignore_err \
        "$output_file" 2>/dev/null; then
        
        # Verify output is valid
        if [[ -f "$output_file" ]] && is_valid_video "$output_file"; then
            local elapsed=$(( $(now_epoch) - remux_start ))
            log_ok "  Lossless remux succeeded in ${elapsed}s"

            # ── Detect codec: VP9 in MP4 has poor browser support ─────────────
            local vcodec
            vcodec=$(ffprobe -v quiet -select_streams v:0 \
                -show_entries stream=codec_name -of csv=p=0 \
                "$output_file" 2>/dev/null)

            if [[ "$vcodec" == "vp9" ]] || [[ "$vcodec" == "vp8" ]]; then
                log_info "  ⚠️  VP9 codec detected — transcoding to H.264 for browser compatibility..."
                local h264_tmp="${output_file%.mp4}_h264tmp.mp4"
                local encode_start
                encode_start=$(now_epoch)

                if ffmpeg -y -i "$output_file" \
                    -c:v libx264 -crf "${REENCODE_CRF:-20}" -preset "${REENCODE_PRESET:-fast}" \
                    -c:a aac -b:a "${REENCODE_AUDIO_BITRATE:-192k}" \
                    -movflags +faststart \
                    "$h264_tmp" 2>/dev/null && is_valid_video "$h264_tmp"; then

                    mv -f "$h264_tmp" "$output_file"
                    local e2=$(( $(now_epoch) - encode_start ))
                    log_ok "  H.264 transcode complete in ${e2}s"
                    log_ok "  Output: $(basename "$output_file") ($(format_size "$(get_file_size "$output_file")"))"
                else
                    log_warn "  H.264 transcode failed — keeping VP9 (file may not play inline in Safari)"
                    rm -f "$h264_tmp"
                fi
            else
                log_info "  Codec: ${vcodec} — browser compatible ✅"
                log_info "  Output: $(basename "$output_file") ($(format_size "$(get_file_size "$output_file")"))"
            fi
            return 0
        else
            log_warn "  Remux output is invalid or corrupt"
            rm -f "$output_file"
        fi
    else
        log_warn "  Lossless remux failed"
        rm -f "$output_file"
    fi

    
    # ── Attempt 2: Re-encode with libx264 ────────────────────────────────────
    log_info "  Trying re-encode (libx264 CRF ${REENCODE_CRF:-18})..."
    
    local encode_start
    encode_start=$(now_epoch)
    
    if ffmpeg -y -i "$input_file" \
        -c:v libx264 -crf "${REENCODE_CRF:-18}" -preset "${REENCODE_PRESET:-medium}" \
        -c:a aac -b:a "${REENCODE_AUDIO_BITRATE:-192k}" \
        -movflags +faststart \
        -fflags +genpts \
        -err_detect ignore_err \
        -max_muxing_queue_size 4096 \
        "$output_file" 2>/dev/null; then
        
        if [[ -f "$output_file" ]] && is_valid_video "$output_file"; then
            local elapsed=$(( $(now_epoch) - encode_start ))
            log_ok "  Re-encode succeeded in ${elapsed}s"
            log_info "  Output: $(basename "$output_file") ($(format_size "$(get_file_size "$output_file")"))"
            return 0
        else
            log_warn "  Re-encode output is invalid"
            rm -f "$output_file"
        fi
    else
        log_warn "  Re-encode failed"
        rm -f "$output_file"
    fi
    
    # ── Attempt 3: Use raw file as-is ────────────────────────────────────────
    log_warn "  Both repair methods failed — using raw file as-is"
    cp "$input_file" "$output_file"
    
    if [[ -f "$output_file" ]]; then
        log_info "  Copied raw file: $(format_size "$(get_file_size "$output_file")")"
        return 0
    fi
    
    return 1
}

# ═══════════════════════════════════════════════════════════════════════════════
#  STAGE 2: QUALITY CHECK & METADATA
#  Validate output and extract technical details
# ═══════════════════════════════════════════════════════════════════════════════

quality_check() {
    local file="$1"
    
    log_step "Stage 2: Quality Check"
    
    if [[ ! -f "$file" ]]; then
        log_error "  File does not exist: $file"
        return 1
    fi
    
    local size duration resolution
    size=$(get_file_size "$file")
    duration=$(get_video_duration "$file")
    resolution=$(get_video_resolution "$file")
    
    log_info "  File      : $(basename "$file")"
    log_info "  Size      : $(format_size "$size")"
    log_info "  Duration  : $(format_duration "$duration") (${duration}s)"
    log_info "  Resolution: ${resolution}"
    
    # Export metadata
    set_env "RECORD_DURATION_SEC" "$duration"
    set_env "RECORD_DURATION_FMT" "$(format_duration "$duration")"
    set_env "RECORD_SIZE_BYTES" "$size"
    set_env "RECORD_SIZE_HUMAN" "$(format_size "$size")"
    set_env "RECORD_SIZE_GB" "$(format_size_gb "$size")"
    set_env "RECORD_RESOLUTION" "$resolution"
    
    set_output "duration_seconds" "$duration"
    set_output "duration_formatted" "$(format_duration "$duration")"
    set_output "file_size" "$(format_size "$size")"
    set_output "file_size_gb" "$(format_size_gb "$size")"
    set_output "resolution" "$resolution"
    
    # Warn if duration seems too short
    if (( duration < 60 )); then
        log_warn "  ⚠️ Recording is less than 1 minute — may be incomplete"
    fi
    
    log_ok "  Quality check passed"
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
#  STAGE 3: SMART SPLITTING
#  Split into 30-minute parts at keyframe boundaries
# ═══════════════════════════════════════════════════════════════════════════════

smart_split() {
    local input_file="$1"
    local output_dir="$2"
    local max_segment_sec=$(( ${SEGMENT_DURATION_MIN:-30} * 60 ))
    
    log_step "Stage 3: File Handling"
    
    # Check if user wants the whole file without splitting
    if [[ "${KEEP_WHOLE_FILE:-true}" == "true" ]]; then
        log_info "  KEEP_WHOLE_FILE=true — uploading as ONE complete file (no splitting)"
        PROCESSED_FILES+=("$input_file")
        set_env "RECORD_PARTS" "1"
        set_output "parts_count" "1"
        return 0
    fi
    
    # Get video duration
    local duration
    duration=$(get_video_duration "$input_file")
    
    log_info "  Video duration : $(format_duration "$duration")"
    log_info "  Split threshold: $(format_duration "$max_segment_sec") (${SEGMENT_DURATION_MIN:-30} minutes)"
    
    # Check if splitting is needed
    if (( duration <= max_segment_sec )); then
        log_info "  Duration is within threshold — no splitting needed"
        PROCESSED_FILES+=("$input_file")
        set_env "RECORD_PARTS" "1"
        set_output "parts_count" "1"
        return 0
    fi
    
    # Calculate expected parts
    local expected_parts=$(( (duration + max_segment_sec - 1) / max_segment_sec ))
    log_info "  Splitting into ~${expected_parts} parts of ${SEGMENT_DURATION_MIN:-30} minutes each"
    
    # Get base filename without extension
    local base_name
    base_name=$(basename "$input_file" .mp4)
    
    # Split using ffmpeg segment
    log_info "  Running ffmpeg segment split..."
    
    if ffmpeg -y -i "$input_file" \
        -c copy \
        -map 0 \
        -f segment \
        -segment_time "$max_segment_sec" \
        -segment_format mp4 \
        -reset_timestamps 1 \
        -movflags +faststart \
        "${output_dir}/${base_name}_part%03d.mp4" 2>/dev/null; then
        
        # Collect split files
        local part_count=0
        while IFS= read -r part_file; do
            if [[ -f "$part_file" ]] && is_valid_video "$part_file" 500; then
                PROCESSED_FILES+=("$part_file")
                (( part_count++ ))
                local psize
                psize=$(get_file_size "$part_file")
                log_info "  Part ${part_count}: $(basename "$part_file") ($(format_size "$psize"))"
            fi
        done < <(find "$output_dir" -name "${base_name}_part*.mp4" -type f | sort)
        
        if (( part_count > 0 )); then
            log_ok "  Split into ${part_count} parts"
            set_env "RECORD_PARTS" "$part_count"
            set_output "parts_count" "$part_count"
            # Remove original unsplit file to save space
            rm -f "$input_file"
            return 0
        else
            log_warn "  Split produced no valid parts"
        fi
    else
        log_warn "  ffmpeg segment split failed"
    fi
    
    # Fallback: keep unsplit file
    log_warn "  Splitting failed — keeping as single file"
    PROCESSED_FILES+=("$input_file")
    set_env "RECORD_PARTS" "1"
    set_output "parts_count" "1"
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════════════════════

post_process() {
    log_header "⚙️ POST-PROCESSING ENGINE"
    
    local raw_file="${RECORDING_RAW_FILE:-}"
    
    if [[ -z "$raw_file" ]] || [[ ! -f "$raw_file" ]]; then
        log_error "No raw recording file found (RECORDING_RAW_FILE not set or file missing)"
        return 1
    fi
    
    local process_start
    process_start=$(now_epoch)
    
    log_info "Input file: $(basename "$raw_file")"
    log_info "Input size: $(format_size "$(get_file_size "$raw_file")")"
    log_info "Started at: $(now_pkt)"
    
    # Derive output filename
    local base_name
    base_name=$(basename "$raw_file" | sed 's/_raw\././')
    local processed_file="${RECORD_DIR}/${base_name}"
    
    # ── Stage 1: Repair & Optimize ───────────────────────────────────────────
    log_separator
    if ! repair_and_optimize "$raw_file" "$processed_file"; then
        log_error "Stage 1 failed — cannot continue"
        return 1
    fi
    
    # Clean up raw file (if different from processed)
    if [[ "$raw_file" != "$processed_file" ]] && [[ -f "$raw_file" ]]; then
        rm -f "$raw_file"
        log_debug "Removed raw file to save disk space"
    fi
    
    # ── Stage 2: Quality Check ───────────────────────────────────────────────
    log_separator
    if ! quality_check "$processed_file"; then
        log_error "Stage 2 failed — file is invalid"
        return 1
    fi
    
    # ── Stage 3: Smart Splitting ─────────────────────────────────────────────
    log_separator
    if ! smart_split "$processed_file" "$RECORD_DIR"; then
        log_error "Stage 3 failed"
        return 1
    fi
    
    # ── Stage 4: Download Thumbnail (for Discord embed only — NOT uploaded to cloud) ──
    if [[ "${SAVE_THUMBNAIL:-true}" == "true" ]] && [[ -n "${STREAM_THUMBNAIL:-}" ]]; then
        log_separator
        log_step "Downloading Thumbnail (for Discord only)..."
        local thumb_ext="jpg"
        [[ "$STREAM_THUMBNAIL" == *".webp"* ]] && thumb_ext="webp"
        local thumb_file="${RECORD_DIR}/${base_name}_thumbnail.${thumb_ext}"
        
        if curl -sL --max-time 15 -o "$thumb_file" "$STREAM_THUMBNAIL"; then
            if [[ -s "$thumb_file" ]]; then
                log_ok "Thumbnail saved (Discord embed only — will NOT be uploaded to cloud)"
                # NOTE: NOT adding to PROCESSED_FILES — thumbnail stays local for Discord
                set_env "LOCAL_THUMBNAIL_PATH" "$thumb_file"
            else
                log_warn "Downloaded thumbnail is empty"
                rm -f "$thumb_file"
            fi
        else
            log_warn "Failed to download thumbnail"
        fi
    fi
    
    # ── Summary ──────────────────────────────────────────────────────────────
    local process_elapsed=$(( $(now_epoch) - process_start ))
    
    log_separator
    log_ok "═══ POST-PROCESSING COMPLETE ═══"
    log_info "  Processing time : $(format_duration_human "$process_elapsed")"
    log_info "  Output files    : ${#PROCESSED_FILES[@]}"
    
    local total_output_size=0
    for f in "${PROCESSED_FILES[@]}"; do
        local fsize
        fsize=$(get_file_size "$f")
        (( total_output_size += fsize ))
        log_info "  → $(basename "$f") ($(format_size "$fsize"))"
    done
    
    log_info "  Total size      : $(format_size "$total_output_size")"
    
    # Export the files list for upload
    local files_list=""
    for f in "${PROCESSED_FILES[@]}"; do
        files_list+="${f}|"
    done
    files_list="${files_list%|}"  # Remove trailing pipe
    
    set_env "PROCESSED_FILES_LIST" "$files_list"
    set_env "PROCESSED_FILES_COUNT" "${#PROCESSED_FILES[@]}"
    set_env "PROCESSING_TIME_SEC" "$process_elapsed"
    set_env "PROCESSING_TIME_FMT" "$(format_duration_human "$process_elapsed")"
    set_env "TOTAL_OUTPUT_SIZE" "$total_output_size"
    set_env "TOTAL_OUTPUT_SIZE_HUMAN" "$(format_size "$total_output_size")"
    
    set_output "processed_files" "$files_list"
    set_output "parts_count" "${#PROCESSED_FILES[@]}"
    set_output "processing_time" "$(format_duration_human "$process_elapsed")"
    set_output "total_size" "$(format_size "$total_output_size")"
    
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    post_process
fi
