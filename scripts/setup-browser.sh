#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  SETUP BROWSER, install/verify the SeleniumBase UC bypass stack              ║
# ║                                                                              ║
# ║  Installs what Method K (real-browser recording) needs:                      ║
# ║    • Xvfb + scrot          headed Chrome on a headless runner               ║
# ║    • seleniumbase          undetected-chromedriver (the actual bypass)       ║
# ║    • pyautogui             GUI-level click for CAPTCHA-style interstitials   ║
# ║    • uc_driver             SeleniumBase's patched chromedriver               ║
# ║                                                                              ║
# ║  Everything is best-effort EXCEPT the final verdict: exit 1 means Method K   ║
# ║  cannot run, and the recorder simply skips it (it never aborts a recording). ║
# ║                                                                              ║
# ║  Usage:                                                                      ║
# ║    bash scripts/setup-browser.sh              # install + verify             ║
# ║    bash scripts/setup-browser.sh --check-only # verify only, no installs     ║
# ║    bash scripts/setup-browser.sh --verify-launch   # + real Chrome smoke run ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/utils.sh"

CHECK_ONLY=false
VERIFY_LAUNCH=false
for arg in "$@"; do
    case "$arg" in
        --check-only) CHECK_ONLY=true ;;
        --verify-launch) VERIFY_LAUNCH=true ;;
        *) log_warn "Unknown argument: $arg" ;;
    esac
done

chrome_bin() {
    if command -v google-chrome >/dev/null 2>&1; then
        command -v google-chrome
    elif command -v google-chrome-stable >/dev/null 2>&1; then
        command -v google-chrome-stable
    elif command -v chromium >/dev/null 2>&1; then
        command -v chromium
    elif command -v chromium-browser >/dev/null 2>&1; then
        command -v chromium-browser
    else
        echo ""
    fi
}

seleniumbase_ok() {
    python3 -c "import seleniumbase" >/dev/null 2>&1
}

setup_browser() {
    log_header "BROWSER BYPASS STACK (SeleniumBase UC)"

    if [[ "$CHECK_ONLY" != "true" ]]; then
        # ── 1. Xvfb + scrot (headed Chrome without a monitor) ──────────────
        if ! command -v Xvfb >/dev/null 2>&1 || ! command -v scrot >/dev/null 2>&1; then
            log_info "Installing Xvfb + scrot (best effort)…"
            sudo apt-get install -y -qq xvfb scrot fonts-liberation \
                >/dev/null 2>&1 || log_warn "Xvfb/scrot install failed (headless fallback still works)"
        else
            log_ok "Xvfb + scrot already present"
        fi

        # ── 2. seleniumbase (undetected-chromedriver) ──────────────────────
        if ! seleniumbase_ok; then
            log_info "Installing seleniumbase…"
            pip3 install --quiet --upgrade seleniumbase \
                || pip3 install --quiet --user --upgrade seleniumbase \
                || log_warn "seleniumbase install failed"
        fi

        # ── 3. pyautogui (GUI clicks; optional) ────────────────────────────
        if ! python3 -c "import pyautogui" >/dev/null 2>&1; then
            log_info "Installing pyautogui (optional GUI clicks)…"
            pip3 install --quiet pyautogui >/dev/null 2>&1 || log_warn "pyautogui install failed (optional)"
        fi

        # ── 4. uc_driver ───────────────────────────────────────────────────
        if command -v sbase >/dev/null 2>&1; then
            log_info "Fetching SeleniumBase uc_driver…"
            timeout 180 sbase get uc_driver >/dev/null 2>&1 || log_warn "sbase get uc_driver failed (auto-download will retry at runtime)"
        fi
    fi

    # ── 5. Verdict ─────────────────────────────────────────────────────────
    local chrome
    chrome="$(chrome_bin)"
    local failed=0

    if [[ -n "$chrome" ]]; then
        log_ok "Chrome: $("$chrome" --version 2>/dev/null | head -1)"
    else
        log_error "No Chrome/Chromium binary found, Method K cannot run"
        failed=1
    fi

    if seleniumbase_ok; then
        log_ok "seleniumbase: $(python3 -c 'import seleniumbase; print(seleniumbase.__version__)' 2>/dev/null)"
    else
        log_error "seleniumbase not importable, Method K cannot run"
        failed=1
    fi

    if python3 -c "import pyautogui" >/dev/null 2>&1; then
        log_ok "pyautogui: present (GUI CAPTCHA clicks enabled)"
    else
        log_warn "pyautogui: missing (UC mode still works; GUI click fallback disabled)"
    fi

    if (( failed > 0 )); then
        log_warn "Browser bypass unavailable, recorder falls back to yt-dlp/streamlink/ytarchive only"
        return 1
    fi

    # ── 6. Optional: prove a browser really launches ───────────────────────
    if [[ "$VERIFY_LAUNCH" == "true" ]]; then
        log_step "Launch verification (example.com in UC mode)"
        if timeout 180 python3 - <<'PY' >/tmp/browser_verify.log 2>&1
from seleniumbase import SB
with SB(uc=True, headless=True, xvfb=True) as sb:
    sb.open("https://example.com")
    print("TITLE:", sb.get_title())
PY
        then
            log_ok "Chrome launched through SeleniumBase UC ($(grep -m1 TITLE /tmp/browser_verify.log | cut -d: -f2- | xargs))"
        else
            log_warn "Launch verification failed, see /tmp/browser_verify.log"
            tail -8 /tmp/browser_verify.log 2>/dev/null | sed 's/^/    │ /' || true
            return 1
        fi
    fi

    log_ok "Browser bypass stack ready (Method K enabled)"
    return 0
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    setup_browser
fi
