#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║ 📡 STREAM RECORDER — CLOUDFLARE WARP SETUP (HARDENED v4)                ║
# ║ Installs + connects Cloudflare WARP to mask GitHub Actions IP.           ║
# ║ v4 CHANGE: hard-exits if no IP change. Caller MUST treat exit≠0 as fatal ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

setup_warp() {
  log_header "🌐 CLOUDFLARE WARP SETUP (hardened v4)"

  # ── Skip if already connected (step 8 re-runs this) ────────────────────
  if [[ "${WARP_CONNECTED:-false}" == "true" ]]; then
    log_ok "WARP already connected — skipping re-setup"
    return 0
  fi

  # Also check if warp-cli is already connected
  if command -v warp-cli &>/dev/null; then
    local current_status
    current_status=$(warp-cli --accept-tos status 2>/dev/null || warp-cli status 2>/dev/null || echo "")
    if echo "$current_status" | grep -qiE "connected" && ! echo "$current_status" | grep -qi "disconnected"; then
      log_ok "WARP already connected (detected via warp-cli)"
      set_env "WARP_CONNECTED" "true"
      return 0
    fi
  fi

  # ── Check if WARP is enabled ───────────────────────────────────────────
  if [[ "${ENABLE_WARP:-true}" != "true" ]]; then
    log_warn "WARP is disabled in config — skipping"
    set_output "warp_status" "disabled"
    set_env "WARP_CONNECTED" "false"
    return 0
  fi

  # ── Record original IP ─────────────────────────────────────────────────
  local original_ip
  original_ip=$(get_public_ip)
  log_info "Original IP (GitHub datacenter): ${original_ip}"
  set_env "ORIGINAL_IP" "$original_ip"

  # ── 3-attempt install + connect loop ────────────────────────────────────
  local attempt=1
  local max_attempts=3
  local connected=false

  while (( attempt <= max_attempts )); do
    log_step "WARP attempt ${attempt}/${max_attempts}"

    # ── Install Cloudflare WARP (idempotent) ─────────────────────────────
    if ! command -v warp-cli &>/dev/null; then
      log_info "Installing Cloudflare WARP CLI..."

      if ! curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg | \
           sudo gpg --yes --dearmor -o /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg 2>/dev/null; then
        log_warn "Attempt ${attempt}: failed to add Cloudflare GPG key"
        (( attempt++ ))
        sleep 5
        continue
      fi

      local codename
      codename=$(lsb_release -cs 2>/dev/null || echo "jammy")
      echo "deb [signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ ${codename} main" | \
        sudo tee /etc/apt/sources.list.d/cloudflare-client.list > /dev/null

      if ! (sudo apt-get update -qq 2>/dev/null; sudo apt-get install -y -qq cloudflare-warp 2>/dev/null); then
        log_warn "Attempt ${attempt}: install failed with ${codename}, trying jammy..."
        echo "deb [signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ jammy main" | \
          sudo tee /etc/apt/sources.list.d/cloudflare-client.list > /dev/null
        sudo apt-get update -qq 2>/dev/null
        if ! sudo apt-get install -y -qq cloudflare-warp 2>/dev/null; then
          log_warn "Attempt ${attempt}: install failed"
          (( attempt++ ))
          sleep 5
          continue
        fi
      fi
      log_ok "Cloudflare WARP CLI installed"
    fi

    # ── Wait for daemon ──────────────────────────────────────────────────
    local daemon_wait=0
    while (( daemon_wait < 15 )); do
      if warp-cli --accept-tos status &>/dev/null || warp-cli status &>/dev/null; then
        break
      fi
      sleep 2
      (( daemon_wait += 2 ))
    done

    # ── Register device ──────────────────────────────────────────────────
    local reg_output
    reg_output=$(warp-cli --accept-tos registration new 2>&1) || {
      log_warn "Attempt ${attempt}: registration failed: ${reg_output}"
      (( attempt++ ))
      sleep 5
      continue
    }
    log_ok "WARP device registered"

    # ── Apply WARP+ license (optional) ───────────────────────────────────
    local warp_license="${WARP_LICENSE_KEY:-}"
    if [[ -n "$warp_license" ]]; then
      warp-cli --accept-tos registration license "$warp_license" 2>/dev/null || \
        warp-cli set-license "$warp_license" 2>/dev/null || true
    fi

    # ── Set mode + connect ───────────────────────────────────────────────
    warp-cli --accept-tos mode warp 2>/dev/null || warp-cli set-mode warp 2>/dev/null || true

    if ! warp-cli --accept-tos connect 2>/dev/null; then
      if ! warp-cli connect 2>/dev/null; then
        log_warn "Attempt ${attempt}: connect command failed"
        (( attempt++ ))
        sleep 5
        continue
      fi
    fi

    # ── Wait for connection (up to 60s) ──────────────────────────────────
    local timeout="${WARP_CONNECT_TIMEOUT:-60}"
    local waited=0
    while (( waited < timeout )); do
      local status=""
      status=$(warp-cli --accept-tos status 2>/dev/null || warp-cli status 2>/dev/null || echo "unknown")
      if echo "$status" | grep -qiE "connected" && ! echo "$status" | grep -qi "disconnected"; then
        connected=true
        log_ok "WARP connected! (after ${waited}s, attempt ${attempt})"
        break
      fi
      sleep 3
      (( waited += 3 ))
    done

    if [[ "$connected" == "true" ]]; then
      break
    fi

    log_warn "Attempt ${attempt}: did not connect within ${timeout}s"
    (( attempt++ ))
    sleep 5
  done

  if [[ "$connected" != "true" ]]; then
    log_error "WARP failed after ${max_attempts} attempts — recording will NOT proceed"
    set_env "WARP_CONNECTED" "false"
    set_output "warp_status" "failed"
    # v4 CHANGE: hard exit. The workflow treats non-zero as fatal.
    return 1
  fi

  # ── Verify IP changed (MANDATORY in v4) ────────────────────────────────
  sleep 3
  local new_ip
  new_ip=$(get_public_ip)
  log_info "New IP (Cloudflare WARP): ${new_ip}"
  set_env "WARP_IP" "$new_ip"

  if [[ "$original_ip" == "$new_ip" ]]; then
    log_error "IP did not change (${original_ip} → ${new_ip}) — WARP not routing"
    set_env "WARP_CONNECTED" "false"
    set_output "warp_status" "connected-same-ip"
    # v4 CHANGE: hard exit. Same-IP means YouTube will still block us.
    return 1
  fi

  log_ok "IP successfully changed: ${original_ip} → ${new_ip}"
  set_output "warp_status" "connected"

  log_separator
  log_info "WARP Connection Summary:"
  log_info " Original IP : ${original_ip} (GitHub)"
  log_info " Current IP : ${new_ip} (Cloudflare)"
  log_info " Status : Connected ✅"
  log_info " License : ${warp_license:+WARP+}${warp_license:-Free}"
  log_separator

  set_env "WARP_CONNECTED" "true"
  return 0
}

# Fallback only used when this script is called directly (not from workflow).
_warp_fallback() {
  log_warn "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log_warn "WARP setup failed — caller should treat this as fatal"
  log_warn "YouTube WILL block raw GitHub IPs for live-stream playback"
  log_warn "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  set_output "warp_status" "failed"
  set_env "WARP_CONNECTED" "false"
}

disconnect_warp() {
  if [[ "${WARP_CONNECTED:-false}" == "true" ]]; then
    warp-cli --accept-tos disconnect 2>/dev/null || warp-cli disconnect 2>/dev/null || true
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  if ! setup_warp; then
    _warp_fallback
    exit 1
  fi
fi
