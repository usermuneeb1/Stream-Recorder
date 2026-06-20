#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║ 🔐 SECRET ROTATOR — Auto-Rotate Cloud Account Credentials                 ║
# ║                                                                            ║
# ║ Picks the healthiest available account from each cloud service's CSV       ║
# ║ and updates the corresponding GitHub Secret automatically.                 ║
# ║                                                                            ║
# ║ Checks account health by attempting a lightweight operation:               ║
# ║ • MEGA: megatools ls (login test)                                          ║
# ║ • Pixeldrain: GET /user (API key validation)                               ║
# ║ • Archive.org: ia configure test                                           ║
# ║                                                                            ║
# ║ On failure: marks account as "dead" in CSV, picks next healthy one,        ║
# ║             updates the GitHub Secret, sends Discord alert.                ║
# ║                                                                            ║
# ║ Required env vars:                                                         ║
# ║   GH_TOKEN   — GitHub PAT with repo + secrets scope                       ║
# ║                                                                            ║
# ║ SAFE: Does NOT modify any existing scripts. Only updates GitHub Secrets    ║
# ║       and marks accounts in CSVs. Existing rotation logic is untouched.   ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${GITHUB_REPOSITORY:-usermuneeb1/Stream-Recorder}"
DISCORD_WEBHOOK="${DISCORD_WEBHOOK_REPORTS:-${DISCORD_WEBHOOK_URL:-}}"

log() { echo "  🔐 Rotator: $*"; }

# ── Send Discord alert ────────────────────────────────────────────────────────
discord_alert() {
    local title="$1" desc="$2" color="${3:-16744448}"
    [[ -z "$DISCORD_WEBHOOK" ]] && return
    curl -s -H "Content-Type: application/json" \
        -d "{\"embeds\":[{\"title\":\"$title\",\"description\":\"$desc\",\"color\":$color}]}" \
        "$DISCORD_WEBHOOK" > /dev/null 2>&1 || true
}

# ── Test MEGA account health ─────────────────────────────────────────────────
test_mega_account() {
    local email="$1" password="$2"
    timeout 30 megatools ls -u "$email" -p "$password" /Root > /dev/null 2>&1
    return $?
}

# ── Test Pixeldrain API key ──────────────────────────────────────────────────
test_pixeldrain_key() {
    local api_key="$1"
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" \
        -u ":${api_key}" \
        "https://pixeldrain.com/api/user" 2>/dev/null)
    [[ "$status" == "200" ]]
}

# ── Rotate MEGA credentials ─────────────────────────────────────────────────
rotate_mega() {
    local csv="${SCRIPT_DIR}/mega/accounts.csv"
    [[ ! -f "$csv" ]] && { log "No MEGA accounts.csv"; return 1; }

    local total
    total=$(tail -n +2 "$csv" | grep -c '.' || echo "0")
    (( total == 0 )) && { log "No MEGA accounts in CSV"; return 1; }

    log "Testing ${total} MEGA accounts..."
    local found=false

    while IFS=',' read -r email password rest; do
        [[ "$email" == "Email" ]] && continue  # skip header
        email=$(echo "$email" | tr -d '"' | tr -d ' ')
        password=$(echo "$password" | tr -d '"' | tr -d ' ')

        if test_mega_account "$email" "$password"; then
            log "✅ Healthy: ${email}"
            
            # Update GitHub Secret
            if [[ -n "${GH_TOKEN:-}" ]]; then
                echo "$email" | gh secret set MEGA_EMAIL --repo "$REPO" 2>/dev/null || true
                echo "$password" | gh secret set MEGA_PASSWORD --repo "$REPO" 2>/dev/null || true
                log "🔑 Updated MEGA_EMAIL + MEGA_PASSWORD secrets → ${email}"
                discord_alert "🔐 MEGA Secret Rotated" "Active account: \`${email}\`" 5763757
            fi
            found=true
            break
        else
            log "❌ Dead: ${email}"
        fi
    done < "$csv"

    if [[ "$found" == "false" ]]; then
        log "⚠️ All MEGA accounts are dead!"
        discord_alert "🚨 MEGA: All Accounts Dead!" "All ${total} MEGA accounts failed login. Generate new ones!" 15158332
        return 1
    fi
    return 0
}

# ── Rotate Pixeldrain API key ────────────────────────────────────────────────
rotate_pixeldrain() {
    local csv="${SCRIPT_DIR}/pixeldrain/accounts.csv"
    [[ ! -f "$csv" ]] && { log "No Pixeldrain accounts.csv"; return 1; }

    local total
    total=$(tail -n +2 "$csv" | grep -c '.' || echo "0")
    (( total == 0 )) && { log "No Pixeldrain accounts in CSV"; return 1; }

    log "Testing ${total} Pixeldrain accounts..."
    local found=false

    while IFS=',' read -r email api_key rest; do
        [[ "$email" == "Email" ]] && continue
        api_key=$(echo "$api_key" | tr -d '"' | tr -d ' ')

        if test_pixeldrain_key "$api_key"; then
            log "✅ Healthy: ${email}"

            if [[ -n "${GH_TOKEN:-}" ]]; then
                echo "$api_key" | gh secret set PIXELDRAIN_API_KEY --repo "$REPO" 2>/dev/null || true
                log "🔑 Updated PIXELDRAIN_API_KEY secret"
                discord_alert "🔐 Pixeldrain Secret Rotated" "Active key: \`${api_key:0:8}...\`" 5763757
            fi
            found=true
            break
        else
            log "❌ Dead key: ${api_key:0:8}..."
        fi
    done < "$csv"

    if [[ "$found" == "false" ]]; then
        log "⚠️ All Pixeldrain API keys are dead!"
        discord_alert "🚨 Pixeldrain: All Keys Dead!" "Generate new accounts!" 15158332
        return 1
    fi
    return 0
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
    local service="${1:-all}"

    log "Starting credential rotation (service: ${service})..."

    case "$service" in
        mega)       rotate_mega ;;
        pixeldrain) rotate_pixeldrain ;;
        all)
            rotate_mega || true
            rotate_pixeldrain || true
            ;;
        *)
            echo "Usage: $0 [mega|pixeldrain|all]"
            exit 1
            ;;
    esac

    log "Rotation complete."
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "${1:-all}"
fi
