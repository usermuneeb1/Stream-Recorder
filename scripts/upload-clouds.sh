#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  STREAM RECORDER, MULTI-CLOUD REDUNDANCY UPLOAD                              ║
# ║  Uploads every recording to multiple independent cloud services:             ║
# ║    1. Gofile, No account needed, 10-day retention                            ║
# ║    2. Pixeldrain, 60 days, 10GB/file, download links                         ║
# ║    3. Archive.org, PERMANENT, never expires, full metadata                   ║
# ║    4. MEGA.nz, PERMANENT, 20GB free, auto-rotating accounts                  ║
# ║  Each upload is independent, one failure doesn't stop the others.            ║
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
ST0807_LINKS=()
VIKINGFILE_LINKS=()
UPLOAD_SUCCESS_COUNT=0
UPLOAD_TOTAL_SERVICES=6
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

# Copy [offset, offset+length) from src into dest without dd bs=1 (too slow on GB files).
_slice_file() {
    local src="$1" dest="$2" offset="$3" length="$4"
    python3 - "$src" "$dest" "$offset" "$length" <<'PY'
import sys
src, dest, offset, length = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
with open(src, "rb") as f, open(dest, "wb") as o:
    f.seek(offset)
    remaining = length
    while remaining:
        buf = f.read(min(8 * 1024 * 1024, remaining))
        if not buf:
            break
        o.write(buf)
        remaining -= len(buf)
PY
}

# ═══════════════════════════════════════════════════════════════════════════════
#  SERVICE 1: GOFILE UPLOAD
#  2026 API: anonymous one-shot uploads are DEAD (error-createFolderResponse).
#  Working flow (verified live): POST /accounts mints a token, then upload
#  with Authorization: Bearer. GOFILE_API_KEY (a real account token) wins if
#  set; otherwise ONE guest account is minted per run and reused for every
#  file — the docs explicitly say never mint an account per upload.
# ═══════════════════════════════════════════════════════════════════════════════

GOFILE_GUEST_TOKEN=""

_gofile_token() {
    # Echoes a usable bearer token; empty string on failure.
    if [[ -n "${GOFILE_API_KEY:-}" ]]; then
        echo "${GOFILE_API_KEY}"
        return 0
    fi
    if [[ -n "$GOFILE_GUEST_TOKEN" ]]; then
        echo "$GOFILE_GUEST_TOKEN"
        return 0
    fi
    local resp
    resp=$(curl -s --max-time 30 -X POST "https://api.gofile.io/accounts" \
        -H "Content-Type: application/json" -d '{}' 2>/dev/null) || true
    local tok
    tok=$(echo "$resp" | jq -r '.data.token // empty' 2>/dev/null)
    if [[ -n "$tok" ]]; then
        GOFILE_GUEST_TOKEN="$tok"
        echo "$tok"
        return 0
    fi
    log_warn "  Gofile: could not mint guest account (${resp:0:120})"
    return 1
}

upload_to_gofile() {
    local file="$1"
    local part_name="$2"

    log_info "  Gofile: Uploading $(basename "$file") ($(format_size "$(get_file_size "$file")"))..."

    local max_retries="${GOFILE_MAX_RETRIES:-3}"
    local attempt=1

    local -a endpoints=(
        "https://upload.gofile.io/uploadfile"
        "https://upload-eu-par.gofile.io/uploadfile"
        "https://upload-na-phx.gofile.io/uploadfile"
        "https://upload-ap-sgp.gofile.io/uploadfile"
    )
    local endpoint_idx=0

    # Token once per call site; _gofile_token caches across files in the run.
    local token
    token=$(_gofile_token) || { log_error "  Gofile: no account token available"; return 1; }

    while (( attempt <= max_retries )); do
        local endpoint="${endpoints[$endpoint_idx]:-${endpoints[0]}}"
        local upload_start upload_response
        upload_start=$(now_epoch)

        log_debug "  Gofile attempt ${attempt}/${max_retries} on ${endpoint}"

        upload_response=$(curl -s --max-time "${UPLOAD_TIMEOUT:-3600}" \
            -H "Authorization: Bearer ${token}" \
            -F "file=@${file}" \
            "$endpoint" 2>/dev/null) || true

        local upload_elapsed=$(( $(now_epoch) - upload_start ))

        # New API: success carries .data.downloadPage directly (no .status wrapper).
        local download_page file_code
        download_page=$(echo "$upload_response" | jq -r '.data.downloadPage // empty' 2>/dev/null)
        file_code=$(echo "$upload_response"    | jq -r '.data.code // .data.fileId // empty' 2>/dev/null)

        if [[ -n "$download_page" || -n "$file_code" ]]; then
            local link="${download_page:-https://gofile.io/d/${file_code}}"
            local speed fsize
            fsize=$(get_file_size "$file")
            (( upload_elapsed > 0 )) && speed=$(format_size $(( fsize / upload_elapsed ))) || speed="instant"
            log_ok "  Gofile: ✅ Upload complete, ${upload_elapsed}s (${speed}/s)"
            log_info "  Gofile: Link → ${link}"
            GOFILE_LINKS+=("${part_name}|${link}")
            return 0
        fi

        # Expired/invalid token mid-run → re-mint once and keep going.
        if echo "$upload_response" | grep -q 'error-token'; then
            log_warn "  Gofile: token rejected, minting a fresh guest account..."
            GOFILE_GUEST_TOKEN=""
            token=$(_gofile_token) || break
        fi

        log_warn "  Gofile: Upload failed on ${endpoint} (attempt ${attempt}), ${upload_response:0:200}"
        (( ++attempt ))
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

    log_info "  Pixeldrain: Uploading $(basename "$file") ($(format_size "$(get_file_size "$file")"))..."

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

        log_debug "  Pixeldrain attempt ${attempt}/${max_retries} (authenticated: $([[ -n "$api_key" ]] && echo yes || echo no))"

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
            # ── POST multipart, anonymous upload (no API key) ─────────────────
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
            log_ok "  Pixeldrain: ✅ Upload complete, ${upload_elapsed}s (${speed}/s)"
            log_info "  Pixeldrain: Link → ${link}"
            PIXELDRAIN_LINKS+=("${part_name}|${link}")
            return 0
        fi

        # Log actual error from Pixeldrain for diagnosis
        local err_val err_msg
        err_val=$(echo "$json_body" | jq -r '.value   // empty' 2>/dev/null)
        err_msg=$(echo "$json_body" | jq -r '.message // empty' 2>/dev/null)
        log_warn "  Pixeldrain: attempt ${attempt}, HTTP=${http_code} error='${err_val:-?}' msg='${err_msg:-no message}'"

        # Early-exit on permanent errors (no point retrying)
        if [[ "$err_val" == "file_too_large" ]]; then
            log_error "  Pixeldrain: File exceeds size limit, cannot upload this file"
            return 1
        fi
        if [[ "$err_val" == "unauthorized" ]] && [[ -z "$api_key" ]]; then
            log_error "  Pixeldrain: Unauthorized on anonymous POST, add PIXELDRAIN_API_KEY to GitHub Secrets"
            return 1
        fi
        if [[ "$err_val" == "name_too_long" ]]; then
            log_error "  Pixeldrain: Filename too long (max 255 chars), safe_filename=${safe_filename}"
            return 1
        fi

        (( ++attempt ))
        sleep 5
    done

    log_error "  Pixeldrain: ❌ All ${max_retries} attempts failed"
    return 1
}


