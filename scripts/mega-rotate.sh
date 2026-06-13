#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  🔴 MEGA Account Rotation — Smart Credential Selection                     ║
# ║  Picks the best MEGA account from accounts.csv for uploading.              ║
# ║  Strategy: round-robin across accounts to distribute storage usage.        ║
# ║                                                                            ║
# ║  Integration:                                                              ║
# ║    • Called by upload-clouds.sh before MEGA upload                         ║
# ║    • Sets MEGA_EMAIL and MEGA_PASSWORD environment variables               ║
# ║    • Falls back to GitHub Secrets if no accounts.csv exists                ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# CSV file with generated accounts
MEGA_CSV="${SCRIPT_DIR}/mega/accounts.csv"


select_mega_account() {
    # Priority 1: Use accounts from CSV (generated accounts)
    if [[ -f "$MEGA_CSV" ]]; then
        # Count accounts (skip header)
        local total_accounts
        total_accounts=$(tail -n +2 "$MEGA_CSV" 2>/dev/null | grep -c '.' || echo "0")

        if (( total_accounts > 0 )); then
            # ── Stateless rotation ────────────────────────────────────────────
            # The previous version persisted .last_account_index to the runner's
            # disk, which is wiped on every fresh runner → it always reused
            # account #0. Instead we derive the index deterministically from the
            # current epoch-day, so accounts rotate over time WITHOUT needing to
            # persist state across ephemeral runners. An explicit MEGA_ROTATE_INDEX
            # env var (if set) overrides for manual control.
            local next_index
            if [[ -n "${MEGA_ROTATE_INDEX:-}" ]]; then
                next_index=$(( MEGA_ROTATE_INDEX % total_accounts ))
            else
                local epoch_day=$(( $(date -u +%s) / 86400 ))
                next_index=$(( epoch_day % total_accounts ))
            fi

            # Line number in CSV (index + 2 to skip header, +1 for 1-based)
            local line_num=$(( next_index + 2 ))

            # Read the account (CSV format: Email,MEGA Password,Usage,Mail.tm Password,Mail.tm ID,Purpose)
            local account_line
            account_line=$(sed -n "${line_num}p" "$MEGA_CSV")

            if [[ -n "$account_line" ]]; then
                local email password
                email=$(echo "$account_line" | cut -d',' -f1 | tr -d '"' | tr -d ' ')
                password=$(echo "$account_line" | cut -d',' -f2 | tr -d '"' | tr -d ' ')

                if [[ -n "$email" ]] && [[ -n "$password" ]]; then
                    # Export for upload-clouds.sh (stateless rotation — nothing
                    # to persist).
                    export MEGA_EMAIL="$email"
                    export MEGA_PASSWORD="$password"

                    echo "MEGA_EMAIL=${email}" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true
                    echo "MEGA_PASSWORD=${password}" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true

                    echo "🔴 MEGA: Using account ${next_index}/${total_accounts}: ${email}"
                    return 0
                fi
            fi

            echo "⚠️ MEGA: Failed to parse account at index ${next_index}"
        else
            echo "⚠️ MEGA: accounts.csv exists but has no accounts"
        fi
    fi

    # Priority 2: Fall back to GitHub Secrets (manual MEGA_EMAIL / MEGA_PASSWORD)
    if [[ -n "${MEGA_EMAIL:-}" ]] && [[ -n "${MEGA_PASSWORD:-}" ]]; then
        echo "🔴 MEGA: Using credentials from GitHub Secrets (MEGA_EMAIL)"
        return 0
    fi

    # No credentials available
    echo "⚠️ MEGA: No credentials available (no accounts.csv, no MEGA_EMAIL secret)"
    return 1
}

# If sourced, make the function available; if executed directly, run it
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    select_mega_account
fi
