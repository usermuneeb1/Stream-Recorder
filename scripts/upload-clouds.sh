#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  📡 STREAM RECORDER — MULTI-CLOUD REDUNDANCY UPLOAD                        ║
# ║  Uploads every recording to multiple independent cloud services:            ║
# ║    1. Gofile       — No account needed, 10-day retention                   ║
# ║    2. Pixeldrain   — 60 days, 10GB/file, download links                    ║
# ║    3. Archive.org  — PERMANENT, never expires, full metadata                ║
# ║    4. MEGA.nz      — PERMANENT, 20GB free, auto-rotating accounts          ║
# ║  Each upload is independent — one failure doesn't stop the others.          ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

# ═══════════════════════════════════════════════════════════════════════════════
#  RESULT TRACKING
# ═══════════════════════════════════════════════════════════════════════════════

GOFILE_LINKS=()
MEGA_LINKS=()
ARCHIVE_LINKS=()
PIXELDRAIN_LINKS=()
UPLOAD_SUCCESS_COUNT=0
UPLOAD_TOTAL_SERVICES=4
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
#  SERVICE 3: MEGA.NZ UPLOAD
#  PERMANENT encrypted cloud storage — 20GB free.
#  Uses megatools CLI: megaput (upload) + megals -e (get public link).
#  Requires: MEGA_EMAIL, MEGA_PASSWORD
# ═══════════════════════════════════════════════════════════════════════════════

upload_to_mega() {
    local file="$1"
    local part_name="$2"
    local mega_email="${MEGA_EMAIL:-}"
    local mega_pass="${MEGA_PASSWORD:-}"

    if [[ -z "$mega_email" ]] || [[ -z "$mega_pass" ]]; then
        log_warn "  MEGA.nz: Missing credentials — skipping (need MEGA_EMAIL, MEGA_PASSWORD)"
        return 1
    fi

    log_info "  🔴 MEGA.nz: Uploading $(basename "$file") ($(format_size "$(get_file_size "$file")"))..."
    local upload_start
    upload_start=$(now_epoch)

    # Install megatools if not available
    if ! command -v megaput &>/dev/null; then
        log_info "  MEGA.nz: Installing megatools..."
        sudo apt-get install -y -qq megatools 2>/dev/null || {
            log_error "  MEGA.nz: Failed to install megatools"
            return 1
        }
    fi

    # Create config file for authentication
    local mega_rc="/tmp/.megarc"
    cat > "$mega_rc" << EOF
[Login]
Username = ${mega_email}
Password = ${mega_pass}
EOF
    chmod 600 "$mega_rc"

    # Create remote directory for organization
    local remote_dir="/Root/StreamRecorder"
    megamkdir --config "$mega_rc" "$remote_dir" 2>/dev/null || true

    # Upload the file
    local safe_filename
    safe_filename=$(make_safe_filename "$(basename "$file")")
    local remote_path="${remote_dir}/${safe_filename}"

    local max_retries="${MEGA_MAX_RETRIES:-3}"
    local attempt=1

    while (( attempt <= max_retries )); do
        log_debug "  MEGA.nz: Upload attempt ${attempt}/${max_retries}"

        local mega_error=""
        mega_error=$(megaput --config "$mega_rc" --path "$remote_dir/" "$file" 2>&1) && {
            # Get public link
            local export_output public_link
            export_output=$(megals --config "$mega_rc" -e "$remote_path" 2>/dev/null) || \
            export_output=$(megals --config "$mega_rc" -e "${remote_dir}/$(basename "$file")" 2>/dev/null) || true

            # megals -e output format: "https://mega.nz/file/xxx#yyy /Root/path/file.mp4"
            public_link=$(echo "$export_output" | grep -oP 'https://mega\.nz/\S+' | head -1)

            if [[ -z "$public_link" ]]; then
                # Try to export using megals
                log_debug "  MEGA.nz: Trying to find uploaded file..."
                export_output=$(megals --config "$mega_rc" -e "$remote_dir/" 2>/dev/null) || true
                public_link=$(echo "$export_output" | grep "$(basename "$file")" | grep -oP 'https://mega\.nz/\S+' | head -1)
            fi

            local upload_elapsed=$(( $(now_epoch) - upload_start ))
            local fsize speed
            fsize=$(get_file_size "$file")
            (( upload_elapsed > 0 )) && speed=$(format_size $(( fsize / upload_elapsed ))) || speed="instant"

            if [[ -n "$public_link" ]]; then
                log_ok "  MEGA.nz: ✅ Upload complete — ${upload_elapsed}s (${speed}/s)"
                log_info "  MEGA.nz: Link → ${public_link} (PERMANENT)"
                MEGA_LINKS+=("${part_name}|${public_link}")
            else
                # File uploaded but couldn't get public link — still a success
                log_ok "  MEGA.nz: ✅ Upload complete — ${upload_elapsed}s (${speed}/s)"
                log_warn "  MEGA.nz: File uploaded but public link unavailable (check mega.nz account)"
                MEGA_LINKS+=("${part_name}|https://mega.nz (check account)")
            fi

            rm -f "$mega_rc"
            return 0
        }

        log_warn "  MEGA.nz: Upload attempt ${attempt} failed"
        log_warn "  MEGA.nz: Error: ${mega_error}"
        (( attempt++ ))
        sleep 10
    done

    rm -f "$mega_rc"
    log_error "  MEGA.nz: ❌ All ${max_retries} attempts failed"
    return 1
}