# ═══════════════════════════════════════════════════════════════════════════════
#  SERVICE 3: MEGA.NZ UPLOAD
#  PERMANENT encrypted cloud storage, 20GB free.
#  Uses megatools CLI: megaput (upload) + megals -e (get public link).
#  Requires: MEGA_EMAIL, MEGA_PASSWORD
# ═══════════════════════════════════════════════════════════════════════════════

upload_to_mega() {
    local file="$1"
    local part_name="$2"
    local mega_email="${MEGA_EMAIL:-}"
    local mega_pass="${MEGA_PASSWORD:-}"

    if [[ -z "$mega_email" ]] || [[ -z "$mega_pass" ]]; then
        log_warn "  MEGA.nz: Missing credentials, skipping (need MEGA_EMAIL, MEGA_PASSWORD)"
        return 1
    fi

    log_info "  MEGA.nz: Uploading $(basename "$file") ($(format_size "$(get_file_size "$file")"))..."
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
    local mega_rc
    mega_rc=$(mktemp /tmp/megarc_XXXX)
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
                log_ok "  MEGA.nz: ✅ Upload complete, ${upload_elapsed}s (${speed}/s)"
                log_info "  MEGA.nz: Link → ${public_link} (PERMANENT)"
                MEGA_LINKS+=("${part_name}|${public_link}")
            else
                # File uploaded but couldn't get public link, still a success
                log_ok "  MEGA.nz: ✅ Upload complete, ${upload_elapsed}s (${speed}/s)"
                log_warn "  MEGA.nz: File uploaded but public link unavailable (check mega.nz account)"
                MEGA_LINKS+=("${part_name}|https://mega.nz (check account)")
            fi

            rm -f "$mega_rc"
            return 0
        }

        log_warn "  MEGA.nz: Upload attempt ${attempt} failed"
        log_warn "  MEGA.nz: Error: ${mega_error}"
        (( ++attempt ))
        sleep 10
    done

    rm -f "$mega_rc"
    log_error "  MEGA.nz: ❌ All ${max_retries} attempts failed"
    return 1
}

# ═══════════════════════════════════════════════════════════════════════════════
#  SERVICE 4: ARCHIVE.ORG UPLOAD
#  PERMANENT storage, files NEVER expire. Rich metadata.
#
#  ROOT CAUSE OF PAST FAILURES:
#   • Emoji in filename () inside S3 URL → curl fails immediately (exit 3/6)
#   • Fix: strip emoji + use ASCII-only filename in the S3 URL
#   • Also: improved error logging with curl exit code decoding
# ═══════════════════════════════════════════════════════════════════════════════

