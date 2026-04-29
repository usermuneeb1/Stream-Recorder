#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  📡 STREAM RECORDER — AUTOMATED CLOUD LINK PRESERVATION v2.0              ║
# ║  Runs every 3 days to keep Gofile/Pixeldrain links alive.                  ║
# ║  Dead links → edits the original Discord message with Archive.org fallback ║
# ║  Updates links.txt to mark expired links.                                  ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"
source "$SCRIPT_DIR/discord-notify.sh"

# ═══════════════════════════════════════════════════════════════════════════════
#  LINK HEALTH CHECKER
# ═══════════════════════════════════════════════════════════════════════════════

check_link_alive() {
    local url="$1"
    local timeout="${REFRESH_CHECK_TIMEOUT:-30}"
    
    local http_code
    http_code=$(curl -s -o /dev/null -w '%{http_code}' \
        --max-time "$timeout" \
        -L "$url" 2>/dev/null) || return 1
    
    # 200, 302, 301 = alive
    if [[ "$http_code" =~ ^(200|301|302)$ ]]; then
        return 0
    fi
    
    return 1
}

# ═══════════════════════════════════════════════════════════════════════════════
#  GOFILE REFRESH — Download 1KB to reset expiration timer
# ═══════════════════════════════════════════════════════════════════════════════

refresh_gofile() {
    local url="$1"
    
    curl -s -o /dev/null --max-time 30 \
        -r "0-1023" \
        -L "$url" 2>/dev/null
    
    return $?
}

# ═══════════════════════════════════════════════════════════════════════════════
#  PIXELDRAIN REFRESH — Download 10% of file to reset expiration timer
#  Pixeldrain requires downloading a meaningful portion of the file.
# ═══════════════════════════════════════════════════════════════════════════════

refresh_pixeldrain() {
    local url="$1"
    
    # Extract file ID from URL: https://pixeldrain.com/u/XXXXX → XXXXX
    local file_id=""
    if [[ "$url" =~ pixeldrain\.com/u/([a-zA-Z0-9_-]+) ]]; then
        file_id="${BASH_REMATCH[1]}"
    else
        log_warn "    Could not extract Pixeldrain file ID from: $url"
        return 1
    fi
    
    # Get file size via Pixeldrain API
    local info_response
    info_response=$(curl -s --max-time 15 \
        "https://pixeldrain.com/api/file/${file_id}/info" 2>/dev/null) || {
        log_warn "    Could not fetch file info from Pixeldrain API"
        return 1
    }
    
    local file_size
    file_size=$(echo "$info_response" | jq -r '.size // 0' 2>/dev/null)
    
    if [[ -z "$file_size" ]] || [[ "$file_size" == "0" ]] || [[ "$file_size" == "null" ]]; then
        log_warn "    Could not determine file size — downloading 50MB fallback chunk"
        file_size=524288000  # assume 500MB → 10% = 50MB
    fi
    
    # Calculate 10% of file size
    local ten_percent=$(( file_size / 10 ))
    
    # Cap at 200MB to avoid excessive bandwidth usage
    local max_bytes=209715200  # 200MB
    if (( ten_percent > max_bytes )); then
        ten_percent=$max_bytes
        log_debug "    Capped download to 200MB (file is very large)"
    fi
    
    # Minimum 1MB
    if (( ten_percent < 1048576 )); then
        ten_percent=1048576
    fi
    
    local size_human
    size_human=$(format_size "$ten_percent" 2>/dev/null || echo "${ten_percent} bytes")
    log_info "    Downloading ${size_human} (10% of $(format_size "$file_size" 2>/dev/null || echo "${file_size} bytes"))..."
    
    # Download 10% from the direct download endpoint
    curl -s -o /dev/null --max-time 300 \
        -r "0-${ten_percent}" \
        -L "https://pixeldrain.com/api/file/${file_id}" 2>/dev/null
    
    return $?
}

# ═══════════════════════════════════════════════════════════════════════════════
#  PARSE LINKS.TXT INTO STREAM ENTRY BLOCKS
#  Returns each entry block with its MsgID, gofile, pixeldrain, archive links
# ═══════════════════════════════════════════════════════════════════════════════