# ═══════════════════════════════════════════════════════════════════════════════
#  SERVICE 4: ARCHIVE.ORG UPLOAD
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
            -H "x-archive-meta-title: Personal Media Backup" \
            -H "x-archive-meta-creator: Media Archive Bot" \
            -H "x-archive-meta-date: ${record_date}" \
            -H "x-archive-meta-description: Personal media backup file." \
            -H "x-archive-meta-mediatype: movies" \
            -H "x-archive-meta-collection: opensource_movies" \
            -H "x-archive-meta-subject: backup;media;personal;archive" \
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
#  THUMBNAIL → CLOUD (not stored in git repo)
#  1) MEGA — permanent copy in YOUR account (/Root/TheMuslimLantern/thumbnails/)
#  2) Archive.org image — hotlink URL for dashboard (works when YouTube thumb dies)
#  3) Gofile direct — fallback display URL
#  Pixeldrain skipped by default (GitHub Actions datacenter IPs are often blocked)
# ═══════════════════════════════════════════════════════════════════════════════

upload_thumbnail_to_archive() {
    local thumb_file="$1"
    local access_key="${ARCHIVE_ACCESS_KEY:-}"
    local secret_key="${ARCHIVE_SECRET_KEY:-}"
    [[ -z "$access_key" || -z "$secret_key" ]] && return 1

    local video_id="${STREAM_VIDEO_ID:-unknown}"
    local identifier="tml-thumb-${video_id}"
    identifier=$(echo "$identifier" | sed 's/[^a-zA-Z0-9_-]/-/g' | cut -c1-80)
    local safe_name="thumbnail_${video_id}.jpg"

    local http_code
    http_code=$(curl -s --max-time 180 -o /dev/null -w '%{http_code}' \
        -H "authorization: LOW ${access_key}:${secret_key}" \
        -H "x-archive-auto-make-bucket: 1" \
        -H "x-archive-meta-title: The Muslim Lantern Thumbnail ${video_id}" \
        -H "x-archive-meta-mediatype: image" \
        -H "x-archive-meta-collection: opensource_image" \
        -H "Content-Type: image/jpeg" \
        --upload-file "$thumb_file" \
        "https://s3.us.archive.org/${identifier}/${safe_name}" 2>/dev/null) || http_code="000"

    if [[ "$http_code" =~ ^2[0-9]{2}$ ]]; then
        THUMBNAIL_CLOUD_URL="https://archive.org/download/${identifier}/${safe_name}"
        set_env "THUMBNAIL_CLOUD_URL" "$THUMBNAIL_CLOUD_URL"
        set_env "STREAM_THUMBNAIL" "$THUMBNAIL_CLOUD_URL"
        log_ok "Thumbnail on Archive.org (dashboard image) → ${THUMBNAIL_CLOUD_URL}"
        return 0
    fi
    return 1
}