upload_to_archive() {
    local file="$1"
    local part_name="$2"
    local access_key="${ARCHIVE_ACCESS_KEY:-}"
    local secret_key="${ARCHIVE_SECRET_KEY:-}"

    if [[ -z "$access_key" ]] || [[ -z "$secret_key" ]]; then
        log_warn "  Archive.org: ARCHIVE_ACCESS_KEY / ARCHIVE_SECRET_KEY not set, skipping"
        return 1
    fi

    log_info "   Archive.org: Uploading $(basename "$file") ($(format_size "$(get_file_size "$file")"))..."

    # Identifier must be alphanumeric + hyphens only (Archive.org bucket name)
    local video_id="${STREAM_VIDEO_ID:-unknown}"
    local date_str timestamp identifier
    date_str=$(TZ='Asia/Karachi' date '+%Y-%m')
    timestamp=$(date '+%s')
    identifier="tml-${date_str}-${video_id}-${timestamp}"
    identifier=$(echo "$identifier" | sed 's/[^a-zA-Z0-9_-]/-/g' | cut -c1-100)

    # Metadata
    local record_date
    record_date=$(TZ='Asia/Karachi' date '+%Y-%m-%d')

    # Safe filename for S3 URL, Archive.org S3 URL cannot contain emoji/UTF-8
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
            log_ok "  Archive.org: ✅ Upload complete, ${upload_elapsed}s (${speed}/s)"
            log_info "  Archive.org: Link → ${link} (PERMANENT)"
            ARCHIVE_LINKS+=("${part_name}|${link}|${identifier}")

            # Upload chat.json if available (only when it has real content).
            # Prefer the path the recorder reported; fall back to the default.
            local chat_file="${RECORD_CHAT_FILE:-${RECORD_DIR:-/tmp/stream-recorder}/chat.json}"
            if [[ -f "$chat_file" ]] && [[ $(wc -c < "$chat_file" 2>/dev/null || echo 0) -gt 50 ]]; then
                log_info "   Archive.org: Uploading chat.json ($(wc -c < "$chat_file") bytes)..."
                curl -s -o /dev/null \
                    --max-time 300 --location \
                    -H "authorization: LOW ${access_key}:${secret_key}" \
                    -H "Content-Type: application/json" \
                    --upload-file "$chat_file" \
                    "https://s3.us.archive.org/${identifier}/chat.json" \
                    2>/dev/null || true
                set_env "RECORD_CHAT_URL" "https://archive.org/download/${identifier}/chat.json"
                log_ok "  Archive.org: Chat log uploaded"
            else
                log_info "  Archive.org: No chat log to upload (file missing or empty)"
            fi

            return 0
        fi

        # Decode curl exit codes for actionable diagnostics
        case "$curl_exit" in
            0)  log_warn "  Archive.org: HTTP ${http_code} (attempt ${attempt}), server rejected upload" ;;
            3)  log_warn "  Archive.org: curl exit 3, bad URL (likely unsafe chars in filename '${safe_filename}')" ;;
            6)  log_warn "  Archive.org: curl exit 6, DNS failure, cannot resolve s3.us.archive.org" ;;
            7)  log_warn "  Archive.org: curl exit 7, connection refused; Archive.org may be blocking this GitHub Actions IP range" ;;
            28) log_warn "  Archive.org: curl exit 28, timed out after ${time_total}s (file may be too large for ${UPLOAD_TIMEOUT:-7200}s timeout)" ;;
            35) log_warn "  Archive.org: curl exit 35, SSL handshake failed" ;;
            *)  log_warn "  Archive.org: curl exit ${curl_exit} / HTTP ${http_code} (attempt ${attempt})" ;;
        esac

        (( ++attempt ))
        sleep 15
    done

    log_error "  Archive.org: ❌ All ${max_retries} attempts failed"
    log_info   "  Archive.org: If exit 7, Archive.org is blocking GitHub Actions IPs. This is a known issue."
    log_info   "  Archive.org: Add secret ARCHIVE_SKIP=true to skip Archive.org uploading until this is resolved."
    return 1
}


# ═══════════════════════════════════════════════════════════════════════════════
#  SERVICE 5: 0807.ST UPLOAD  (API: https://0807.st/api, owner-pasted 2026-10-14)
#  Direct hotlink URLs, expiry=0 (never auto-delete), maxdl=0.
#
#  Anonymous uploads: 2 GB per POST, 10 GB chunked, rate-limited, and every
#  request that creates an upload must carry a proof-of-work (scripts/
#  st0807_pow.py solves GET /pow → {id, ts, bits, sig, ttl}). Partner token
#  ST0807_TOKEN (Authorization: Bearer) skips the PoW and the rate limit and
#  lifts the cap to 50 GB.
#
#  WHY LARGE ANONYMOUS FILES GO CHUNKED (2026-10-14): of 18 recordings only the
#  two smallest (8 MB, 92 MB) ever landed on 0807.st; all 16 files ≥ 255 MB
#  failed on every attempt since 09-02. The anonymous POST cap is 2 GB, so
#  size itself is not the reason. The PoW challenge has a ttl, and a simple
#  multipart POST can only be validated once the whole body has streamed in —
#  for a 500 MB file that is well after the proof was issued. The chunked flow
#  attaches the proof to /upload/init (a tiny JSON request, validated at
#  once); the 16 MB chunks and /upload/finish carry no proof. So: anonymous
#  files above ST0807_ANON_SIMPLE_LIMIT (32 MB) always go chunked, and the
#  simple POST sends the pow_* fields BEFORE the file part.
# ═══════════════════════════════════════════════════════════════════════════════

