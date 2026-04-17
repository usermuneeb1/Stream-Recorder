#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  📡 STREAM RECORDER — TRIPLE CLOUD REDUNDANCY UPLOAD                       ║
# ║  Uploads every recording to 3 independent cloud services:                  ║
# ║    1. Gofile     — Fast, no limits, 60-day expiry                         ║
# ║    2. Pixeldrain — Reliable, API-based, 60-day expiry                     ║
# ║    3. Archive.org — PERMANENT, never expires                              ║
# ║  Each upload is independent — one failure doesn't stop the others.         ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

# ═══════════════════════════════════════════════════════════════════════════════
#  RESULT TRACKING
# ═══════════════════════════════════════════════════════════════════════════════

GOFILE_LINKS=()
PIXELDRAIN_LINKS=()
ARCHIVE_LINKS=()
UPLOAD_SUCCESS_COUNT=0
UPLOAD_TOTAL_SERVICES=3
UPLOAD_START_TIME=""

# ═══════════════════════════════════════════════════════════════════════════════
#  SERVICE 1: GOFILE UPLOAD
#  Free, no account needed, fast, no size limit
#  Links expire after 60 days of no downloads
# ═══════════════════════════════════════════════════════════════════════════════

upload_to_gofile() {
    local file="$1"
    local part_name="$2"
    
    log_info "  🟢 Gofile: Uploading $(basename "$file") ($(format_size "$(get_file_size "$file")"))..."
    
    local max_retries="${GOFILE_MAX_RETRIES:-3}"
    local attempt=1
    
    while (( attempt <= max_retries )); do
        local upload_start
        upload_start=$(now_epoch)
        
        # Upload directly to Gofile's global endpoint (auto-routes to closest region)
        local upload_response
        upload_response=$(curl -s --max-time "${UPLOAD_TIMEOUT:-3600}" \
            -F "file=@${file}" \
            "https://upload.gofile.io/uploadfile" 2>/dev/null) || {
            log_warn "  Gofile: Upload request failed (attempt $attempt)"
            (( attempt++ ))
            sleep 5
            continue
        }
        
        local upload_elapsed=$(( $(now_epoch) - upload_start ))
        
        # Step 3: Extract download link
        local status download_page file_code
        status=$(echo "$upload_response" | jq -r '.status // empty' 2>/dev/null)
        download_page=$(echo "$upload_response" | jq -r '.data.downloadPage // empty' 2>/dev/null)
        file_code=$(echo "$upload_response" | jq -r '.data.code // .data.fileId // empty' 2>/dev/null)
        
        if [[ "$status" == "ok" ]] && { [[ -n "$download_page" ]] || [[ -n "$file_code" ]]; }; then
            local link="${download_page:-https://gofile.io/d/${file_code}}"
            local speed
            local fsize
            fsize=$(get_file_size "$file")
            if (( upload_elapsed > 0 )); then
                speed=$(format_size $(( fsize / upload_elapsed )))
            else
                speed="instant"
            fi
            
            log_ok "  Gofile: ✅ Upload complete — ${upload_elapsed}s (${speed}/s)"
            log_info "  Gofile: Link → ${link}"
            GOFILE_LINKS+=("${part_name}|${link}")
            return 0
        fi
        
        log_warn "  Gofile: Upload response invalid (attempt $attempt)"
        log_debug "  Response: $upload_response"
        (( attempt++ ))
        sleep 5
    done
    
    log_error "  Gofile: ❌ All ${max_retries} attempts failed"
    return 1
}

# ═══════════════════════════════════════════════════════════════════════════════
#  SERVICE 2: PIXELDRAIN UPLOAD
#  Reliable, API-based, fast downloads
#  Links expire after 60 days of no downloads
# ═══════════════════════════════════════════════════════════════════════════════