upload_thumbnail_to_mega() {
    local thumb_file="$1"
    local mega_email="${MEGA_EMAIL:-}"
    local mega_pass="${MEGA_PASSWORD:-}"
    [[ -z "$mega_email" || -z "$mega_pass" ]] && return 1

    if ! command -v megaput &>/dev/null; then
        sudo apt-get install -y -qq megatools 2>/dev/null || return 1
    fi

    local video_id="${STREAM_VIDEO_ID:-unknown}"
    local mega_rc="/tmp/.megarc_thumb"
    cat > "$mega_rc" << EOF
[Login]
Username = ${mega_email}
Password = ${mega_pass}
EOF
    chmod 600 "$mega_rc"

    local remote_dir="/Root/TheMuslimLantern/thumbnails"
    local remote_name="tml_${video_id}.jpg"
    megamkdir --config "$mega_rc" "$remote_dir" 2>/dev/null || true

    local staged_thumb="/tmp/${remote_name}"
    cp "$thumb_file" "$staged_thumb" 2>/dev/null || return 1
    if megaput --config "$mega_rc" --path "${remote_dir}/" "$staged_thumb" 2>/dev/null; then
        rm -f "$staged_thumb"
        local export_output public_link
        export_output=$(megals --config "$mega_rc" -e "${remote_dir}/${remote_name}" 2>/dev/null) || true
        public_link=$(echo "$export_output" | grep -oP 'https://mega\.nz/\S+' | head -1)
        rm -f "$mega_rc"
        if [[ -n "$public_link" ]]; then
            THUMBNAIL_MEGA_URL="$public_link"
            set_env "THUMBNAIL_MEGA_URL" "$THUMBNAIL_MEGA_URL"
            log_ok "Thumbnail saved on MEGA (your account) → ${THUMBNAIL_MEGA_URL}"
            return 0
        fi
        log_ok "Thumbnail uploaded to MEGA at ${remote_dir}/${remote_name} (export link pending)"
        return 0
    fi
    rm -f "$mega_rc"
    return 1
}

upload_thumbnail_to_cloud() {
    local thumb_file="${1:-}"
    [[ -z "$thumb_file" || ! -s "$thumb_file" ]] && thumb_file="${LOCAL_THUMBNAIL_PATH:-}"
    [[ -z "$thumb_file" || ! -s "$thumb_file" ]] && thumb_file="${RECORD_DIR:-/tmp/stream-recorder}/stream_thumbnail.jpg"
    if [[ ! -s "$thumb_file" ]]; then
        log_warn "No local thumbnail to upload for dashboard"
        return 1
    fi

    log_step "Uploading thumbnail to cloud (MEGA account + dashboard hotlink)..."

    upload_thumbnail_to_mega "$thumb_file" || log_warn "MEGA thumbnail upload failed"

    upload_thumbnail_to_archive "$thumb_file" || log_warn "Archive thumbnail upload failed — trying Gofile..."

    if [[ -z "${THUMBNAIL_CLOUD_URL:-}" ]]; then
        local gf_response gf_status gf_code gf_link
        gf_response=$(curl -s --max-time 120 -F "file=@${thumb_file}" \
            "https://upload.gofile.io/uploadfile" 2>/dev/null) || true
        gf_status=$(echo "$gf_response" | jq -r '.status // empty' 2>/dev/null)
        gf_code=$(echo "$gf_response" | jq -r '.data.code // .data.fileId // empty' 2>/dev/null)
        if [[ "$gf_status" == "ok" && -n "$gf_code" ]]; then
            contents=$(curl -s --max-time 60 "https://api.gofile.io/contents/${gf_code}?wt=4fd6sg89d7s6" 2>/dev/null) || true
            gf_link=$(echo "$contents" | jq -r '(.data.children // {}) | to_entries[0].value.link // empty' 2>/dev/null)
            if [[ -n "$gf_link" && "$gf_link" == http* ]]; then
                THUMBNAIL_CLOUD_URL="$gf_link"
                set_env "THUMBNAIL_CLOUD_URL" "$THUMBNAIL_CLOUD_URL"
                set_env "STREAM_THUMBNAIL" "$THUMBNAIL_CLOUD_URL"
                log_ok "Thumbnail display URL (Gofile) → ${THUMBNAIL_CLOUD_URL}"
            fi
        fi
    fi

    if [[ "${PIXELDRAIN_SKIP_THUMBNAIL:-true}" != "true" && -z "${THUMBNAIL_CLOUD_URL:-}" ]]; then
        log_info "Trying Pixeldrain for thumbnail (may fail: datacenter IP block on GitHub Actions)..."
        local api_key="${PIXELDRAIN_API_KEY:-}"
        local upload_response http_code json_body file_id
        upload_response=$(curl -s --max-time 120 \
            ${api_key:+-H "Authorization: Bearer ${api_key}"} \
            -F "file=@${thumb_file};filename=stream_thumbnail.jpg" \
            -w $'\n%{http_code}' \
            "https://pixeldrain.com/api/file" 2>/dev/null) || true
        http_code=$(echo "$upload_response" | tail -1)
        json_body=$(echo "$upload_response" | head -n -1)
        file_id=$(echo "$json_body" | jq -r '.id // empty' 2>/dev/null)
        if [[ -n "$file_id" ]] && [[ "$http_code" =~ ^2 ]]; then
            THUMBNAIL_CLOUD_URL="https://pixeldrain.com/api/file/${file_id}"
            set_env "THUMBNAIL_CLOUD_URL" "$THUMBNAIL_CLOUD_URL"
            set_env "STREAM_THUMBNAIL" "$THUMBNAIL_CLOUD_URL"
            log_ok "Thumbnail on Pixeldrain → ${THUMBNAIL_CLOUD_URL}"
        else
            log_warn "Pixeldrain blocked or failed (common on GitHub Actions IPs). Use MEGA + Archive."
        fi
    fi

    if [[ -n "${THUMBNAIL_MEGA_URL:-}" || -n "${THUMBNAIL_CLOUD_URL:-}" ]]; then
        return 0
    fi
    log_warn "Thumbnail cloud upload incomplete — dashboard may fall back to YouTube image"
    return 1
}

