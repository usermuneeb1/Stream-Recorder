#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  📡 STREAM RECORDER — AUTOMATED CLOUD LINK PRESERVATION                    ║
# ║  Runs every 3 days to keep Gofile/Pixeldrain links alive by pinging them.  ║
# ║  Dead links are automatically restored from Archive.org.                   ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

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
#  REFRESH A LINK (download small chunk to reset expiration timer)
# ═══════════════════════════════════════════════════════════════════════════════

refresh_link() {
    local url="$1"
    local bytes="${REFRESH_PING_BYTES:-1024}"
    
    # Download a small chunk to trigger the expiration reset
    curl -s -o /dev/null --max-time 30 \
        -r "0-${bytes}" \
        -L "$url" 2>/dev/null
    
    return $?
}

# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN REFRESH ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════════════════════

refresh_links() {
    log_header "🔄 CLOUD LINK PRESERVATION"
    
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
    
    # ── Extract all URLs ─────────────────────────────────────────────────────
    log_step "Extracting cloud links..."
    
    local gofile_urls=()
    local pixeldrain_urls=()
    local archive_urls=()
    
    while IFS= read -r line; do
        # Match format: [gofile:Part 1] https://gofile.io/d/XXXXX
        if [[ "$line" =~ \[gofile:[^\]]+\]\ *(https://gofile\.io/d/[^ ]+) ]]; then
            gofile_urls+=("${BASH_REMATCH[1]}")
        elif [[ "$line" =~ gofile\.io/d/([a-zA-Z0-9]+) ]]; then
            gofile_urls+=("https://gofile.io/d/${BASH_REMATCH[1]}")
        fi
        # Match format: [pixeldrain:Part 1] https://pixeldrain.com/u/XXXXX
        if [[ "$line" =~ \[pixeldrain:[^\]]+\]\ *(https://pixeldrain\.com/u/[^ ]+) ]]; then
            pixeldrain_urls+=("${BASH_REMATCH[1]}")
        elif [[ "$line" =~ pixeldrain\.com/u/([a-zA-Z0-9_-]+) ]]; then
            pixeldrain_urls+=("https://pixeldrain.com/u/${BASH_REMATCH[1]}")
        fi
        # Match format: [archive:Part 1] https://archive.org/details/XXXXX
        if [[ "$line" =~ \[archive:[^\]]+\]\ *(https://archive\.org/details/[^ ]+) ]]; then
            archive_urls+=("${BASH_REMATCH[1]}")
        elif [[ "$line" =~ archive\.org/details/([a-zA-Z0-9_-]+) ]]; then
            archive_urls+=("https://archive.org/details/${BASH_REMATCH[1]}")
        fi
    done <<< "$links_content"
    
    local total_gofile=${#gofile_urls[@]}
    local total_pixeldrain=${#pixeldrain_urls[@]}
    local total_archive=${#archive_urls[@]}
    local total_links=$(( total_gofile + total_pixeldrain ))
    
    log_info "Found links:"
    log_info "  Gofile     : ${total_gofile}"
    log_info "  Pixeldrain : ${total_pixeldrain}"
    log_info "  Archive.org: ${total_archive}"
    log_info "  Total to check: ${total_links}"
    log_separator
    
    # ── Refresh Gofile links ─────────────────────────────────────────────────
    local total_checked=0 total_alive=0 total_refreshed=0 total_dead=0 total_restored=0
    
    if (( total_gofile > 0 )); then
        log_step "Refreshing Gofile links..."
        
        for url in "${gofile_urls[@]}"; do
            (( total_checked++ ))
            log_info "  [${total_checked}/${total_links}] Checking: $url"
            
            if check_link_alive "$url"; then
                (( total_alive++ ))
                if refresh_link "$url"; then
                    (( total_refreshed++ ))
                    log_ok "    ✅ Alive — timer reset"
                else
                    log_warn "    ⚠️ Alive but refresh ping failed"
                fi
            else
                (( total_dead++ ))
                log_warn "    💀 DEAD — link expired or deleted"
                # TODO: Could restore from Archive.org in future
            fi
            
            random_sleep 1 3
        done
    fi
    
    # ── Refresh Pixeldrain links ─────────────────────────────────────────────
    if (( total_pixeldrain > 0 )); then
        log_step "Refreshing Pixeldrain links..."
        
        for url in "${pixeldrain_urls[@]}"; do
            (( total_checked++ ))
            log_info "  [${total_checked}/${total_links}] Checking: $url"
            
            if check_link_alive "$url"; then
                (( total_alive++ ))
                if refresh_link "$url"; then
                    (( total_refreshed++ ))
                    log_ok "    ✅ Alive — timer reset"
                else
                    log_warn "    ⚠️ Alive but refresh ping failed"
                fi
            else
                (( total_dead++ ))
                log_warn "    💀 DEAD — link expired or deleted"
            fi
            
            random_sleep 1 3
        done
    fi
    
    # ── Summary ──────────────────────────────────────────────────────────────
    local refresh_elapsed=$(( $(now_epoch) - refresh_start ))
    
    log_separator
    log_ok "═══ LINK REFRESH COMPLETE ═══"
    log_info "  Checked   : ${total_checked}"
    log_info "  Alive     : ${total_alive}"
    log_info "  Refreshed : ${total_refreshed}"
    log_info "  Dead      : ${total_dead}"
    log_info "  Restored  : ${total_restored}"
    log_info "  Duration  : $(format_duration_human "$refresh_elapsed")"
    
    # Export for Discord notification
    set_env "REFRESH_TOTAL_CHECKED" "$total_checked"
    set_env "REFRESH_TOTAL_ALIVE" "$total_alive"
    set_env "REFRESH_TOTAL_REFRESHED" "$total_refreshed"
    set_env "REFRESH_TOTAL_DEAD" "$total_dead"
    set_env "REFRESH_TOTAL_RESTORED" "$total_restored"
    set_env "REFRESH_TIME_FMT" "$(format_duration_human "$refresh_elapsed")"
    
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    refresh_links
fi