upload_to_pixeldrain() {
    local file="$1"
    local part_name="$2"
    local api_key="${PIXELDRAIN_API_KEY:-}"
    
    log_info "  🔵 Pixeldrain: Uploading $(basename "$file") ($(format_size "$(get_file_size "$file")"))..."
    
    local max_retries="${PIXELDRAIN_MAX_RETRIES:-3}"
    local attempt=1
    
    while (( attempt <= max_retries )); do
        local upload_start
        upload_start=$(now_epoch)
        
        # URL-encode the filename (spaces, emojis, special chars break the URL)
        local filename
        filename=$(basename "$file")
        local encoded_filename
        encoded_filename=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$filename" 2>/dev/null || echo "$filename" | sed 's/ /%20/g; s/&/%26/g')
        
        local upload_response
        if [[ -n "$api_key" ]]; then
            upload_response=$(curl -s --max-time "${UPLOAD_TIMEOUT:-3600}" \
                -T "$file" \
                -u ":${api_key}" \
                "https://pixeldrain.com/api/file/${encoded_filename}" 2>&1) || {
                log_warn "  Pixeldrain: Upload request failed (attempt $attempt)"
                log_debug "  Response: $upload_response"
                (( attempt++ ))
                sleep 5
                continue
            }
        else
            upload_response=$(curl -s --max-time "${UPLOAD_TIMEOUT:-3600}" \
                -T "$file" \
                "https://pixeldrain.com/api/file/${encoded_filename}" 2>&1) || {
                log_warn "  Pixeldrain: Upload request failed (attempt $attempt)"
                log_debug "  Response: $upload_response"
                (( attempt++ ))
                sleep 5
                continue
            }
        fi
        
        local upload_elapsed=$(( $(now_epoch) - upload_start ))
        
        # Extract file ID
        local file_id success
        file_id=$(echo "$upload_response" | jq -r '.id // empty' 2>/dev/null)
        success=$(echo "$upload_response" | jq -r '.success // true' 2>/dev/null)
        
        if [[ -n "$file_id" ]] && [[ "$success" != "false" ]]; then
            local link="https://pixeldrain.com/u/${file_id}"
            local speed fsize
            fsize=$(get_file_size "$file")
            if (( upload_elapsed > 0 )); then
                speed=$(format_size $(( fsize / upload_elapsed )))
            else
                speed="instant"
            fi
            
            log_ok "  Pixeldrain: ✅ Upload complete — ${upload_elapsed}s (${speed}/s)"
            log_info "  Pixeldrain: Link → ${link}"
            PIXELDRAIN_LINKS+=("${part_name}|${link}")
            return 0
        fi
        
        log_warn "  Pixeldrain: Upload response invalid (attempt $attempt)"
        log_debug "  Response: $upload_response"
        (( attempt++ ))
        sleep 5
    done
    
    log_error "  Pixeldrain: ❌ All ${max_retries} attempts failed"
    return 1
}

# ═══════════════════════════════════════════════════════════════════════════════
#  SERVICE 3: ARCHIVE.ORG UPLOAD
#  PERMANENT storage — files NEVER expire
#  Uses S3-compatible API with rich metadata
# ═══════════════════════════════════════════════════════════════════════════════

