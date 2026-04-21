#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  📤 AUTO UPLOAD CHAT LOG → SUPABASE STORAGE                                 ║
# ║  Uploads the chat.json produced by the recorder to Supabase Storage,       ║
# ║  then stores the public URL in the GitHub env for update-links.sh to use.  ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

upload_chat_to_supabase() {
    log_header "📤 UPLOADING CHAT TO SUPABASE"

    local chat_file="${RECORD_CHAT_FILE:-}"
    local supabase_url="${SUPABASE_URL:-}"
    local service_key="${SUPABASE_SERVICE_ROLE_KEY:-}"
    local bucket="${SUPABASE_STORAGE_BUCKET:-chat-logs}"
    local stream_title="${STREAM_TITLE:-Unknown-Stream}"
    local record_date
    record_date=$(TZ='Asia/Karachi' date '+%Y-%m-%d')

    if [[ -z "$supabase_url" ]] || [[ -z "$service_key" ]]; then
        log_warn "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — skipping chat upload"
        return 0
    fi

    if [[ -z "$chat_file" ]] || [[ ! -f "$chat_file" ]]; then
        log_warn "No chat file found at: ${chat_file:-<unset>} — skipping"
        return 0
    fi

    local chat_size
    chat_size=$(get_file_size "$chat_file")
    if (( chat_size < 100 )); then
        log_warn "Chat file too small (${chat_size} bytes) — skipping upload"
        return 0
    fi

    log_info "Chat file: $(basename "$chat_file") ($(format_size "$chat_size"))"

    # Build safe storage path: chats/2026-04-19-Stream-Title.json
    local safe_title
    safe_title=$(sanitize_filename "$stream_title")
    local storage_path="chats/${record_date}-${safe_title}.json"

    log_step "Uploading to Supabase Storage: ${bucket}/${storage_path}"

    # Upload via Supabase Storage REST API
    local response
    response=$(curl -s -X POST \
        "${supabase_url}/storage/v1/object/${bucket}/${storage_path}" \
        -H "Authorization: Bearer ${service_key}" \
        -H "Content-Type: application/json" \
        -H "x-upsert: true" \
        --data-binary @"$chat_file" 2>/dev/null)

    local upload_key
    upload_key=$(echo "$response" | jq -r '.Key // empty' 2>/dev/null)

    if [[ -n "$upload_key" ]]; then
        # Build public URL
        local public_url="${supabase_url}/storage/v1/object/public/${bucket}/${storage_path}"
        log_ok "Chat uploaded successfully!"
        log_info "Public URL: $public_url"
        set_env "RECORD_CHAT_URL" "$public_url"
        return 0
    else
        local err
        err=$(echo "$response" | jq -r '.error // .message // empty' 2>/dev/null)
        log_warn "Chat upload failed: ${err:-Unknown error}"
        log_debug "Response: $response"
        return 0  # Non-fatal
    fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    upload_chat_to_supabase
fi
