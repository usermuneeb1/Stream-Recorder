#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  📡 STREAM RECORDER — CLOUDFLARE WARP SETUP                                ║
# ║  Installs and connects Cloudflare WARP to mask GitHub Actions IP.           ║
# ║  YouTube sees Cloudflare network IP instead of GitHub datacenter IP.        ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN FUNCTION
# ═══════════════════════════════════════════════════════════════════════════════

setup_warp() {
    log_header "🌐 CLOUDFLARE WARP SETUP"

    # ── Check if WARP is enabled ─────────────────────────────────────────────
    if [[ "${ENABLE_WARP:-true}" != "true" ]]; then
        log_warn "WARP is disabled in config — skipping"
        set_output "warp_status" "disabled"
        return 0
    fi

    # ── Record original IP ───────────────────────────────────────────────────
    local original_ip
    original_ip=$(get_public_ip)
    log_info "Original IP (GitHub datacenter): ${original_ip}"
    set_env "ORIGINAL_IP" "$original_ip"

    # ── Install Cloudflare WARP ──────────────────────────────────────────────
    log_step "Installing Cloudflare WARP CLI..."

    # Add Cloudflare GPG key
    if ! curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg | \
        sudo gpg --yes --dearmor -o /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg 2>/dev/null; then
        log_error "Failed to add Cloudflare GPG key"
        _warp_fallback
        return 0
    fi

    # Detect Ubuntu codename
    local codename
    codename=$(lsb_release -cs 2>/dev/null || echo "jammy")
    log_debug "Ubuntu codename: ${codename}"

    # Add repository
    echo "deb [signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ ${codename} main" | \
        sudo tee /etc/apt/sources.list.d/cloudflare-client.list > /dev/null

    # Install
    if ! (sudo apt-get update -qq 2>/dev/null; sudo apt-get install -y -qq cloudflare-warp 2>/dev/null); then
        # Try with jammy if codename fails
        log_warn "Install failed with ${codename}, trying jammy..."
        echo "deb [signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ jammy main" | \
            sudo tee /etc/apt/sources.list.d/cloudflare-client.list > /dev/null
        sudo apt-get update -qq 2>/dev/null
        if ! sudo apt-get install -y -qq cloudflare-warp 2>/dev/null; then
            log_error "Failed to install Cloudflare WARP"
            _warp_fallback
            return 0
        fi
    fi

    log_ok "Cloudflare WARP CLI installed"

    # ── Register device ──────────────────────────────────────────────────────
    log_step "Registering WARP device..."

    # Register new device (accepts TOS automatically)
    if ! warp-cli --accept-tos registration new 2>/dev/null; then
        # Try older CLI syntax
        if ! warp-cli register 2>/dev/null; then
            log_error "Failed to register WARP device"
            _warp_fallback
            return 0
        fi
    fi

    log_ok "WARP device registered"

    # ── Apply WARP+ license (optional) ───────────────────────────────────────
    local warp_license="${WARP_LICENSE_KEY:-}"
    if [[ -n "$warp_license" ]]; then
        log_step "Applying WARP+ license..."
        if warp-cli --accept-tos registration license "$warp_license" 2>/dev/null || \
           warp-cli set-license "$warp_license" 2>/dev/null; then
            log_ok "WARP+ license applied — faster speeds enabled"
        else
            log_warn "WARP+ license failed — using free tier"
        fi
    fi

    # ── Set WARP mode ────────────────────────────────────────────────────────
    log_step "Configuring WARP mode..."
    warp-cli --accept-tos mode warp 2>/dev/null || \
    warp-cli set-mode warp 2>/dev/null || true

    # ── Connect to WARP ──────────────────────────────────────────────────────
    log_step "Connecting to WARP network..."

    if ! warp-cli --accept-tos connect 2>/dev/null; then
        if ! warp-cli connect 2>/dev/null; then
            log_error "Failed to connect to WARP"
            _warp_fallback
            return 0
        fi
    fi

    # ── Wait for connection ──────────────────────────────────────────────────
    local timeout="${WARP_CONNECT_TIMEOUT:-60}"
    local waited=0
    local connected=false

    log_info "Waiting for WARP connection (timeout: ${timeout}s)..."

    while (( waited < timeout )); do
        local status
        status=$(warp-cli --accept-tos status 2>/dev/null || warp-cli status 2>/dev/null || echo "")

        if echo "$status" | grep -qi "connected"; then
            connected=true
            break
        fi

        sleep 2
        (( waited += 2 ))
    done

    if [[ "$connected" != "true" ]]; then
        log_error "WARP connection timed out after ${timeout}s"
        _warp_fallback
        return 0
    fi

    # ── Verify IP changed ────────────────────────────────────────────────────
    sleep 3  # Give DNS a moment to settle
    local new_ip
    new_ip=$(get_public_ip)
    log_info "New IP (Cloudflare WARP): ${new_ip}"
    set_env "WARP_IP" "$new_ip"

    if [[ "$original_ip" == "$new_ip" ]]; then
        log_warn "IP did not change — WARP may not be routing traffic"
        set_output "warp_status" "connected-same-ip"
    else
        log_ok "IP successfully changed: ${original_ip} → ${new_ip}"
        set_output "warp_status" "connected"
    fi

    # ── Log connection details ───────────────────────────────────────────────
    log_separator
    log_info "WARP Connection Summary:"
    log_info "  Original IP : ${original_ip} (GitHub)"
    log_info "  Current IP  : ${new_ip} (Cloudflare)"
    log_info "  Status      : Connected ✅"
    log_info "  License     : ${warp_license:+WARP+}${warp_license:-Free}"
    log_separator

    set_env "WARP_CONNECTED" "true"
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
#  FALLBACK (when WARP fails to install/connect)
# ═══════════════════════════════════════════════════════════════════════════════

_warp_fallback() {
    log_warn "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_warn "WARP setup failed — proceeding with raw GitHub IP"
    log_warn "YouTube may throttle or block this IP address."
    log_warn "Recording will still be attempted with all methods."
    log_warn "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    set_output "warp_status" "failed"
    set_env "WARP_CONNECTED" "false"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  DISCONNECT (called during cleanup)
# ═══════════════════════════════════════════════════════════════════════════════

disconnect_warp() {
    if [[ "${WARP_CONNECTED:-false}" == "true" ]]; then
        log_step "Disconnecting WARP..."
        warp-cli --accept-tos disconnect 2>/dev/null || \
        warp-cli disconnect 2>/dev/null || true
        log_ok "WARP disconnected"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    setup_warp
fi