parse_entries_from_links() {
    local content="$1"
    
    # Split by separator lines and emit JSON array of entries
    # Each entry has: title, msg_id, gofile_urls[], pixeldrain_urls[], archive_urls[]
    local current_title="" current_msgid="" current_gofile="" current_pixeldrain="" current_streamtape="" current_archive=""
    local entries_json="[]"
    local in_entry=false
    
    while IFS= read -r line; do
        # Start of entry
        if [[ "$line" == "========================================"* ]]; then
            # If we were in an entry, save it
            if [[ "$in_entry" == true ]] && [[ -n "$current_title" ]]; then
                entries_json=$(echo "$entries_json" | jq \
                    --arg title "$current_title" \
                    --arg msgid "$current_msgid" \
                    --arg gofile "$current_gofile" \
                    --arg pixeldrain "$current_pixeldrain" \
                    --arg streamtape "$current_streamtape" \
                    --arg archive "$current_archive" \
                    '. + [{title: $title, msg_id: $msgid, gofile: $gofile, pixeldrain: $pixeldrain, streamtape: $streamtape, archive: $archive}]')
            fi
            # Reset
            current_title="" current_msgid="" current_gofile="" current_pixeldrain="" current_streamtape="" current_archive=""
            in_entry=true
            continue
        fi
        
        [[ "$in_entry" != true ]] && continue
        
        # Parse fields
        if [[ "$line" =~ ^Title:\ +(.+)$ ]]; then
            current_title="${BASH_REMATCH[1]}"
        elif [[ "$line" =~ ^MsgID:\ +(.+)$ ]]; then
            current_msgid="${BASH_REMATCH[1]}"
        elif [[ "$line" =~ \[gofile:[^\]]+\]\ *(https://[^ ]+) ]]; then
            [[ -n "$current_gofile" ]] && current_gofile+="|"
            current_gofile+="${BASH_REMATCH[1]}"
        elif [[ "$line" =~ \[pixeldrain:[^\]]+\]\ *(https://[^ ]+) ]]; then
            [[ -n "$current_pixeldrain" ]] && current_pixeldrain+="|"
            current_pixeldrain+="${BASH_REMATCH[1]}"
        elif [[ "$line" =~ \[streamtape:[^\]]+\]\ *(https://[^ ]+) ]]; then
            [[ -n "$current_streamtape" ]] && current_streamtape+="|"
            current_streamtape+="${BASH_REMATCH[1]}"
        elif [[ "$line" =~ \[archive:[^\]]+\]\ *(https://[^ ]+) ]]; then
            [[ -n "$current_archive" ]] && current_archive+="|"
            current_archive+="${BASH_REMATCH[1]}"
        fi
    done <<< "$content"
    
    # Save last entry
    if [[ "$in_entry" == true ]] && [[ -n "$current_title" ]]; then
        entries_json=$(echo "$entries_json" | jq \
            --arg title "$current_title" \
            --arg msgid "$current_msgid" \
            --arg gofile "$current_gofile" \
            --arg pixeldrain "$current_pixeldrain" \
            --arg streamtape "$current_streamtape" \
            --arg archive "$current_archive" \
            '. + [{title: $title, msg_id: $msgid, gofile: $gofile, pixeldrain: $pixeldrain, streamtape: $streamtape, archive: $archive}]')
    fi
    
    echo "$entries_json"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  EDIT DISCORD MESSAGE — Replace dead links with Archive.org fallback
# ═══════════════════════════════════════════════════════════════════════════════

edit_discord_dead_links() {
    local msg_id="$1"
    local title="$2"
    local dead_services="$3"   # e.g. "gofile,pixeldrain"
    local archive_url="$4"     # Archive.org permanent link
    local avatar="${AVATAR_URL:-}"
    local timestamp
    timestamp=$(now_utc_iso)
    
    if [[ -z "$msg_id" ]] || [[ "$msg_id" == "null" ]]; then
        log_warn "  No Discord message ID — cannot edit message for: $title"
        return 1
    fi
    
    # Build the warning description
    local dead_list=""
    IFS=',' read -ra services <<< "$dead_services"
    for svc in "${services[@]}"; do
        case "$svc" in
            gofile)     dead_list+="🟠 **Gofile** — ❌ Expired\n" ;;
            pixeldrain) dead_list+="🔵 **Pixeldrain** — ❌ Expired\n" ;;
        esac
    done
    
    local archive_field=""
    if [[ -n "$archive_url" ]]; then
        archive_field="✅ **Archive.org** — [🔗 Still Available (PERMANENT)](${archive_url})"
    else
        archive_field="⚠️ No Archive.org backup available"
    fi
    
    local payload
    payload=$(jq -n \
        --arg username    "${BOT_USERNAME:-☪️ The Muslim Lantern}" \
        --arg avatar      "$avatar" \
        --arg title       "$title" \
        --arg dead_list   "$dead_list" \
        --arg archive     "$archive_field" \
        --arg timestamp   "$timestamp" \
        --arg bot_ver     "${RECORDER_VERSION:-3.0.0}" \
        --arg bot_name    "${RECORDER_NAME:-The Muslim Lantern}" \
        '{
            embeds: [{
                author: {
                    name:     ("⚠️  LINKS UPDATED  ─  Some downloads expired"),
                    icon_url: $avatar
                },
                title:       ("📼  " + $title),
                description: (
                    "Some cloud download links for this recording have **expired**.\n" +
                    "Use the **Archive.org** permanent link instead.\n\n" +
                    "━━━━━ Link Status ━━━━━\n" +
                    $dead_list + "\n" +
                    $archive + "\n\n" +
                    "🏛️ *Archive.org links never expire.*"
                ),
                color: 16744448,
                footer: {
                    text:     ("☪️ " + $bot_name + "  ·  v" + $bot_ver + "  ·  Auto-refreshed"),
                    icon_url: $avatar
                },
                timestamp: $timestamp
            }]
        }')
    
    if patch_discord_webhook "$payload" "recordings" "$msg_id"; then
        log_ok "  ✅ Discord message edited for: $title"
        return 0
    else
        log_warn "  ❌ Failed to edit Discord message for: $title"
        return 1
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  MARK DEAD LINKS IN LINKS.TXT
# ═══════════════════════════════════════════════════════════════════════════════

mark_dead_in_links_txt() {
    local dead_url="$1"
    local links_content="$2"
    
    # Replace the dead URL line with [EXPIRED] marker
    # e.g. "[gofile:Full] https://gofile.io/d/xxx" → "[gofile:Full] https://gofile.io/d/xxx [EXPIRED]"
    echo "$links_content" | sed "s|${dead_url}|${dead_url} [EXPIRED]|g"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN REFRESH ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════════════════════

refresh_links() {
    log_header "🔄 CLOUD LINK PRESERVATION v2.0"
    
    local refresh_start
    refresh_start=$(now_epoch)
    
    # ── Read links.txt ───────────────────────────────────────────────────────
    log_step "Reading links.txt..."
    
    local links_content
    links_content=$(github_api_read_content "links.txt" 2>/dev/null) || {
        log_warn "Could not read links.txt — nothing to refresh"
        return 0
    }
    
    if [[ -z "$links_content" ]]; then
        log_info "links.txt is empty — nothing to refresh"
        return 0
    fi
    
    # ── Parse into structured entries ─────────────────────────────────────────
    log_step "Parsing stream entries..."
    
    local entries_json
    entries_json=$(parse_entries_from_links "$links_content")
    
    local entry_count
    entry_count=$(echo "$entries_json" | jq 'length' 2>/dev/null || echo "0")
    log_info "Found ${entry_count} stream entries"
    
    # ── Extract all URLs for flat checking ────────────────────────────────────
    local gofile_urls=() pixeldrain_urls=() archive_urls=()
    
    while IFS= read -r line; do
        if [[ "$line" =~ \[gofile:[^\]]+\]\ *(https://gofile\.io/d/[^ ]+) ]]; then
            gofile_urls+=("${BASH_REMATCH[1]}")
        fi
        if [[ "$line" =~ \[pixeldrain:[^\]]+\]\ *(https://pixeldrain\.com/u/[^ ]+) ]]; then
            pixeldrain_urls+=("${BASH_REMATCH[1]}")
        fi
        if [[ "$line" =~ \[archive:[^\]]+\]\ *(https://archive\.org/details/[^ ]+) ]]; then
            archive_urls+=("${BASH_REMATCH[1]}")
        fi
    done <<< "$links_content"
    
    local total_gofile=${#gofile_urls[@]}
    local total_pixeldrain=${#pixeldrain_urls[@]}
    local total_archive=${#archive_urls[@]}
    local total_links=$(( total_gofile + total_pixeldrain ))
    
    log_info "Found links:"
    log_info "  Gofile     : ${total_gofile}"
    log_info "  Pixeldrain : ${total_pixeldrain}"
    log_info "  Archive.org: ${total_archive} (permanent, no refresh needed)"
    log_info "  Total to check: ${total_links}"
    log_separator
    
    # ── Track results ─────────────────────────────────────────────────────────
    local total_checked=0 total_alive=0 total_refreshed=0 total_dead=0 total_edited=0
    local dead_gofile_urls=() dead_pixeldrain_urls=()
    local updated_links="$links_content"
    
    # ── Refresh Gofile links (1KB ping) ───────────────────────────────────────
    if (( total_gofile > 0 )); then
        log_step "Refreshing Gofile links (1KB ping)..."
        
        for url in "${gofile_urls[@]}"; do
            # Skip already-expired links
            if echo "$links_content" | grep -q "${url}.*\[EXPIRED\]"; then
                log_info "  [skip] Already expired: $url"
                continue
            fi
            
            (( total_checked++ ))
            log_info "  [${total_checked}/${total_links}] Checking: $url"
            
            if check_link_alive "$url"; then
                (( total_alive++ ))
                if refresh_gofile "$url"; then
                    (( total_refreshed++ ))
                    log_ok "    ✅ Alive — timer reset (1KB)"
                else
                    log_warn "    ⚠️ Alive but refresh ping failed"
                fi
            else
                (( total_dead++ ))
                dead_gofile_urls+=("$url")
                updated_links=$(mark_dead_in_links_txt "$url" "$updated_links")
                log_warn "    💀 DEAD — link expired"
            fi
            
            random_sleep 1 3
        done
    fi
    
    # ── Refresh Pixeldrain links (10% download) ───────────────────────────────
    if (( total_pixeldrain > 0 )); then
        log_step "Refreshing Pixeldrain links (10% download)..."
        
        for url in "${pixeldrain_urls[@]}"; do
            # Skip already-expired links
            if echo "$links_content" | grep -q "${url}.*\[EXPIRED\]"; then
                log_info "  [skip] Already expired: $url"
                continue
            fi
            
            (( total_checked++ ))
            log_info "  [${total_checked}/${total_links}] Checking: $url"
            
            if check_link_alive "$url"; then
                (( total_alive++ ))
                if refresh_pixeldrain "$url"; then
                    (( total_refreshed++ ))
                    log_ok "    ✅ Alive — timer reset (10% downloaded)"
                else
                    log_warn "    ⚠️ Alive but 10% download failed"
                fi
            else
                (( total_dead++ ))
                dead_pixeldrain_urls+=("$url")
                updated_links=$(mark_dead_in_links_txt "$url" "$updated_links")
                log_warn "    💀 DEAD — link expired"
            fi
            
            random_sleep 2 5
        done
    fi
    
    # ── Edit Discord messages for entries with dead links ─────────────────────
    if (( total_dead > 0 )); then
        log_separator
        log_step "Editing Discord messages for dead links..."
        
        local i=0
        while (( i < entry_count )); do
            local entry
            entry=$(echo "$entries_json" | jq ".[$i]")
            local e_title e_msgid e_gofile e_pixeldrain e_archive
            e_title=$(echo "$entry" | jq -r '.title')
            e_msgid=$(echo "$entry" | jq -r '.msg_id')
            e_gofile=$(echo "$entry" | jq -r '.gofile')
            e_pixeldrain=$(echo "$entry" | jq -r '.pixeldrain')
            e_archive=$(echo "$entry" | jq -r '.archive')
            
            # Check if any of this entry's links are in the dead list
            local dead_services=""
            
            # Check gofile
            if [[ -n "$e_gofile" ]]; then
                IFS='|' read -ra g_urls <<< "$e_gofile"
                for g_url in "${g_urls[@]}"; do
                    for dead in "${dead_gofile_urls[@]:-}"; do
                        [[ "$g_url" == "$dead" ]] && { dead_services+="gofile,"; break; }
                    done
                done
            fi
            
            # Check pixeldrain
            if [[ -n "$e_pixeldrain" ]]; then
                IFS='|' read -ra p_urls <<< "$e_pixeldrain"
                for p_url in "${p_urls[@]}"; do
                    for dead in "${dead_pixeldrain_urls[@]:-}"; do
                        [[ "$p_url" == "$dead" ]] && { dead_services+="pixeldrain,"; break; }
                    done
                done
            fi
            
            # If this entry has dead links, edit its Discord message
            if [[ -n "$dead_services" ]]; then
                dead_services="${dead_services%,}"  # remove trailing comma
                
                # Get the first archive URL for this entry
                local first_archive=""
                if [[ -n "$e_archive" ]]; then
                    first_archive=$(echo "$e_archive" | cut -d'|' -f1)
                fi
                
                log_info "  Entry: $e_title"
                log_info "    Dead: $dead_services"
                log_info "    Archive fallback: ${first_archive:-NONE}"
                log_info "    Discord MsgID: ${e_msgid:-NONE}"
                
                if [[ -n "$e_msgid" ]] && [[ "$e_msgid" != "null" ]] && [[ "$e_msgid" != "" ]]; then
                    if edit_discord_dead_links "$e_msgid" "$e_title" "$dead_services" "$first_archive"; then
                        (( total_edited++ ))
                    fi
                    sleep 2  # Rate limit protection
                else
                    log_warn "    No message ID — cannot edit Discord message"
                fi
            fi
            
            (( i++ ))
        done
    fi
    
    # ── Save updated links.txt if any links died ─────────────────────────────
    if [[ "$updated_links" != "$links_content" ]]; then
        log_step "Saving updated links.txt (marking expired links)..."
        
        if github_api_write "links.txt" "$updated_links" "🔄 Link refresh: ${total_dead} expired links marked [$(now_pkt)]"; then
            log_ok "links.txt updated with [EXPIRED] markers"
        else
            log_warn "Failed to update links.txt"
        fi
    fi
    
    # ── Summary ──────────────────────────────────────────────────────────────
    local refresh_elapsed=$(( $(now_epoch) - refresh_start ))
    
    log_separator
    log_ok "═══ LINK REFRESH COMPLETE ═══"
    log_info "  Checked       : ${total_checked}"
    log_info "  Alive         : ${total_alive}"
    log_info "  Refreshed     : ${total_refreshed}"
    log_info "  Dead          : ${total_dead}"
    log_info "  DC Msgs Edited: ${total_edited}"
    log_info "  Duration      : $(format_duration_human "$refresh_elapsed")"
    
    # Export for Discord notification and workflow summary
    set_env "REFRESH_TOTAL_CHECKED" "$total_checked"
    set_env "REFRESH_TOTAL_ALIVE" "$total_alive"
    set_env "REFRESH_TOTAL_REFRESHED" "$total_refreshed"
    set_env "REFRESH_TOTAL_DEAD" "$total_dead"
    set_env "REFRESH_TOTAL_RESTORED" "$total_edited"
    set_env "REFRESH_TIME_FMT" "$(format_duration_human "$refresh_elapsed")"
    
    # Also set the vars that notify_links_refreshed expects
    set_env "REFRESH_CHECKED" "$total_checked"
    set_env "REFRESH_ACTIVE" "$total_alive"
    set_env "REFRESH_EXPIRED" "$total_dead"
    
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    refresh_links
fi
