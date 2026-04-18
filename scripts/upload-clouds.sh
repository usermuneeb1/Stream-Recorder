#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  📡 STREAM RECORDER — TRIPLE CLOUD REDUNDANCY UPLOAD                       ║
# ║  Uploads every recording to 3 independent cloud services:                  ║
# ║    1. Gofile     — No account needed, regional servers, 10-day retention   ║
# ║    2. Pixeldrain — Fast CDN, API-based, 60-day retention                   ║
# ║    3. Archive.org — PERMANENT, never expires, full metadata                ║
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
#  HELPER: safe filename (strip emoji + special chars for cloud URLs)
# ═══════════════════════════════════════════════════════════════════════════════

make_safe_filename() {
    local raw="$1"
    local safe
    # Remove non-printable (emoji), keep alphanum + ._- space, replace space with _
    safe=$(echo "$raw" \
        | LC_ALL=C sed 's/[^[:print:]]//g' \
        | sed 's/[^a-zA-Z0-9._\-]/_/g' \
        | sed 's/__*/_/g' \
        | cut -c1-200)
    [[ -z "$safe" ]] && safe="recording_$(date +%s).mp4"
    echo "$safe"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  SERVICE 1: GOFILE UPLOAD
#  No account needed, fast, multiple regional servers
# ═══════════════════════════════════════════════════════════════════════════════

upload_to_gofile() {
    local file="$1"
    local part_name="$2"
    local api_key="${GOFILE_API_KEY:-}"

    log_info "  🟠 Gofile: Uploading $(basename "$file") ($(format_size "$(get_file_size "$file")"))..."

    local max_retries="${GOFILE_MAX_RETRIES:-3}"
    local attempt=1

    local -a endpoints=(
        "https://upload.gofile.io/uploadfile"
        "https://upload-eu-par.gofile.io/uploadfile"
        "https://upload-na-phx.gofile.io/uploadfile"
        "https://upload-ap-sgp.gofile.io/uploadfile"
    )
    local endpoint_idx=0

    while (( attempt <= max_retries )); do
        local endpoint="${endpoints[$endpoint_idx]:-${endpoints[0]}}"
        local upload_start upload_response
        upload_start=$(now_epoch)

        log_debug "  Gofile attempt ${attempt}/${max_retries} → ${endpoint}"

        if [[ -n "$api_key" ]]; then
            upload_response=$(curl -s --max-time "${UPLOAD_TIMEOUT:-3600}" \
                -H "Authorization: Bearer ${api_key}" \
                -F "file=@${file}" \
                "$endpoint" 2>/dev/null) || true
        else
            upload_response=$(curl -s --max-time "${UPLOAD_TIMEOUT:-3600}" \
                -F "file=@${file}" \
                "$endpoint" 2>/dev/null) || true
        fi

        local upload_elapsed=$(( $(now_epoch) - upload_start ))

        local status download_page file_code
        status=$(echo "$upload_response"       | jq -r '.status // empty' 2>/dev/null)
        download_page=$(echo "$upload_response" | jq -r '.data.downloadPage // empty' 2>/dev/null)
        file_code=$(echo "$upload_response"    | jq -r '.data.code // .data.fileId // empty' 2>/dev/null)

        if [[ "$status" == "ok" ]] && { [[ -n "$download_page" ]] || [[ -n "$file_code" ]]; }; then
            local link="${download_page:-https://gofile.io/d/${file_code}}"
            local speed fsize
            fsize=$(get_file_size "$file")
            (( upload_elapsed > 0 )) && speed=$(format_size $(( fsize / upload_elapsed ))) || speed="instant"
            log_ok "  Gofile: ✅ Upload complete — ${upload_elapsed}s (${speed}/s)"
            log_info "  Gofile: Link → ${link}"
            GOFILE_LINKS+=("${part_name}|${link}")
            return 0
        fi

        log_warn "  Gofile: Upload failed on ${endpoint} (attempt ${attempt}) — ${upload_response:0:200}"
        (( attempt++ ))
        endpoint_idx=$(( (endpoint_idx + 1) % ${#endpoints[@]} ))
        sleep 5
    done

    log_error "  Gofile: ❌ All ${max_retries} attempts/endpoints failed"
    return 1
}

# ═══════════════════════════════════════════════════════════════════════════════
#  SERVICE 2: PIXELDRAIN UPLOAD
#  Fast CDN, API-based, 60-day retention
#
#  ROOT CAUSE OF PAST FAILURES:
#   • Without API key: PUT requests are REJECTED (401 Unauthorized)
#   • Fix: use POST multipart for anonymous uploads; PUT only with API key
#   • Also: emoji in filename breaks the PUT URL → use safe ASCII filename
#   • Also: 2>&1 was mixing curl stderr into JSON response → use 2>/dev/null
# ═══════════════════════════════════════════════════════════════════════════════

upload_to_pixeldrain() {
    local file="$1"
    local part_name="$2"
    local api_key="${PIXELDRAIN_API_KEY:-}"

    log_info "  🔵 Pixeldrain: Uploading $(basename "$file") ($(format_size "$(get_file_size "$file")"))..."

    local max_retries="${PIXELDRAIN_MAX_RETRIES:-3}"
    local attempt=1

    local raw_filename safe_filename display_filename
    raw_filename=$(basename "$file")
    safe_filename=$(make_safe_filename "$raw_filename")
    display_filename="$raw_filename"

    log_debug "  Pixeldrain safe_filename: ${safe_filename}"

    while (( attempt <= max_retries )); do
        local upload_start upload_response http_code json_body
        upload_start=$(now_epoch)

        log_debug "  Pixeldrain attempt ${attempt}/${max_retries} (api_key=${api_key:+SET})"

        if [[ -n "$api_key" ]]; then
            # ── PUT method with API key ────────────────────────────────────────
            # Recommended by Pixeldrain docs: curl -T file -u :KEY /api/file/
            # Using safe filename in URL to avoid emoji/special char issues
            upload_response=$(curl -s \
                --max-time "${UPLOAD_TIMEOUT:-3600}" \
                -T "$file" \
                -u ":${api_key}" \
                -w $'\n%{http_code}' \
                "https://pixeldrain.com/api/file/${safe_filename}" \
                2>/dev/null) || true
        else
            # ── POST multipart — anonymous upload (no API key) ─────────────────
            # Pixeldrain allows anonymous POST uploads; the file is not linked
            # to any user account. Files are public by default.
            # POST returns: {"success":true,"id":"abc123"} on HTTP 200
            upload_response=$(curl -s \
                --max-time "${UPLOAD_TIMEOUT:-3600}" \
                -F "file=@${file};filename=${display_filename}" \
                -w $'\n%{http_code}' \
                "https://pixeldrain.com/api/file" \
                2>/dev/null) || true
        fi

        local upload_elapsed=$(( $(now_epoch) - upload_start ))

        # -w appends HTTP code as the last line; separate it from JSON body
        http_code=$(echo "$upload_response" | tail  -1)
        json_body=$(echo "$upload_response" | head  -n -1)

        log_debug "  Pixeldrain HTTP ${http_code} body: ${json_body:0:300}"

        local file_id success_val
        file_id=$(echo "$json_body"    | jq -r '.id // empty'              2>/dev/null)
        success_val=$(echo "$json_body" | jq -r '.success // "true"'       2>/dev/null)

        if [[ -n "$file_id" ]] && [[ "$success_val" != "false" ]]; then
            local link="https://pixeldrain.com/u/${file_id}"
            local speed fsize
            fsize=$(get_file_size "$file")
            (( upload_elapsed > 0 )) && speed=$(format_size $(( fsize / upload_elapsed ))) || speed="instant"
            log_ok "  Pixeldrain: ✅ Upload complete — ${upload_elapsed}s (${speed}/s)"
            log_info "  Pixeldrain: Link → ${link}"
            PIXELDRAIN_LINKS+=("${part_name}|${link}")
            return 0
        fi

        # Log actual error from Pixeldrain for diagnosis
        local err_val err_msg
        err_val=$(echo "$json_body" | jq -r '.value   // empty' 2>/dev/null)
        err_msg=$(echo "$json_body" | jq -r '.message // empty' 2>/dev/null)
        log_warn "  Pixeldrain: attempt ${attempt} — HTTP=${http_code} error='${err_val:-?}' msg='${err_msg:-no message}'"

        # Early-exit on permanent errors (no point retrying)
        if [[ "$err_val" == "file_too_large" ]]; then
            log_error "  Pixeldrain: File exceeds size limit — cannot upload this file"
            return 1
        fi
        if [[ "$err_val" == "unauthorized" ]] && [[ -z "$api_key" ]]; then
            log_error "  Pixeldrain: Unauthorized on anonymous POST — add PIXELDRAIN_API_KEY to GitHub Secrets"
            return 1
        fi
        if [[ "$err_val" == "name_too_long" ]]; then
            log_error "  Pixeldrain: Filename too long (max 255 chars) — safe_filename=${safe_filename}"
            return 1
        fi

        (( attempt++ ))
        sleep 5
    done

    log_error "  Pixeldrain: ❌ All ${max_retries} attempts failed"
    return 1
}

# ═══════════════════════════════════════════════════════════════════════════════
#  SERVICE 3: ARCHIVE.ORG UPLOAD
#  PERMANENT storage — files NEVER expire. Rich metadata.
#
#  ROOT CAUSE OF PAST FAILURES:
#   • Emoji in filename (🔴) inside S3 URL → curl fails immediately (exit 3/6)
#   • Fix: strip emoji + use ASCII-only filename in the S3 URL
#   • Also: improved error logging with curl exit code decoding
# ═══════════════════════════════════════════════════════════════════════════════

upload_to_archive() {
    local file="$1"
    local part_name="$2"
    local access_key="${ARCHIVE_ACCESS_KEY:-}"
    local secret_key="${ARCHIVE_SECRET_KEY:-}"

    if [[ -z "$access_key" ]] || [[ -z "$secret_key" ]]; then
        log_warn "  Archive.org: ARCHIVE_ACCESS_KEY / ARCHIVE_SECRET_KEY not set — skipping"
        return 1
    fi

    log_info "  🏛️  Archive.org: Uploading $(basename "$file") ($(format_size "$(get_file_size "$file")"))..."

    # Identifier must be alphanumeric + hyphens only (Archive.org bucket name)
    local video_id="${STREAM_VIDEO_ID:-unknown}"
    local date_str timestamp identifier
    date_str=$(TZ='Asia/Karachi' date '+%Y-%m')
    timestamp=$(date '+%s')
    identifier="tml-${date_str}-${video_id}-${timestamp}"
    identifier=$(echo "$identifier" | sed 's/[^a-zA-Z0-9_-]/-/g' | cut -c1-100)

    # Metadata
    local title="${STREAM_TITLE:-Live Stream Recording}"
    local channel="${STREAM_CHANNEL:-Unknown Channel}"
    local record_date
    record_date=$(TZ='Asia/Karachi' date '+%Y-%m-%d')

    # Safe filename for S3 URL — Archive.org S3 URL cannot contain emoji/UTF-8
    local raw_filename safe_filename
    raw_filename=$(basename "$file")
    safe_filename=$(make_safe_filename "$raw_filename")

    log_debug "  Archive.org identifier: ${identifier}"
    log_debug "  Archive.org safe_filename: ${safe_filename}"

    local max_retries="${ARCHIVE_MAX_RETRIES:-3}"
    local attempt=1

    while (( attempt <= max_retries )); do
        local upload_start response_body http_code curl_exit time_total
        upload_start=$(now_epoch)

        log_debug "  Archive.org attempt ${attempt}/${max_retries}"

        # Upload via S3-compatible API with extended timeout for large files
        response_body=$(curl -s \
            --max-time "${UPLOAD_TIMEOUT:-7200}" \
            --retry 0 \
            --location \
            -o /dev/null \
            -w '%{http_code}|%{exitcode}|%{time_total}' \
            -H "authorization: LOW ${access_key}:${secret_key}" \
            -H "x-archive-auto-make-bucket: 1" \
            -H "x-archive-meta-title: ${title} (${record_date})" \
            -H "x-archive-meta-creator: ${channel}" \
            -H "x-archive-meta-date: ${record_date}" \
            -H "x-archive-meta-description: Live stream recording of ${title} by ${channel}. Recorded on ${record_date}. Part: ${part_name}." \
            -H "x-archive-meta-mediatype: movies" \
            -H "x-archive-meta-collection: opensource_movies" \
            -H "x-archive-meta-subject: livestream;recording;youtube;${channel// /_}" \
            -H "x-archive-meta-language: eng" \
            -H "Content-Type: video/mp4" \
            --upload-file "$file" \
            "https://s3.us.archive.org/${identifier}/${safe_filename}" \
            2>/dev/null) || response_body="000|$?|0"

        local upload_elapsed=$(( $(now_epoch) - upload_start ))
        http_code=$(echo "$response_body" | cut -d'|' -f1)
        curl_exit=$(echo "$response_body" | cut -d'|' -f2)
        time_total=$(echo "$response_body" | cut -d'|' -f3)

        log_debug "  Archive.org HTTP=${http_code} curl_exit=${curl_exit} transfer=${time_total}s"

        if [[ "$http_code" =~ ^2[0-9]{2}$ ]]; then
            local link="https://archive.org/details/${identifier}"
            local speed fsize
            fsize=$(get_file_size "$file")
            (( upload_elapsed > 0 )) && speed=$(format_size $(( fsize / upload_elapsed ))) || speed="instant"
            log_ok "  Archive.org: ✅ Upload complete — ${upload_elapsed}s (${speed}/s)"
            log_info "  Archive.org: Link → ${link} (PERMANENT)"
            ARCHIVE_LINKS+=("${part_name}|${link}|${identifier}")

            # Upload chat.json if available
            local chat_file="/tmp/stream-recorder/chat.json"
            if [[ -f "$chat_file" ]]; then
                log_info "  🏛️  Archive.org: Uploading chat.json..."
                curl -s -o /dev/null \
                    --max-time 300 --location \
                    -H "authorization: LOW ${access_key}:${secret_key}" \
                    -H "Content-Type: application/json" \
                    --upload-file "$chat_file" \
                    "https://s3.us.archive.org/${identifier}/chat.json" \
                    2>/dev/null || true
                set_env "RECORD_CHAT_URL" "https://archive.org/download/${identifier}/chat.json"
                log_ok "  Archive.org: Chat log uploaded"
            fi

            return 0
        fi

        # Decode curl exit codes for actionable diagnostics
        case "$curl_exit" in
            0)  log_warn "  Archive.org: HTTP ${http_code} (attempt ${attempt}) — server rejected upload" ;;
            3)  log_warn "  Archive.org: curl exit 3 — bad URL (likely unsafe chars in filename '${safe_filename}')" ;;
            6)  log_warn "  Archive.org: curl exit 6 — DNS failure, cannot resolve s3.us.archive.org" ;;
            7)  log_warn "  Archive.org: curl exit 7 — connection refused; Archive.org may be blocking this GitHub Actions IP range" ;;
            28) log_warn "  Archive.org: curl exit 28 — timed out after ${time_total}s (file may be too large for ${UPLOAD_TIMEOUT:-7200}s timeout)" ;;
            35) log_warn "  Archive.org: curl exit 35 — SSL handshake failed" ;;
            *)  log_warn "  Archive.org: curl exit ${curl_exit} / HTTP ${http_code} (attempt ${attempt})" ;;
        esac

        (( attempt++ ))
        sleep 15
    done

    log_error "  Archive.org: ❌ All ${max_retries} attempts failed"
    log_info   "  Archive.org: If exit 7, Archive.org is blocking GitHub Actions IPs. This is a known issue."
    log_info   "  Archive.org: Add secret ARCHIVE_SKIP=true to skip Archive.org uploading until this is resolved."
    return 1
}

# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN UPLOAD ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════════════════════

upload_to_clouds() {
    log_header "☁️ TRIPLE CLOUD REDUNDANCY UPLOAD"

    UPLOAD_START_TIME=$(now_epoch)

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
        [[ -f "$f" ]] && total_size=$(( total_size + $(get_file_size "$f") ))
    done
    log_info "Total size: $(format_size "$total_size")"

    local file_num=0
    for f in "${FILES[@]}"; do
        (( file_num++ ))
        if [[ ! -f "$f" ]]; then
            log_warn "File not found: $f — skipping"
            continue
        fi

        log_separator
        local part_name
        part_name="Part${file_num}"
        if (( total_files == 1 )); then
            part_name="Full"
        fi

        log_step "Uploading ${part_name} of ${total_files}: $(basename "$f")"
        log_separator

        local svc_success=0

        # ── Gofile ──
        if upload_to_gofile "$f" "$part_name"; then
            (( svc_success++ ))
        fi

        # ── Pixeldrain ──
        if [[ "${ARCHIVE_SKIP:-false}" != "true" ]]; then
            if upload_to_pixeldrain "$f" "$part_name"; then
                (( svc_success++ ))
            fi
        else
            log_info "  Pixeldrain: Skipped (ARCHIVE_SKIP=true)"
        fi

        # ── Archive.org ──
        if [[ "${ARCHIVE_SKIP:-false}" != "true" ]]; then
            if upload_to_archive "$f" "$part_name"; then
                (( svc_success++ ))
            fi
        else
            log_info "  Archive.org: Skipped (ARCHIVE_SKIP=true)"
        fi

        UPLOAD_SUCCESS_COUNT=$(( UPLOAD_SUCCESS_COUNT + svc_success ))
    done

    log_separator

    # ── Export results ──
    local gofile_str="" pixeldrain_str="" archive_str=""
    (( ${#GOFILE_LINKS[@]}      > 0 )) && gofile_str=$(IFS=';'; echo "${GOFILE_LINKS[*]}")
    (( ${#PIXELDRAIN_LINKS[@]}  > 0 )) && pixeldrain_str=$(IFS=';'; echo "${PIXELDRAIN_LINKS[*]}")
    (( ${#ARCHIVE_LINKS[@]}     > 0 )) && archive_str=$(IFS=';'; echo "${ARCHIVE_LINKS[*]}")

    set_env "GOFILE_LINKS"         "$gofile_str"
    set_env "PIXELDRAIN_LINKS"     "$pixeldrain_str"
    set_env "ARCHIVE_LINKS"        "$archive_str"
    set_env "UPLOAD_SUCCESS_COUNT" "$UPLOAD_SUCCESS_COUNT"
    set_env "UPLOAD_TOTAL_SERVICES" "$UPLOAD_TOTAL_SERVICES"

    local upload_elapsed=$(( $(now_epoch) - UPLOAD_START_TIME ))

    log_separator
    log_ok "═══ UPLOAD SUMMARY ═══"
    log_info "  Services succeeded : ${UPLOAD_SUCCESS_COUNT}/${UPLOAD_TOTAL_SERVICES} per file"
    log_info "  Total elapsed      : ${upload_elapsed}s"
    [[ -n "$gofile_str"      ]] && log_ok  "  Gofile      ✅ : ${GOFILE_LINKS[*]}"
    [[ -n "$pixeldrain_str"  ]] && log_ok  "  Pixeldrain  ✅ : ${PIXELDRAIN_LINKS[*]}"
    [[ -n "$archive_str"     ]] && log_ok  "  Archive.org ✅ : ${ARCHIVE_LINKS[*]}"
    log_separator

    if (( UPLOAD_SUCCESS_COUNT == 0 )); then
        log_error "All cloud uploads failed"
        return 1
    fi

    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    upload_to_clouds
fi
