#!/usr/bin/env bash
# Validates required GitHub secrets and writes a setup report to the job summary.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

check_secret() {
    local name="$1"
    local required="${2:-true}"
    local val="${!name:-}"
    if [[ -n "$val" ]]; then
        echo "✅ ${name}"
        return 0
    fi
    if [[ "$required" == "true" ]]; then
        echo "❌ ${name} (REQUIRED — missing)"
        return 1
    fi
    echo "⚪ ${name} (optional — not set)"
    return 0
}

run_setup_check() {
    log_header "🔧 SETUP CHECK — The Muslim Lantern Stream Recorder"
    local failed=0
    local report=""

    report+="| Secret | Status |\n|--------|--------|\n"

    local checks=(
        "YOUTUBE_CHANNEL_ID:true"
        "YOUTUBE_COOKIES:true"
        "DISCORD_WEBHOOK_URL:true"
        "ARCHIVE_ACCESS_KEY:true"
        "ARCHIVE_SECRET_KEY:true"
        "MEGA_EMAIL:true"
        "MEGA_PASSWORD:true"
        "GH_PAT:true"
        "DISCORD_WEBHOOK_ALERTS:false"
        "DISCORD_WEBHOOK_RECORDINGS:false"
        "DISCORD_WEBHOOK_LINKS:false"
        "DISCORD_WEBHOOK_REFRESH:false"
        "DISCORD_WEBHOOK_REPORTS:false"
        "PIXELDRAIN_API_KEY:false"
        "WARP_LICENSE_KEY:false"
        "AVATAR_URL:false"
    )

    for item in "${checks[@]}"; do
        local name req
        name="${item%%:*}"
        req="${item##*:}"
        local line
        line=$(check_secret "$name" "$req") || failed=1
        report+="| \`${name}\` | ${line#* } |\n"
        log_info "$line"
    done

    log_separator
    log_info "Channel: ${YOUTUBE_CHANNEL_ID:-${DEFAULT_CHANNEL_HANDLE:-not set}}"
    log_info "Display name: ${CHANNEL_DISPLAY_NAME:-The Muslim Lantern}"

    if [[ -f "${COOKIES_FILE:-cookies.txt}" ]] || [[ -n "${YOUTUBE_COOKIES:-}" ]]; then
        log_ok "YouTube cookies present in this run"
    else
        log_warn "No cookies in runner env (expected if only checking secrets)"
    fi

    {
        echo "## 🔧 Stream Recorder Setup Check"
        echo ""
        echo "**Channel:** \`${YOUTUBE_CHANNEL_ID:-${DEFAULT_CHANNEL_HANDLE:-@TheMuslimLantern}}\`"
        echo ""
        printf '%b' "$report"
        echo ""
        if (( failed > 0 )); then
            echo "### ❌ Action required"
            echo "Add missing secrets under **Settings → Secrets and variables → Actions**."
            echo "See [SETUP.md](SETUP.md) for step-by-step instructions."
        else
            echo "### ✅ All required secrets are set"
            echo "Run **☪️ Stream Recorder** manually with \`wait_for_live\` or wait for Thu–Mon schedule."
        fi
    } >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"

    if (( failed > 0 )); then
        log_error "Setup check failed — ${failed} required secret(s) missing"
        return 1
    fi
    log_ok "Setup check passed"
    return 0
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    run_setup_check
fi
