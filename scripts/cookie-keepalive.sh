#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  📡 STREAM RECORDER — COOKIE KEEP-ALIVE ENGINE                              ║
# ║  Automatically extends YouTube cookie lifespan by making authenticated      ║
# ║  requests every 2 days. This prevents inactivity-based expiry.              ║
# ║                                                                              ║
# ║  How it works:                                                               ║
# ║    1. Loads your cookies from the YOUTUBE_COOKIES secret                     ║
# ║    2. Makes lightweight authenticated requests to YouTube                    ║
# ║    3. YouTube sees activity → resets session timeout                         ║
# ║    4. Reports cookie health via Discord                                      ║
# ║                                                                              ║
# ║  LIMITATIONS:                                                                ║
# ║    - Cannot prevent Google from revoking tokens server-side                  ║
# ║    - Cannot bypass 2FA re-verification if Google requires it                 ║
# ║    - Cannot create NEW cookies — only keeps existing ones alive              ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

# ═══════════════════════════════════════════════════════════════════════════════
#  COOKIE KEEP-ALIVE
# ═══════════════════════════════════════════════════════════════════════════════

keepalive_cookies() {
    log_header "🍪 COOKIE KEEP-ALIVE ENGINE"
    
    local cookies_file="${COOKIES_FILE:-cookies.txt}"
    
    # ── Validate cookies file ────────────────────────────────────────────────
    if [[ ! -f "$cookies_file" ]] || [[ ! -s "$cookies_file" ]]; then
        log_error "No cookies file found — nothing to keep alive"
        log_info "Set the YOUTUBE_COOKIES secret with your exported cookies"
        return 1
    fi
    
    local cookie_lines
    cookie_lines=$(grep -v '^#' "$cookies_file" | grep -c '.' 2>/dev/null || echo "0")
    log_info "Cookie file: ${cookie_lines} data lines"
    
    # ── Check cookie expiry dates ────────────────────────────────────────────
    log_step "Checking cookie expiry dates..."
    
    local current_epoch
    current_epoch=$(date +%s)
    local earliest_expiry=999999999999
    local expired_count=0
    local valid_count=0
    local critical_cookies=("SID" "HSID" "SSID" "APISID" "SAPISID" "__Secure-1PSID" "__Secure-3PSID" "LOGIN_INFO")
    local missing_critical=""
    
    while IFS=$'\t' read -r domain _ path secure expiry name value; do
        [[ "$domain" == "#"* ]] && continue
        [[ -z "$name" ]] && continue
        
        # Check if critical cookie is present
        for crit in "${critical_cookies[@]}"; do
            if [[ "$name" == "$crit" ]]; then
                if [[ -n "$expiry" ]] && [[ "$expiry" =~ ^[0-9]+$ ]] && (( expiry > 0 && expiry < current_epoch )); then
                    missing_critical+="$name (expired), "
                fi
            fi
        done
        
        # Track expiry
        if [[ -n "$expiry" ]] && [[ "$expiry" =~ ^[0-9]+$ ]] && (( expiry > 0 )); then
            if (( expiry < current_epoch )); then
                (( expired_count++ ))
            else
                (( valid_count++ ))
                if (( expiry < earliest_expiry )); then
                    earliest_expiry=$expiry
                fi
            fi
        fi
    done < "$cookies_file"
    
    log_info "Valid cookies: ${valid_count}, Expired: ${expired_count}"
    
    if (( valid_count == 0 )); then
        log_error "ALL cookies have expired — keep-alive cannot help"
        log_error "You must manually re-export cookies from your browser"
        
        # Send urgent Discord alert
        source "$SCRIPT_DIR/discord-notify.sh"
        notify_cookie_warning "expired" "0"
        
        set_env "COOKIE_KEEPALIVE_STATUS" "all_expired"
        return 1
    fi
    
    # Calculate days until earliest expiry
    local days_remaining=$(( (earliest_expiry - current_epoch) / 86400 ))
    local expiry_date
    expiry_date=$(TZ='Asia/Karachi' date -d "@${earliest_expiry}" '+%Y-%m-%d %I:%M %p PKT' 2>/dev/null || \
                  date -d "@${earliest_expiry}" '+%Y-%m-%d' 2>/dev/null || echo "unknown")
    
    log_info "Earliest cookie expiry: ${expiry_date} (${days_remaining} days)"
    
    if [[ -n "$missing_critical" ]]; then
        log_warn "Missing/expired critical cookies: ${missing_critical}"
    fi
    
    # ── Make authenticated YouTube requests (keep-alive pings) ────────────────
    log_step "Sending keep-alive pings to YouTube..."
    
    local user_agent
    user_agent=$(rotate_user_agent)
    local success_count=0
    local total_pings=0
    
    # Ping 1: YouTube homepage (loads session)
    (( total_pings++ ))
    log_info "  Ping 1/4: YouTube homepage..."
    local resp_code
    resp_code=$(curl -s -o /dev/null -w '%{http_code}' \
        --max-time 20 \
        -b "$cookies_file" \
        -H "User-Agent: ${user_agent}" \
        -H "Accept-Language: en-US,en;q=0.9" \
        -H "Accept: text/html" \
        "https://www.youtube.com/" 2>/dev/null) || resp_code="000"
    if [[ "$resp_code" =~ ^2[0-9]{2}$ ]]; then
        log_ok "  YouTube homepage: HTTP ${resp_code} ✅"
        (( success_count++ ))
    else
        log_warn "  YouTube homepage: HTTP ${resp_code}"
    fi
    sleep 3
    
    # Ping 2: YouTube feed (triggers authenticated content)
    (( total_pings++ ))
    log_info "  Ping 2/4: YouTube subscriptions feed..."
    resp_code=$(curl -s -o /dev/null -w '%{http_code}' \
        --max-time 20 \
        -b "$cookies_file" \
        -H "User-Agent: ${user_agent}" \
        -H "Accept-Language: en-US,en;q=0.9" \
        "https://www.youtube.com/feed/subscriptions" 2>/dev/null) || resp_code="000"
    if [[ "$resp_code" =~ ^2[0-9]{2}$ ]]; then
        log_ok "  Subscriptions feed: HTTP ${resp_code} ✅"
        (( success_count++ ))
    else
        log_warn "  Subscriptions feed: HTTP ${resp_code}"
    fi
    sleep 3
    
    # Ping 3: YouTube history (deep authenticated endpoint)
    (( total_pings++ ))
    log_info "  Ping 3/4: YouTube history..."
    resp_code=$(curl -s -o /dev/null -w '%{http_code}' \
        --max-time 20 \
        -b "$cookies_file" \
        -H "User-Agent: ${user_agent}" \
        -H "Accept-Language: en-US,en;q=0.9" \
        "https://www.youtube.com/feed/history" 2>/dev/null) || resp_code="000"
    if [[ "$resp_code" =~ ^2[0-9]{2}$ ]]; then
        log_ok "  History feed: HTTP ${resp_code} ✅"
        (( success_count++ ))
    else
        log_warn "  History feed: HTTP ${resp_code}"
    fi
    sleep 3
    
    # Ping 4: YouTube account settings (heaviest auth check)
    (( total_pings++ ))
    log_info "  Ping 4/4: YouTube account page..."
    resp_code=$(curl -s -o /dev/null -w '%{http_code}' \
        --max-time 20 \
        -b "$cookies_file" \
        -H "User-Agent: ${user_agent}" \
        -H "Accept-Language: en-US,en;q=0.9" \
        "https://www.youtube.com/account" 2>/dev/null) || resp_code="000"
    if [[ "$resp_code" =~ ^2[0-9]{2}$ ]]; then
        log_ok "  Account page: HTTP ${resp_code} ✅"
        (( success_count++ ))
    else
        log_warn "  Account page: HTTP ${resp_code}"
    fi
    
    # ── Determine health status ──────────────────────────────────────────────
    log_separator
    
    local status="healthy"
    local status_emoji="🟢"
    
    if (( success_count == 0 )); then
        status="dead"
        status_emoji="🔴"
        log_error "All pings failed — cookies are likely invalid"
    elif (( success_count < total_pings )); then
        status="degraded"
        status_emoji="🟡"
        log_warn "Some pings failed — cookies may be partially working"
    else
        log_ok "All pings succeeded — cookies are healthy! ✅"
    fi
    
    if (( days_remaining <= 3 )); then
        status="critical"
        status_emoji="🔴"
        log_error "Cookies expire in ${days_remaining} days — refresh ASAP!"
    elif (( days_remaining <= 7 )); then
        status="warning"
        status_emoji="🟡"
        log_warn "Cookies expire in ${days_remaining} days — plan to refresh soon"
    fi
    
    # ── Record keep-alive timestamp ──────────────────────────────────────────
    local keepalive_data
    keepalive_data=$(jq -n \
        --arg status        "$status" \
        --arg pings_ok      "$success_count" \
        --arg pings_total   "$total_pings" \
        --arg days_left     "$days_remaining" \
        --arg expiry_date   "$expiry_date" \
        --arg keepalive_at  "$(now_utc_iso)" \
        --arg valid_cookies "$valid_count" \
        --arg expired_cookies "$expired_count" \
        '{
            status: $status,
            pings_ok: ($pings_ok | tonumber),
            pings_total: ($pings_total | tonumber),
            days_until_expiry: ($days_left | tonumber),
            earliest_expiry: $expiry_date,
            keepalive_at: $keepalive_at,
            valid_cookies: ($valid_cookies | tonumber),
            expired_cookies: ($expired_cookies | tonumber)
        }')
    
    github_api_write "cookie_keepalive.json" "$keepalive_data" \
        "🍪 Keep-alive: ${status} (${success_count}/${total_pings} pings, ${days_remaining}d left)" \
        2>/dev/null || true
    
    # ── Export for Discord ───────────────────────────────────────────────────
    set_env "COOKIE_KEEPALIVE_STATUS" "$status"
    set_env "COOKIE_KEEPALIVE_PINGS_OK" "$success_count"
    set_env "COOKIE_KEEPALIVE_PINGS_TOTAL" "$total_pings"
    set_env "COOKIE_KEEPALIVE_DAYS_LEFT" "$days_remaining"
    set_env "COOKIE_KEEPALIVE_EXPIRY" "$expiry_date"
    set_env "COOKIE_STATUS_EMOJI" "$status_emoji"
    
    # ── Send Discord notification (only if warning/critical/dead) ────────────
    if [[ "$status" == "critical" ]] || [[ "$status" == "dead" ]]; then
        source "$SCRIPT_DIR/discord-notify.sh"
        notify_cookie_warning "expired" "$days_remaining"
    elif [[ "$status" == "warning" ]]; then
        source "$SCRIPT_DIR/discord-notify.sh"
        notify_cookie_warning "expiring_soon" "$days_remaining"
    fi
    
    log_separator
    log_ok "═══ COOKIE KEEP-ALIVE SUMMARY ═══"
    log_info "  Status        : ${status_emoji} ${status}"
    log_info "  Pings         : ${success_count}/${total_pings} OK"
    log_info "  Valid Cookies  : ${valid_count}"
    log_info "  Days Left     : ${days_remaining}"
    log_info "  Earliest Expiry: ${expiry_date}"
    
    [[ "$status" == "dead" ]] && return 1
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    keepalive_cookies
fi