# Honest browser-shaped UA on EVERY 0807.st call — the PoW fetch already
# needed it (urllib's default UA was filtered, 2026-09-02); curl's default
# "curl/8.x" on /upload is the same class of filter target.
ST0807_UA="${ST0807_UA:-Mozilla/5.0 (X11; Linux x86_64; Stream-Recorder bot; +github.com/usermuneeb1/Stream-Recorder)}"
ST0807_CHUNK_SIZE="${ST0807_CHUNK_SIZE:-16777216}"     # 16 MB, the API maximum

_st0807_auth_args() {
    local token="${ST0807_TOKEN:-}"
    if [[ -n "$token" ]]; then
        printf -- '-H\nAuthorization: Bearer %s\n' "$token"
    fi
}

_st0807_pow_json() {
    # stderr stays VISIBLE in the run log (2026-09-02: PoW silently died for
    # a week because failures were swallowed with 2>/dev/null)
    python3 "$SCRIPT_DIR/st0807_pow.py" || true
}

_st0807_parse_url() {
    local body="$1"
    echo "$body" | jq -r '.url // empty' 2>/dev/null
}

# Does an upload response look like a size/limit rejection? A 413 on the
# simple POST will not change on retry — escalate to the chunked endpoints.
_st0807_size_rejected() {
    local http_code="$1" body="$2"
    [[ "$http_code" == "413" ]] && return 0
    grep -qiE 'too large|file size|size limit|max(imum)? (file )?size|exceeds' <<< "$body"
}

_st0807_report_failure() {   # $1 stage, $2 http code, $3 body, $4 fsize
    local stage="$1" code="$2" body="$3" fsize="$4"
    local excerpt="${body:0:200}"
    excerpt="${excerpt//$'\n'/ }"
    log_warn "  0807.st: ${stage} failed — HTTP ${code:-000}, $(format_size "$fsize"), body: ${excerpt:-<empty>}"
    append_summary "- ⚠️ 0807.st ${stage} failed — HTTP ${code:-000}, $(format_size "$fsize"), token=$([[ -n "${ST0807_TOKEN:-}" ]] && echo yes || echo no): \`${excerpt:-<empty>}\`"
}

# Anonymous requests are rate-limited; a 429 means wait, not hammer.
_st0807_rate_limit_pause() {
    local secs="${ST0807_RATE_LIMIT_SLEEP:-60}"
    log_warn "  0807.st: rate limited (429), pausing ${secs}s before the next attempt"
    sleep "$secs"
}

# curl wrapper: prints "<body>\n<http_code>" semantics split into two globals.
# $@ = curl args (URL included). Sets ST0807_HTTP and ST0807_BODY.
ST0807_HTTP=""; ST0807_BODY=""
_st0807_curl() {
    local raw
    raw=$(curl -s -A "$ST0807_UA" -w $'\n%{http_code}' "$@" 2>/dev/null) || true
    if [[ "$raw" == *$'\n'* ]]; then
        ST0807_HTTP="${raw##*$'\n'}"
        ST0807_BODY="${raw%$'\n'*}"
    else
        ST0807_HTTP=""
        ST0807_BODY="$raw"
    fi
}

