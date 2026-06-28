#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  📡 STREAM RECORDER — COOKIE HEALTH CHECK                                  ║
# ║  Verifies YouTube cookies and sends Discord alerts before recordings fail.  ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

_cookie_alert() {
    local status="$1"
    local detail="$2"

    # Suppressed under PUBLIC_STREAM_ONLY mode — the recorder runs cookieless
    # so a stale/missing cookie is irrelevant to recording success. Posting
    # 'cookie warning' Discord alerts in this mode just confuses the user.
    if [[ "${PUBLIC_STREAM_ONLY:-true}" == "true" ]]; then
        log_info "Cookie alert suppressed (PUBLIC_STREAM_ONLY=true — cookies not used)"
        return 0
    fi

    local throttle_file="cookie_${status}_warning_sent.txt"
    local throttle_seconds="${COOKIE_WARNING_THROTTLE_SECONDS:-43200}" # 12 hours
    local now_ts last_sent
    now_ts=$(now_epoch)
    last_sent=$(github_api_read_content "$throttle_file" 2>/dev/null) || last_sent=0
    [[ ! "$last_sent" =~ ^[0-9]+$ ]] && last_sent=0

    if (( now_ts - last_sent < throttle_seconds )); then
        log_warn "Cookie ${status} alert throttled (last sent $(( (now_ts - last_sent) / 3600 ))h ago)"
        return 0
    fi

    source "$SCRIPT_DIR/discord-notify.sh"
    notify_cookie_warning "$status" "$detail" || true
    github_api_write "$throttle_file" "$now_ts" "🍪 Cookie ${status} alert sent" >/dev/null 2>&1 || true
}

_cookie_fingerprint() {
    local cookies_file="$1"
    grep -vE '^[[:space:]]*(#|$)' "$cookies_file" 2>/dev/null | sha256sum | awk '{print $1}'
}

_track_cookie_rotation() {
    local cookies_file="$1"
    local fingerprint previous now_ts
    fingerprint=$(_cookie_fingerprint "$cookies_file")
    [[ -z "$fingerprint" ]] && return 0

    previous=$(github_api_read_content "cookie_fingerprint.txt" 2>/dev/null) || previous=""
    now_ts=$(now_epoch)

    if [[ "$fingerprint" != "$previous" ]]; then
        log_ok "New cookie file detected — resetting cookie age timer"
        github_api_write "cookie_fingerprint.txt" "$fingerprint" "🍪 Cookie fingerprint updated ($(now_pkt))" >/dev/null 2>&1 || true
        github_api_write "cookie_timestamp.txt" "$now_ts" "🍪 Cookie file updated ($(now_pkt))" >/dev/null 2>&1 || true
        # Clear old warning throttle files so a genuinely bad new cookie alerts immediately.
        github_api_write "cookie_expired_warning_sent.txt" "0" "🍪 Reset expired cookie warning throttle" >/dev/null 2>&1 || true
        github_api_write "cookie_unverified_warning_sent.txt" "0" "🍪 Reset unverified cookie warning throttle" >/dev/null 2>&1 || true
        github_api_write "cookie_expiring_warning_sent.txt" "0" "🍪 Reset expiring cookie warning throttle" >/dev/null 2>&1 || true
    fi
}

_cookie_age_days() {
    local last_update now_ts
    last_update=$(github_api_read_content "cookie_timestamp.txt" 2>/dev/null) || last_update=""
    [[ ! "$last_update" =~ ^[0-9]+$ ]] && { echo "unknown"; return 0; }
    now_ts=$(now_epoch)
    echo $(( (now_ts - last_update) / 86400 ))
}

_critical_cookie_expiry() {
    local cookies_file="$1"
    awk -F '\t' '
        $0 !~ /^#/ && NF >= 7 && $5 ~ /^[0-9]+$/ && $6 ~ /^(SID|SSID|HSID|APISID|SAPISID|__Secure-[13]PSID|__Secure-[13]PAPISID)$/ {
            if (min == "" || $5 < min) min = $5
        }
        END { if (min != "") print min }
    ' "$cookies_file" 2>/dev/null
}

_check_expiry_window() {
    local cookies_file="$1"
    local min_expiry now_ts days_left warn_days
    min_expiry=$(_critical_cookie_expiry "$cookies_file")
    [[ -z "$min_expiry" ]] && { echo "unknown"; return 0; }

    now_ts=$(now_epoch)
    days_left=$(( (min_expiry - now_ts) / 86400 ))
    warn_days="${COOKIE_EXPIRY_WARNING_DAYS:-5}"

    if (( min_expiry <= now_ts )); then
        echo "expired:${days_left}"
    elif (( days_left <= warn_days )); then
        echo "expiring:${days_left}"
    else
        echo "ok:${days_left}"
    fi
}

