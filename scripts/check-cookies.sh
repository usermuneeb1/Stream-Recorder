#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  📡 STREAM RECORDER — COOKIE HEALTH CHECK                                  ║
# ║  Tests if YouTube cookies are still valid before recording.                ║
# ║  Sends Discord warning when cookies expire or get old.                     ║
# ║                                                                            ║
# ║  IMPORTANT: Cookies CANNOT be auto-refreshed!                              ║
# ║  YouTube login cookies expire after 2-4 weeks.                             ║
# ║  You must manually re-export from your browser and update the secret.      ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

# ═══════════════════════════════════════════════════════════════════════════════
#  CHECK COOKIE VALIDITY
#  Makes a lightweight authenticated request to YouTube to test cookies
# ═══════════════════════════════════════════════════════════════════════════════

check_cookie_health() {
    log_header "🍪 COOKIE HEALTH CHECK"
    
    local cookies_file="${COOKIES_FILE:-cookies.txt}"
    
    # ── Check if cookies file exists ─────────────────────────────────────────
    if [[ ! -f "$cookies_file" ]] || [[ ! -s "$cookies_file" ]]; then
        log_warn "No cookies file found — cookieless mode"
        set_env "COOKIE_STATUS" "no_cookies"
        set_output "cookie_status" "no_cookies"
        return 0
    fi
    
    local cookie_lines
    cookie_lines=$(wc -l < "$cookies_file")
    log_info "Cookies file: ${cookie_lines} lines"
    
    # ── Test cookies by making an authenticated YouTube request ──────────────
    log_step "Testing cookie validity with YouTube..."
    
    local user_agent
    user_agent=$(rotate_user_agent)
    
    # Try to access YouTube with cookies and check if we're logged in
    # We test multiple indicators since GitHub IPs may get different responses
    local response
    response=$(curl -s --max-time 15 \
        -b "$cookies_file" \
        -H "User-Agent: ${user_agent}" \
        -H "Accept-Language: en-US,en;q=0.9" \
        -H "Cookie: CONSENT=YES+cb.20230101-00-p0.en+FX+414; SOCS=CAI" \
        "https://www.youtube.com/" 2>/dev/null) || {
        log_warn "Could not reach YouTube — skipping cookie check"
        set_env "COOKIE_STATUS" "check_failed"
        set_output "cookie_status" "check_failed"
        return 0
    }
    
    # Check for signs of being logged in
    local logged_in=false
    
    # Method 1: Check cookie file itself for essential session cookies
    if grep -qE '(SID|SSID|HSID|APISID|SAPISID|__Secure-1PSID)' "$cookies_file" 2>/dev/null; then
        # Has session cookies — now verify they're not expired via response
        # Method 2: Check for logged-in indicators in the YouTube homepage
        if grep -qE '"LOGGED_IN"\s*:\s*true|"loggedIn"\s*:\s*true' <<< "$response" 2>/dev/null; then
            logged_in=true
        fi
        # Method 3: Check for account menu (present when logged in)
        if grep -qE '"accountName"|"ACCOUNT_MENU"|"signoutUrl"|"avatarUrl"' <<< "$response" 2>/dev/null; then
            logged_in=true
        fi
        # Method 4: Check that we're NOT being redirected to login
        if grep -qE '"LOGIN_REQUIRED"|accounts\.google\.com/ServiceLogin' <<< "$response" 2>/dev/null; then
            logged_in=false
        fi
        # Method 5: If none of the above matched, check if session cookies look fresh
        # by verifying the cookie file has non-expired entries
        if [[ "$logged_in" == "false" ]]; then
            local current_epoch
            current_epoch=$(date +%s)
            local has_future_expiry=false
            while IFS=$'\t' read -r domain _ path secure expiry name _; do
                [[ "$domain" == "#"* ]] && continue
                [[ -z "$expiry" ]] && continue
                if [[ "$expiry" =~ ^[0-9]+$ ]] && (( expiry > current_epoch )); then
                    has_future_expiry=true
                    break
                fi
            done < "$cookies_file"
            if [[ "$has_future_expiry" == "true" ]]; then
                # Cookies have future expiry dates — likely valid but YouTube gave us a consent wall
                log_info "Cookies have valid expiry dates — treating as valid (consent wall detected)"
                logged_in=true
            fi
        fi
    fi
    
    if [[ "$logged_in" == "true" ]]; then
        log_ok "🍪 Cookies are VALID — logged into YouTube! ✅"
        set_env "COOKIE_STATUS" "valid"
        set_output "cookie_status" "valid"
        
        # Update the last-valid timestamp
        github_api_write "cookie_timestamp.txt" "$(now_epoch)" \
            "🍪 Cookie health check: valid ($(now_pkt))" 2>/dev/null || true
        
    else
        log_error "🍪 Cookies are EXPIRED or INVALID! ❌"
        set_env "COOKIE_STATUS" "expired"
        set_output "cookie_status" "expired"
        
        local last_warning_time
        last_warning_time=$(github_api_read_content "cookie_warning_sent.txt" 2>/dev/null) || last_warning_time=0
        local current_time
        current_time=$(now_epoch)
        
        if (( current_time - last_warning_time > 86400 )); then
            # Send Discord warning
            source "$SCRIPT_DIR/discord-notify.sh"
            
            # Calculate cookie age
            local cookie_age="unknown"
            local last_valid
            last_valid=$(github_api_read_content "cookie_timestamp.txt" 2>/dev/null) || last_valid=""
            if [[ -n "$last_valid" ]]; then
                local now_ts
                now_ts=$(now_epoch)
                local age_sec=$(( now_ts - last_valid ))
                cookie_age=$(( age_sec / 86400 ))
            fi
            
            notify_cookie_warning "expired" "$cookie_age"
            github_api_write "cookie_warning_sent.txt" "$current_time" "Lock: Cookie warning sent" >/dev/null 2>&1 || true
        else
            log_warn "Cookie warn limited (already sent within 24h)"
        fi
        
        log_warn "⚠️ Recording will continue with cookieless methods (lower quality)"
        log_warn "⚠️ To fix: re-export cookies from your browser and update the YOUTUBE_COOKIES secret"
    fi
    
    # ── Check cookie age (warn if getting old) ───────────────────────────────
    if [[ "$logged_in" == "true" ]] && [[ "${ENABLE_COOKIE_HEALTH_CHECK:-true}" == "true" ]]; then
        local last_valid
        last_valid=$(github_api_read_content "cookie_timestamp.txt" 2>/dev/null) || last_valid=""
        
        if [[ -n "$last_valid" ]]; then
            local now_ts
            now_ts=$(now_epoch)
            local age_sec=$(( now_ts - last_valid ))
            local age_days=$(( age_sec / 86400 ))
            local warn_days="${COOKIE_WARNING_DAYS:-14}"
            
            log_info "Cookie age: ${age_days} days (warn at ${warn_days} days)"
            
            if (( age_days >= warn_days )); then
                log_warn "Cookies are ${age_days} days old — consider refreshing soon"
                
                source "$SCRIPT_DIR/discord-notify.sh"
                notify_cookie_warning "expiring_soon" "$age_days"
            fi
        fi
    fi
    
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    check_cookie_health
fi