upload_to_archive() {
    local file="$1"
    local part_name="$2"
    local access_key="${ARCHIVE_ACCESS_KEY:-}"
    local secret_key="${ARCHIVE_SECRET_KEY:-}"
    
    if [[ -z "$access_key" ]] || [[ -z "$secret_key" ]]; then
        log_warn "  Archive.org: Access/secret keys not set — skipping"
        return 1
    fi
    
    log_info "  🏛️  Archive.org: Uploading $(basename "$file") ($(format_size "$(get_file_size "$file")"))..."
    
    # Generate unique identifier
    local video_id="${STREAM_VIDEO_ID:-unknown}"
    local date_str
    date_str=$(TZ='Asia/Karachi' date '+%Y-%m')
    local timestamp
    timestamp=$(date '+%s')
    local identifier="muneeb-${date_str}-${video_id}-${timestamp}"
    
    # Prepare metadata
    local title="${STREAM_TITLE:-Live Stream Recording}"
    local channel="${STREAM_CHANNEL:-Unknown Channel}"
    local record_date
    record_date=$(TZ='Asia/Karachi' date '+%Y-%m-%d')
    local filename
    filename=$(basename "$file")
    
    local max_retries="${ARCHIVE_MAX_RETRIES:-3}"
    local attempt=1
    
    while (( attempt <= max_retries )); do
        local upload_start
        upload_start=$(now_epoch)
        
        local http_code
        http_code=$(curl -s -o /dev/null -w '%{http_code}' \
            --max-time "${UPLOAD_TIMEOUT:-1800}" \
            --location \
            --header "authorization: LOW ${access_key}:${secret_key}" \
            --header "x-archive-auto-make-bucket: 1" \
            --header "x-archive-meta-title: ${title} - ${record_date}" \
            --header "x-archive-meta-creator: ${channel}" \
            --header "x-archive-meta-date: ${record_date}" \
            --header "x-archive-meta-description: Live stream recording of ${title} by ${channel}. Recorded on ${record_date} by ${RECORDER_NAME:-Muneeb Ahmad}. Part: ${part_name}." \
            --header "x-archive-meta-mediatype: movies" \
            --header "x-archive-meta-collection: opensource_movies" \
            --header "x-archive-meta-subject: live stream;recording;youtube;${channel}" \
            --header "x-archive-meta-language: eng" \
            --upload-file "$file" \
            "https://s3.us.archive.org/${identifier}/${filename}" 2>/dev/null) || {
            log_warn "  Archive.org: Upload request failed (attempt $attempt)"
            (( attempt++ ))
            sleep 10
            continue
        }
        
        local upload_elapsed=$(( $(now_epoch) - upload_start ))
        
        if [[ "$http_code" =~ ^2[0-9]{2}$ ]]; then
            local link="https://archive.org/details/${identifier}"
            local speed fsize
            fsize=$(get_file_size "$file")
            if (( upload_elapsed > 0 )); then
                speed=$(format_size $(( fsize / upload_elapsed )))
            else
                speed="instant"
            fi
            
            log_ok "  Archive.org: ✅ Upload complete — ${upload_elapsed}s (${speed}/s)"
            log_info "  Archive.org: Link → ${link} (PERMANENT)"
            ARCHIVE_LINKS+=("${part_name}|${link}|${identifier}")
            return 0
        fi
        
        log_warn "  Archive.org: HTTP ${http_code} (attempt $attempt)"
        (( attempt++ ))
        sleep 10
    done
    
    log_error "  Archive.org: ❌ All ${max_retries} attempts failed"
    return 1
}

# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN UPLOAD ORCHESTRATOR
#  Uploads all processed files to all 3 services
# ═══════════════════════════════════════════════════════════════════════════════