upload_to_st0807() {
    local file="$1"
    local part_name="$2"
    local token="${ST0807_TOKEN:-}"
    local fsize
    fsize=$(get_file_size "$file")

    log_info "  0807.st: Uploading $(basename "$file") ($(format_size "$fsize"))..."

    local max_retries="${ST0807_MAX_RETRIES:-3}"
    local attempt=1
    local simple_limit=$((1800 * 1024 * 1024))                                   # under the 2 GB single-POST cap
    local anon_simple_limit="${ST0807_ANON_SIMPLE_LIMIT:-$((32 * 1024 * 1024))}" # PoW ttl race, see header

    local use_chunked=false
    if [[ "${ST0807_FORCE_CHUNKED:-false}" == "true" ]] || (( fsize > simple_limit )); then
        use_chunked=true
    elif [[ -z "$token" ]] && (( fsize > anon_simple_limit )); then
        use_chunked=true
        log_info "  0807.st: anonymous + $(format_size "$fsize") > $(format_size "$anon_simple_limit") → chunked flow (PoW validated at /upload/init)"
    fi

    while (( attempt <= max_retries )); do
        local upload_start upload_response link
        upload_start=$(now_epoch)
        local tok_state="pow"
        [[ -n "$token" ]] && tok_state="yes"
        log_debug "  0807.st attempt ${attempt}/${max_retries} (token=$tok_state, chunked=$use_chunked)"

        local http_code="" stage="simple POST"
        if [[ "$use_chunked" != true ]]; then
            # Field ORDER matters for anonymous uploads: the proof must reach
            # the server before the file body, so pow_* come first.
            local -a curl_args=(--max-time "${UPLOAD_TIMEOUT:-3600}" -F "expiry=0" -F "maxdl=0")
            if [[ -n "$token" ]]; then
                curl_args+=(-H "Authorization: Bearer ${token}")
            else
                local pow
                pow=$(_st0807_pow_json)
                if [[ -z "$pow" ]] || ! echo "$pow" | jq -e '.pow_nonce' >/dev/null 2>&1; then
                    log_warn "  0807.st: proof-of-work failed (attempt ${attempt})"
                    (( ++attempt )); sleep "${ST0807_RETRY_SLEEP:-5}"; continue
                fi
                curl_args+=(-F "pow_id=$(echo "$pow" | jq -r '.pow_id')")
                curl_args+=(-F "pow_ts=$(echo "$pow" | jq -r '.pow_ts')")
                curl_args+=(-F "pow_bits=$(echo "$pow" | jq -r '.pow_bits')")
                curl_args+=(-F "pow_sig=$(echo "$pow" | jq -r '.pow_sig')")
                curl_args+=(-F "pow_nonce=$(echo "$pow" | jq -r '.pow_nonce')")
            fi
            curl_args+=(-F "file=@${file}")
            _st0807_curl "${curl_args[@]}" "https://0807.st/upload"
            http_code="$ST0807_HTTP"; upload_response="$ST0807_BODY"
        else
            stage="chunked"
            # runs in a subshell: the HTTP code travels inside the JSON (.http)
            upload_response=$(_st0807_chunked_upload "$file" "$token") || true
            http_code=$(jq -r '.http // empty' <<< "$upload_response" 2>/dev/null || true)
        fi

        local upload_elapsed=$(( $(now_epoch) - upload_start ))
        link=$(_st0807_parse_url "$upload_response")

        if [[ -n "$link" ]]; then
            local speed
            (( upload_elapsed > 0 )) && speed=$(format_size $(( fsize / upload_elapsed ))) || speed="instant"
            log_ok "  0807.st: ✅ Upload complete (${stage}), ${upload_elapsed}s (${speed}/s)"
            log_info "  0807.st: Link → ${link}"
            # The deletion URL is the ONLY way to remove the file later. Run
            # logs are private to the repo; never put it in public JSON.
            local del_url
            del_url=$(echo "$upload_response" | jq -r '.deletion_url // empty' 2>/dev/null)
            [[ -n "$del_url" ]] && log_info "  0807.st: deletion_url (keep private) → ${del_url}"
            ST0807_LINKS+=("${part_name}|${link}")
            return 0
        fi

        _st0807_report_failure "${stage} (attempt ${attempt}/${max_retries})" "$http_code" "$upload_response" "$fsize"

        if [[ "$http_code" == "429" ]]; then
            _st0807_rate_limit_pause
        elif [[ "$stage" == "simple POST" ]] && _st0807_size_rejected "$http_code" "$upload_response"; then
            log_warn "  0807.st: simple POST rejected on size, switching to chunked upload"
            use_chunked=true
        fi
        (( ++attempt ))
        sleep "${ST0807_RETRY_SLEEP:-5}"
    done

    log_error "  0807.st: ❌ All ${max_retries} attempts failed"
    return 1
}