upload_to_clouds() {
    log_header "☁️ MULTI-CLOUD REDUNDANCY UPLOAD"

    UPLOAD_START_TIME=$(now_epoch)

    local files_list="${PROCESSED_FILES_LIST:-}"
    if [[ -z "$files_list" ]]; then
        log_error "No processed files to upload (PROCESSED_FILES_LIST not set)"
        return 1
    fi

    IFS='|' read -ra FILES <<< "$files_list"
    local total_files=${#FILES[@]}

    # ── MEGA Account Rotation ──
    # Source the rotation script to auto-select MEGA credentials from accounts.csv
    if [[ "${MEGA_SKIP:-false}" != "true" ]]; then
        if [[ -f "$SCRIPT_DIR/mega-rotate.sh" ]]; then
            source "$SCRIPT_DIR/mega-rotate.sh"
            select_mega_account || true
        fi
    fi

    # Count active services dynamically
    local active_services=0
    [[ "${GOFILE_SKIP:-false}" != "true" ]] && (( active_services++ ))
    [[ "${PIXELDRAIN_SKIP:-false}" != "true" ]] && (( active_services++ ))
    [[ "${MEGA_SKIP:-false}" != "true" ]] && [[ -n "${MEGA_EMAIL:-}" ]] && (( active_services++ ))
    [[ "${ARCHIVE_SKIP:-false}" != "true" ]] && [[ -n "${ARCHIVE_ACCESS_KEY:-}" ]] && (( active_services++ ))
    UPLOAD_TOTAL_SERVICES=$active_services

    log_info "Files to upload: ${total_files}"
    log_info "Active services: ${active_services}"
    log_info "Upload started : $(now_pkt)"

    local total_size=0
    for f in "${FILES[@]}"; do
        [[ -f "$f" ]] && total_size=$(( total_size + $(get_file_size "$f") ))
    done
    log_info "Total size: $(format_size "$total_size")"

    local file_num=0
    local expected_total_uploads=0
    for f in "${FILES[@]}"; do
        (( file_num++ ))
        if [[ ! -f "$f" ]]; then
            log_warn "File not found: $f — skipping"
            continue
        fi

        log_separator
        local part_name
        local basename_f
        basename_f=$(basename "$f")
        
        # Detect compressed version
        if [[ "$basename_f" == *"_compressed"* ]]; then
            part_name="Compressed"
        elif (( total_files <= 2 )); then
            part_name="HD"
        else
            part_name="Part${file_num}"
        fi

        log_step "Uploading ${part_name} of ${total_files}: $(basename "$f")"
        log_separator

        local svc_success=0
        local is_compressed=false
        [[ "$part_name" == "Compressed" ]] && is_compressed=true

        # ── 1. Gofile (uploads ALL files — HD + compressed) ──
        if [[ "${GOFILE_SKIP:-false}" != "true" ]]; then
            (( expected_total_uploads++ ))
            if upload_to_gofile "$f" "$part_name"; then
                (( svc_success++ ))
            else
                log_warn "  Gofile: First attempt failed — retrying after 10s..."
                sleep 10
                if upload_to_gofile "$f" "$part_name"; then
                    (( svc_success++ ))
                fi
            fi
        else
            log_info "  Gofile: Skipped (GOFILE_SKIP=true)"
        fi

        # ── 2. Pixeldrain (uploads ALL files — HD + compressed) ──
        if [[ "${PIXELDRAIN_SKIP:-false}" != "true" ]]; then
            (( expected_total_uploads++ ))
            if upload_to_pixeldrain "$f" "$part_name"; then
                (( svc_success++ ))
            else
                log_warn "  Pixeldrain: First attempt failed — retrying after 10s..."
                sleep 10
                if upload_to_pixeldrain "$f" "$part_name"; then
                    (( svc_success++ ))
                fi
            fi
        else
            log_info "  Pixeldrain: Skipped (PIXELDRAIN_SKIP=true)"
        fi

        # ── 3. Archive.org (HD only — skip compressed) ──
        if [[ "$is_compressed" == "true" ]]; then
            log_info "  Archive.org: Skipped (compressed — HD only)"
        elif [[ "${ARCHIVE_SKIP:-false}" != "true" ]]; then
            (( expected_total_uploads++ ))
            if upload_to_archive "$f" "$part_name"; then
                (( svc_success++ ))
            else
                log_warn "  Archive.org: First attempt failed — retrying after 10s..."
                sleep 10
                if upload_to_archive "$f" "$part_name"; then
                    (( svc_success++ ))
                fi
            fi
        else
            log_info "  Archive.org: Skipped (ARCHIVE_SKIP=true)"
        fi

        # ── 4. MEGA.nz (HD only — skip compressed) ──
        if [[ "$is_compressed" == "true" ]]; then
            log_info "  MEGA.nz: Skipped (compressed — HD only)"
        elif [[ "${MEGA_SKIP:-false}" != "true" ]] && [[ -n "${MEGA_EMAIL:-}" ]]; then
            (( expected_total_uploads++ ))
            if upload_to_mega "$f" "$part_name"; then
                (( svc_success++ ))
            else
                log_warn "  MEGA.nz: First attempt failed — retrying after 10s..."
                sleep 10
                if upload_to_mega "$f" "$part_name"; then
                    (( svc_success++ ))
                fi
            fi
        elif [[ "${MEGA_SKIP:-false}" == "true" ]]; then
            log_info "  MEGA.nz: Skipped (MEGA_SKIP=true)"
        else
            log_info "  MEGA.nz: Skipped (no credentials)" 
        fi

        UPLOAD_SUCCESS_COUNT=$(( UPLOAD_SUCCESS_COUNT + svc_success ))
    done

    log_separator

    # Dashboard thumbnail (cloud URL — not committed to repo)
    upload_thumbnail_to_cloud || true

    log_separator

    # ── Export results ──
    local gofile_str="" pixeldrain_str="" archive_str="" mega_str=""
    if (( ${#GOFILE_LINKS[@]} > 0 )); then
        local _ifs="$IFS"; IFS=';'; gofile_str="${GOFILE_LINKS[*]}"; IFS="$_ifs"
    fi
    if (( ${#PIXELDRAIN_LINKS[@]} > 0 )); then
        local _ifs="$IFS"; IFS=';'; pixeldrain_str="${PIXELDRAIN_LINKS[*]}"; IFS="$_ifs"
    fi
    if (( ${#ARCHIVE_LINKS[@]} > 0 )); then
        local _ifs="$IFS"; IFS=';'; archive_str="${ARCHIVE_LINKS[*]}"; IFS="$_ifs"
    fi
    if (( ${#MEGA_LINKS[@]} > 0 )); then
        local _ifs="$IFS"; IFS=';'; mega_str="${MEGA_LINKS[*]}"; IFS="$_ifs"
    fi

    set_env "GOFILE_LINKS"         "$gofile_str"
    set_env "PIXELDRAIN_LINKS"     "$pixeldrain_str"
    set_env "ARCHIVE_LINKS"        "$archive_str"
    set_env "MEGA_LINKS"           "$mega_str"
    set_env "UPLOAD_SUCCESS_COUNT" "$UPLOAD_SUCCESS_COUNT"
    set_env "UPLOAD_EXPECTED_COUNT" "$expected_total_uploads"
    set_env "UPLOAD_TOTAL_SERVICES" "$UPLOAD_TOTAL_SERVICES"

    local upload_elapsed=$(( $(now_epoch) - UPLOAD_START_TIME ))
    set_env "UPLOAD_ELAPSED_HUMAN" "$(format_duration_human "$upload_elapsed")"

    log_separator
    log_ok "═══ UPLOAD SUMMARY ═══"
    log_info "  Services succeeded : ${UPLOAD_SUCCESS_COUNT}/${expected_total_uploads} (${UPLOAD_TOTAL_SERVICES} active services)"
    log_info "  Total elapsed      : ${upload_elapsed}s"
    [[ -n "$gofile_str"       ]] && log_ok  "  Gofile       ✅ : ${GOFILE_LINKS[*]}"
    [[ -n "$pixeldrain_str"   ]] && log_ok  "  Pixeldrain   ✅ : ${PIXELDRAIN_LINKS[*]}"
    [[ -n "$archive_str"      ]] && log_ok  "  Archive.org  ✅ : ${ARCHIVE_LINKS[*]}"
    [[ -n "$mega_str"         ]] && log_ok  "  MEGA.nz      ✅ : ${MEGA_LINKS[*]}"
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