upload_to_clouds() {
    log_header "☁️ TRIPLE CLOUD REDUNDANCY UPLOAD"
    
    UPLOAD_START_TIME=$(now_epoch)
    
    # Parse files list
    local files_list="${PROCESSED_FILES_LIST:-}"
    if [[ -z "$files_list" ]]; then
        log_error "No processed files to upload (PROCESSED_FILES_LIST not set)"
        return 1
    fi
    
    IFS='|' read -ra FILES <<< "$files_list"
    local total_files=${#FILES[@]}
    
    log_info "Files to upload: ${total_files}"
    log_info "Upload started : $(now_pkt)"
    
    local total_size=0
    for f in "${FILES[@]}"; do
        if [[ -f "$f" ]]; then
            local s
            s=$(get_file_size "$f")
            (( total_size += s ))
            log_info "  → $(basename "$f") ($(format_size "$s"))"
        fi
    done
    log_info "Total size: $(format_size "$total_size")"
    log_separator
    
    # ── Upload each file to each service ─────────────────────────────────────
    local gofile_ok=false pixeldrain_ok=false archive_ok=false
    
    for i in "${!FILES[@]}"; do
        local file="${FILES[$i]}"
        local part_num=$(( i + 1 ))
        local part_name="Part ${part_num}"
        
        if [[ ! -f "$file" ]]; then
            log_warn "File not found, skipping: $file"
            continue
        fi
        
        if (( total_files == 1 )); then
            part_name="Full"
        fi
        
        log_step "Uploading ${part_name} of ${total_files}: $(basename "$file")"
        log_separator
        
        # Upload to Gofile
        if upload_to_gofile "$file" "$part_name"; then
            gofile_ok=true
        fi
        
        random_sleep 2 4
        
        # Upload to Pixeldrain
        if upload_to_pixeldrain "$file" "$part_name"; then
            pixeldrain_ok=true
        fi
        
        random_sleep 2 4
        
        # Upload to Archive.org
        if upload_to_archive "$file" "$part_name"; then
            archive_ok=true
        fi
        
        log_separator
    done
    
    # ── Count successes ──────────────────────────────────────────────────────
    UPLOAD_SUCCESS_COUNT=0
    [[ "$gofile_ok" == "true" ]] && (( UPLOAD_SUCCESS_COUNT++ ))
    [[ "$pixeldrain_ok" == "true" ]] && (( UPLOAD_SUCCESS_COUNT++ ))
    [[ "$archive_ok" == "true" ]] && (( UPLOAD_SUCCESS_COUNT++ ))
    
    local upload_elapsed=$(( $(now_epoch) - UPLOAD_START_TIME ))
    
    # ── Export results ───────────────────────────────────────────────────────
    log_separator
    log_ok "═══ UPLOAD COMPLETE ═══"
    log_info "  Success : ${UPLOAD_SUCCESS_COUNT}/${UPLOAD_TOTAL_SERVICES} services"
    log_info "  Time    : $(format_duration_human "$upload_elapsed")"
    
    # Build links strings for env
    local gofile_links_str="" pixeldrain_links_str="" archive_links_str=""
    
    for entry in "${GOFILE_LINKS[@]:-}"; do
        [[ -n "$entry" ]] && gofile_links_str+="${entry};"
    done
    for entry in "${PIXELDRAIN_LINKS[@]:-}"; do
        [[ -n "$entry" ]] && pixeldrain_links_str+="${entry};"
    done
    for entry in "${ARCHIVE_LINKS[@]:-}"; do
        [[ -n "$entry" ]] && archive_links_str+="${entry};"
    done
    
    set_env "UPLOAD_SUCCESS_COUNT" "$UPLOAD_SUCCESS_COUNT"
    set_env "UPLOAD_TOTAL_SERVICES" "$UPLOAD_TOTAL_SERVICES"
    set_env "UPLOAD_TIME_SEC" "$upload_elapsed"
    set_env "UPLOAD_TIME_FMT" "$(format_duration_human "$upload_elapsed")"
    set_env "GOFILE_LINKS" "${gofile_links_str%%;}"
    set_env "PIXELDRAIN_LINKS" "${pixeldrain_links_str%%;}"
    set_env "ARCHIVE_LINKS" "${archive_links_str%%;}"
    
    set_output "upload_success" "${UPLOAD_SUCCESS_COUNT}/${UPLOAD_TOTAL_SERVICES}"
    set_output "gofile_links" "${gofile_links_str%%;}"
    set_output "pixeldrain_links" "${pixeldrain_links_str%%;}"
    set_output "archive_links" "${archive_links_str%%;}"
    set_output "upload_time" "$(format_duration_human "$upload_elapsed")"
    
    if (( UPLOAD_SUCCESS_COUNT > 0 )); then
        log_ok "At least one service succeeded — recording is accessible"
        return 0
    else
        log_error "All upload services failed — recording may be lost!"
        return 1
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    upload_to_clouds
fi
