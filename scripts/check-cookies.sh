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
    local response
    response=$(curl -s --max-time 15 \
        -b "$cookies_file" \
        -H "User-Agent: ${user_agent}" \
        -H "Accept-Language: en-US,en;q=0.9" \
        "https://www.youtube.com/feed/subscriptions" 2>/dev/null) || {
        log_warn "Could not reach YouTube — skipping cookie check"
        set_env "COOKIE_STATUS" "check_failed"
        set_output "cookie_status" "check_failed"
        return 0
    }
    
    # Check for signs of being logged in
    local logged_in=false
    
    # Method 1: Check for subscription feed content (only visible when logged in)
    if echo "$response" | grep -q '"subscriptionButton"'; then
        logged_in=true
    fi
    
    # Method 2: Check for user avatar/account indicators
    if echo "$response" | grep -qE '"LOGGED_IN"|"accountName"|"avatarUrl"'; then
        logged_in=true
    fi
    
    # Method 3: Check if we were redirected to login page (means NOT logged in)
    if echo "$response" | grep -qE 'accounts\.google\.com|"LOGIN_REQUIRED"'; then
        logged_in=false
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