check_cookie_health() {
    log_header "🍪 COOKIE HEALTH CHECK"
    
    local cookies_file="${COOKIES_FILE:-cookies.txt}"
    
    if [[ ! -f "$cookies_file" ]] || [[ ! -s "$cookies_file" ]]; then
        log_warn "No cookies file found — cookieless mode"
        set_env "COOKIE_STATUS" "no_cookies"
        set_output "cookie_status" "no_cookies"
        _cookie_alert "expired" "no cookie file"
        return 0
    fi
    
    local cookie_lines
    cookie_lines=$(wc -l < "$cookies_file")
    log_info "Cookies file: ${cookie_lines} lines"

    _track_cookie_rotation "$cookies_file"

    local age_days
    age_days=$(_cookie_age_days)
    log_info "Cookie file age: ${age_days} day(s) since last detected rotation"

    local expiry_state expiry_kind expiry_days
    expiry_state=$(_check_expiry_window "$cookies_file")
    expiry_kind="${expiry_state%%:*}"
    expiry_days="${expiry_state#*:}"
    if [[ "$expiry_kind" == "expired" ]]; then
        log_error "Critical YouTube session cookie is expired"
        set_env "COOKIE_STATUS" "expired"
        set_output "cookie_status" "expired"
        _cookie_alert "expired" "${age_days}"
        return 0
    elif [[ "$expiry_kind" == "expiring" ]]; then
        log_warn "Critical YouTube session cookie expires in ${expiry_days} day(s)"
        _cookie_alert "expiring" "${expiry_days} day(s)"
    elif [[ "$expiry_kind" == "ok" ]]; then
        log_info "Critical YouTube session cookie expiry: ${expiry_days} day(s) left"
    else
        log_warn "Could not determine critical cookie expiry window"
    fi
    
    log_step "Testing cookie validity with YouTube..."
    
    local user_agent
    user_agent=$(rotate_user_agent)
    
    local response
    response=$(curl -s --max-time 20 \
        -b "$cookies_file" \
        -H "User-Agent: ${user_agent}" \
        -H "Accept-Language: en-US,en;q=0.9" \
        "https://www.youtube.com/" 2>/dev/null) || {
        log_warn "Could not reach YouTube from GitHub runner — skipping Discord alert"
        set_env "COOKIE_STATUS" "check_failed"
        set_output "cookie_status" "check_failed"
        return 0
    }
    
    local logged_in=false
    if grep -qE '(SID|SSID|HSID|APISID|SAPISID|__Secure-[13]PSID)' "$cookies_file" 2>/dev/null; then
        if grep -qE '"LOGGED_IN"\s*:\s*true|"loggedIn"\s*:\s*true|"accountName"|"ACCOUNT_MENU"|"signoutUrl"|"avatarUrl"' <<< "$response" 2>/dev/null; then
            logged_in=true
        fi
        if grep -qE '"LOGIN_REQUIRED"|accounts\.google\.com/ServiceLogin' <<< "$response" 2>/dev/null; then
            logged_in=false
        fi
    fi
    
    if [[ "$logged_in" == "true" ]]; then
        log_ok "🍪 Cookies are VALID — logged into YouTube ✅"
        set_env "COOKIE_STATUS" "valid"
        set_output "cookie_status" "valid"
    else
        # Do not mark as expired solely because the homepage was inconclusive.
        # YouTube often hides logged-in indicators from datacenter/GitHub IPs,
        # even when yt-dlp can still use the cookies successfully. Only expired,
        # expiring, or old cookies should trigger Discord alerts by default.
        log_warn "🍪 Cookie login could not be verified from GitHub Actions homepage check"
        log_info "No Discord alert sent: session cookies exist and are not expired/near-expiry"
        set_env "COOKIE_STATUS" "valid_unverified"
        set_output "cookie_status" "valid_unverified"
    fi
    
    local warn_days="${COOKIE_WARNING_DAYS:-14}"
    if [[ "$age_days" =~ ^[0-9]+$ ]] && (( age_days >= warn_days )); then
        log_warn "Cookies are ${age_days} days old — refresh soon"
        _cookie_alert "warning" "$age_days"
    fi
    
    return 0
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    check_cookie_health
fi