# Chunked flow: POST /upload/init (JSON, carries the PoW when anonymous) →
# POST /upload/chunk?id=&offset= (raw bytes, ≤16 MB each, each verified and
# retried) → POST /upload/finish (JSON) which answers like a simple upload.
# Prints the finish body, or a JSON error {error, http, body, offset?}.
_st0807_chunked_upload() {
    local file="$1"
    local token="$2"
    local fsize name mime upload_id
    fsize=$(get_file_size "$file")
    name=$(make_safe_filename "$(basename "$file")")
    mime="video/mp4"

    local -a hdr=()
    [[ -n "$token" ]] && hdr+=(-H "Authorization: Bearer ${token}")

    local init_json
    init_json=$(jq -n --arg name "$name" --argjson size "$fsize" --arg mime "$mime" \
        '{name:$name, size:$size, mime:$mime, maxdl:"0", vanity:""}')

    if [[ -z "$token" ]]; then
        local pow
        pow=$(_st0807_pow_json)
        if [[ -z "$pow" ]] || ! echo "$pow" | jq -e '.pow_nonce' >/dev/null 2>&1; then
            echo '{"error":"pow_failed"}'
            return 1
        fi
        init_json=$(echo "$init_json" "$pow" | jq -s '.[0] + {
            pow_id: .[1].pow_id, pow_ts: .[1].pow_ts, pow_bits: .[1].pow_bits,
            pow_sig: .[1].pow_sig, pow_nonce: .[1].pow_nonce
        }')
    fi

    _st0807_curl --max-time 60 "${hdr[@]}" -H "Content-Type: application/json" \
        -d "$init_json" "https://0807.st/upload/init"
    upload_id=$(echo "$ST0807_BODY" | jq -r '.uploadId // .id // empty' 2>/dev/null)
    if [[ -z "$upload_id" ]]; then
        jq -cn --arg http "${ST0807_HTTP:-000}" --arg body "${ST0807_BODY:0:200}" '{error:"init_failed", http:$http, body:$body}'
        return 1
    fi

    local chunk_size="$ST0807_CHUNK_SIZE"
    local total_chunks=$(( (fsize + chunk_size - 1) / chunk_size ))
    local offset=0 n=0
    log_info "  0807.st: upload id ${upload_id}, ${total_chunks} chunk(s) of $(format_size "$chunk_size")" >&2
    while (( offset < fsize )); do
        local chunk
        chunk=$(mktemp /tmp/st0807_chunk_XXXX)
        # offset is always a multiple of chunk_size, so a block-sized dd is
        # exact (the last block is naturally short). The old bs=1 copy issued
        # one syscall per byte — minutes per chunk.
        if ! dd if="$file" of="$chunk" bs="$chunk_size" skip=$(( offset / chunk_size )) count=1 iflag=fullblock status=none 2>/dev/null; then
            rm -f "$chunk"
            jq -cn --argjson offset "$offset" '{error:"chunk_read_failed", offset:$offset, http:"000"}'
            return 1
        fi
        local this
        this=$(get_file_size "$chunk")

        local try=1 sent=false
        while (( try <= 3 )); do
            _st0807_curl --max-time "${UPLOAD_TIMEOUT:-3600}" "${hdr[@]}" \
                -H "Content-Type: application/octet-stream" \
                --data-binary @"$chunk" \
                "https://0807.st/upload/chunk?id=${upload_id}&offset=${offset}"
            if [[ "$ST0807_HTTP" =~ ^2[0-9][0-9]$ ]]; then sent=true; break; fi
            log_warn "  0807.st: chunk $((n + 1))/${total_chunks} (offset ${offset}) failed — HTTP ${ST0807_HTTP:-000}: ${ST0807_BODY:0:120} (try ${try}/3)" >&2
            if [[ "$ST0807_HTTP" == "429" ]]; then _st0807_rate_limit_pause >&2; else sleep "${ST0807_RETRY_SLEEP:-5}"; fi
            (( ++try ))
        done
        rm -f "$chunk"
        if [[ "$sent" != true ]]; then
            jq -cn --arg http "${ST0807_HTTP:-000}" --arg body "${ST0807_BODY:0:200}" --argjson offset "$offset" \
                '{error:"chunk_failed", offset:$offset, http:$http, body:$body}'
            return 1
        fi
        offset=$(( offset + this ))
        (( ++n ))
        if (( n % 8 == 0 || n == total_chunks )); then
            log_info "  0807.st: ${n}/${total_chunks} chunks sent ($(format_size "$offset"))" >&2
        fi
    done

    local finish_json
    finish_json=$(jq -n --arg id "$upload_id" '{id:$id, expiry:"0", maxdl:"0", password:"", vanity:""}')
    _st0807_curl --max-time 120 "${hdr[@]}" -H "Content-Type: application/json" \
        -d "$finish_json" "https://0807.st/upload/finish"
    if [[ -n "$(echo "$ST0807_BODY" | jq -r '.url // empty' 2>/dev/null)" ]]; then
        echo "$ST0807_BODY"
    else
        jq -cn --arg http "${ST0807_HTTP:-000}" --arg body "${ST0807_BODY:0:200}" '{error:"finish_failed", http:$http, body:$body}'
        return 1
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  SERVICE 6: VIKINGFILE UPLOAD
#  https://vikingfile.com/api — anonymous (empty user) or VIKINGFILE_USER hash.
#  Multipart: get-upload-url → PUT parts → complete-upload.
#  Legacy single-POST fallback for smaller files / if multipart fails.
# ═══════════════════════════════════════════════════════════════════════════════

upload_to_vikingfile() {
    local file="$1"
    local part_name="$2"
    local user="${VIKINGFILE_USER:-}"
    local fsize
    fsize=$(get_file_size "$file")
    local safe_name
    safe_name=$(make_safe_filename "$(basename "$file")")

    log_info "  VikingFile: Uploading $(basename "$file") ($(format_size "$fsize"))..."

    local max_retries="${VIKINGFILE_MAX_RETRIES:-3}"
    local attempt=1

    while (( attempt <= max_retries )); do
        local upload_start link
        upload_start=$(now_epoch)
        log_debug "  VikingFile attempt ${attempt}/${max_retries}"

        link=$(_vikingfile_multipart "$file" "$safe_name" "$user" "$fsize") || true
        if [[ -z "$link" ]]; then
            link=$(_vikingfile_legacy "$file" "$safe_name" "$user") || true
        fi

        local upload_elapsed=$(( $(now_epoch) - upload_start ))
        if [[ -n "$link" ]]; then
            local speed
            (( upload_elapsed > 0 )) && speed=$(format_size $(( fsize / upload_elapsed ))) || speed="instant"
            log_ok "  VikingFile: ✅ Upload complete, ${upload_elapsed}s (${speed}/s)"
            log_info "  VikingFile: Link → ${link}"
            VIKINGFILE_LINKS+=("${part_name}|${link}")
            return 0
        fi

        log_warn "  VikingFile: attempt ${attempt} failed"
        (( ++attempt ))
        sleep 5
    done

    log_error "  VikingFile: ❌ All ${max_retries} attempts failed"
    return 1
}

_vikingfile_multipart() {
    local file="$1" name="$2" user="$3" fsize="$4"
    local meta
    meta=$(curl -s --max-time 30 -X POST "https://vikingfile.com/api/get-upload-url" \
        -F "size=${fsize}" 2>/dev/null) || return 1

    local upload_id key part_size nparts
    upload_id=$(echo "$meta" | jq -r '.uploadId // empty' 2>/dev/null)
    key=$(echo "$meta" | jq -r '.key // empty' 2>/dev/null)
    part_size=$(echo "$meta" | jq -r '.partSize // 1073741824' 2>/dev/null)
    nparts=$(echo "$meta" | jq -r '.numberParts // 0' 2>/dev/null)
    [[ -z "$upload_id" || -z "$key" || "$nparts" -lt 1 ]] && return 1

    local -a etags=()
    local i=0
    while (( i < nparts )); do
        local url
        url=$(echo "$meta" | jq -r ".urls[$i] // empty" 2>/dev/null)
        [[ -z "$url" ]] && return 1
        local offset=$(( i * part_size ))
        local this=$part_size
        (( offset + this > fsize )) && this=$(( fsize - offset ))
        local part
        part=$(mktemp /tmp/viking_part_XXXX)
        _slice_file "$file" "$part" "$offset" "$this"
        local headers etag
        headers=$(mktemp /tmp/viking_hdr_XXXX)
        curl -s --max-time "${UPLOAD_TIMEOUT:-3600}" -D "$headers" -o /dev/null \
            -X PUT --data-binary @"$part" "$url" >/dev/null 2>&1 || true
        etag=$(grep -i '^etag:' "$headers" | head -1 | sed 's/[Ee][Tt][Aa][Gg]:[[:space:]]*//' | tr -d '\r"' | awk '{print $1}')
        rm -f "$part" "$headers"
        [[ -z "$etag" ]] && return 1
        etags+=("$etag")
        (( ++i ))
    done

    local -a form=(-F "key=${key}" -F "uploadId=${upload_id}" -F "name=${name}" -F "user=${user}")
    local idx=0
    for etag in "${etags[@]}"; do
        form+=(-F "parts[${idx}][PartNumber]=$(( idx + 1 ))")
        form+=(-F "parts[${idx}][ETag]=${etag}")
        (( ++idx ))
    done

    local complete url
    complete=$(curl -s --max-time 120 -X POST "https://vikingfile.com/api/complete-upload" \
        "${form[@]}" 2>/dev/null) || return 1
    url=$(echo "$complete" | jq -r '.url // empty' 2>/dev/null)
    [[ -n "$url" ]] && echo "$url"
}

_vikingfile_legacy() {
    local file="$1" name="$2" user="$3"
    local server
    server=$(curl -s --max-time 20 "https://vikingfile.com/api/get-server" | jq -r '.server // empty' 2>/dev/null)
    [[ -z "$server" ]] && server="https://upload.vikingfile.com"
    local resp url
    resp=$(curl -s --max-time "${UPLOAD_TIMEOUT:-3600}" \
        -F "file=@${file};filename=${name}" \
        -F "user=${user}" \
        "$server" 2>/dev/null) || return 1
    url=$(echo "$resp" | jq -r '.url // empty' 2>/dev/null)
    [[ -n "$url" ]] && echo "$url"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  THUMBNAIL → CLOUD (not stored in git repo)
#  1) MEGA, permanent copy in YOUR account (/Root/TheMuslimLantern/thumbnails/)
#  2) Archive.org image, hotlink URL for dashboard (works when YouTube thumb dies)
#  3) Gofile direct, fallback display URL
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
    local mega_rc
    mega_rc=$(mktemp /tmp/megarc_thumb_XXXX)
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

    upload_thumbnail_to_archive "$thumb_file" || log_warn "Archive thumbnail upload failed, trying Gofile..."

    if [[ -z "${THUMBNAIL_CLOUD_URL:-}" ]]; then
        # Gofile thumbnail via the same 2026 account+token flow as videos.
        local gf_token gf_response gf_page
        gf_token=$(_gofile_token) || gf_token=""
        if [[ -n "$gf_token" ]]; then
            gf_response=$(curl -s --max-time 120 \
                -H "Authorization: Bearer ${gf_token}" \
                -F "file=@${thumb_file}" \
                "https://upload.gofile.io/uploadfile" 2>/dev/null) || true
            gf_page=$(echo "$gf_response" | jq -r '.data.downloadPage // empty' 2>/dev/null)
            if [[ -n "$gf_page" ]]; then
                THUMBNAIL_CLOUD_URL="$gf_page"
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
    log_warn "Thumbnail cloud upload incomplete, dashboard may fall back to YouTube image"
    return 1
}

upload_to_clouds() {
    log_header "MULTI-CLOUD REDUNDANCY UPLOAD"

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
    [[ "${GOFILE_SKIP:-false}" != "true" ]] && (( ++active_services ))
    [[ "${PIXELDRAIN_SKIP:-false}" != "true" ]] && (( ++active_services ))
    [[ "${MEGA_SKIP:-false}" != "true" ]] && [[ -n "${MEGA_EMAIL:-}" ]] && (( ++active_services ))
    [[ "${ARCHIVE_SKIP:-false}" != "true" ]] && [[ -n "${ARCHIVE_ACCESS_KEY:-}" ]] && (( ++active_services ))
    [[ "${ST0807_SKIP:-false}" != "true" ]] && (( ++active_services ))
    [[ "${VIKINGFILE_SKIP:-false}" != "true" ]] && (( ++active_services ))
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
        (( ++file_num ))
        if [[ ! -f "$f" ]]; then
            log_warn "File not found: $f, skipping"
            continue
        fi

        log_separator
        local part_name

        # HD-only pipeline (compressed/480p variant removed)
        if (( total_files <= 2 )); then
            part_name="HD"
        else
            part_name="Part${file_num}"
        fi

        log_step "Uploading ${part_name} of ${total_files}: $(basename "$f")"
        log_separator

        local svc_success=0

        # ── 1. Gofile (HD only) ──
        if [[ "${GOFILE_SKIP:-false}" != "true" ]]; then
            (( ++expected_total_uploads ))
            if upload_to_gofile "$f" "$part_name"; then
                (( ++svc_success ))
            else
                log_warn "  Gofile: First attempt failed, retrying after 10s..."
                sleep 10
                if upload_to_gofile "$f" "$part_name"; then
                    (( ++svc_success ))
                fi
            fi
        else
            log_info "  Gofile: Skipped (GOFILE_SKIP=true)"
        fi

        # ── 2. Pixeldrain (HD only) ──
        if [[ "${PIXELDRAIN_SKIP:-false}" != "true" ]]; then
            (( ++expected_total_uploads ))
            if upload_to_pixeldrain "$f" "$part_name"; then
                (( ++svc_success ))
            else
                log_warn "  Pixeldrain: First attempt failed, retrying after 10s..."
                sleep 10
                if upload_to_pixeldrain "$f" "$part_name"; then
                    (( ++svc_success ))
                fi
            fi
        else
            log_info "  Pixeldrain: Skipped (PIXELDRAIN_SKIP=true)"
        fi

        # ── 3. Archive.org (HD) ──
        if [[ "${ARCHIVE_SKIP:-false}" != "true" ]]; then
            (( ++expected_total_uploads ))
            if upload_to_archive "$f" "$part_name"; then
                (( ++svc_success ))
            else
                log_warn "  Archive.org: First attempt failed, retrying after 10s..."
                sleep 10
                if upload_to_archive "$f" "$part_name"; then
                    (( ++svc_success ))
                fi
            fi
        else
            log_info "  Archive.org: Skipped (ARCHIVE_SKIP=true)"
        fi

        # ── 4. MEGA.nz (HD) ──
        if [[ "${MEGA_SKIP:-false}" != "true" ]] && [[ -n "${MEGA_EMAIL:-}" ]]; then
            (( ++expected_total_uploads ))
            if upload_to_mega "$f" "$part_name"; then
                (( ++svc_success ))
            else
                log_warn "  MEGA.nz: First attempt failed, retrying after 10s..."
                sleep 10
                if upload_to_mega "$f" "$part_name"; then
                    (( ++svc_success ))
                fi
            fi
        elif [[ "${MEGA_SKIP:-false}" == "true" ]]; then
            log_info "  MEGA.nz: Skipped (MEGA_SKIP=true)"
        else
            log_info "  MEGA.nz: Skipped (no credentials)" 
        fi

        # ── 5. 0807.st (HD) ──
        if [[ "${ST0807_SKIP:-false}" != "true" ]]; then
            (( ++expected_total_uploads ))
            if upload_to_st0807 "$f" "$part_name"; then
                (( ++svc_success ))
            else
                log_warn "  0807.st: First attempt failed, retrying after 10s..."
                sleep 10
                if upload_to_st0807 "$f" "$part_name"; then
                    (( ++svc_success ))
                fi
            fi
        else
            log_info "  0807.st: Skipped (ST0807_SKIP=true)"
        fi

        # ── 6. VikingFile (HD) ──
        if [[ "${VIKINGFILE_SKIP:-false}" != "true" ]]; then
            (( ++expected_total_uploads ))
            if upload_to_vikingfile "$f" "$part_name"; then
                (( ++svc_success ))
            else
                log_warn "  VikingFile: First attempt failed, retrying after 10s..."
                sleep 10
                if upload_to_vikingfile "$f" "$part_name"; then
                    (( ++svc_success ))
                fi
            fi
        else
            log_info "  VikingFile: Skipped (VIKINGFILE_SKIP=true)"
        fi

        UPLOAD_SUCCESS_COUNT=$(( UPLOAD_SUCCESS_COUNT + svc_success ))
    done

    log_separator

    # Dashboard thumbnail (cloud URL, not committed to repo)
    upload_thumbnail_to_cloud || true

    log_separator

    # ── Export results ──
    local gofile_str="" pixeldrain_str="" archive_str="" mega_str="" st0807_str="" vikingfile_str=""
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
    # These two were referenced by the summary below but never assigned —
    # under set -u that aborted every successful run at the finish line.
    if (( ${#ST0807_LINKS[@]} > 0 )); then
        local _ifs="$IFS"; IFS=';'; st0807_str="${ST0807_LINKS[*]}"; IFS="$_ifs"
    fi
    if (( ${#VIKINGFILE_LINKS[@]} > 0 )); then
        local _ifs="$IFS"; IFS=';'; vikingfile_str="${VIKINGFILE_LINKS[*]}"; IFS="$_ifs"
    fi

    set_env "GOFILE_LINKS"         "$gofile_str"
    set_env "PIXELDRAIN_LINKS"     "$pixeldrain_str"
    set_env "ARCHIVE_LINKS"        "$archive_str"
    set_env "MEGA_LINKS"           "$mega_str"
    set_env "ST0807_LINKS"         "$st0807_str"
    set_env "VIKINGFILE_LINKS"     "$vikingfile_str"
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
    [[ -n "$st0807_str"       ]] && log_ok  "  0807.st      ✅ : ${ST0807_LINKS[*]}"
    [[ -n "$vikingfile_str"   ]] && log_ok  "  VikingFile   ✅ : ${VIKINGFILE_LINKS[*]}"
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
