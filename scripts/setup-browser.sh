#!/usr/bin/env bash
# Install/verify the SeleniumBase browser stack.
# Default: Pure CDP Mode (no chromedriver, no cookie export, no account profile).
# BROWSER_MODE=uc is the explicit legacy fallback and installs uc_driver.
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
MODE="${BROWSER_MODE:-cdp}"
[[ "$MODE" == "uc" ]] || MODE="cdp"
PY="${BROWSER_PYTHON:-python3}"

chrome_bin() {
    local candidate
    for candidate in "${BROWSER_BINARY:-}" google-chrome google-chrome-stable chromium chromium-browser chrome; do
        [[ -n "$candidate" ]] || continue
        if [[ -x "$candidate" ]]; then echo "$candidate"; return 0; fi
        command -v "$candidate" 2>/dev/null && return 0
    done
    return 1
}

seleniumbase_ok() {
    if [[ "$MODE" == "cdp" ]]; then
        "$PY" -c "from seleniumbase import sb_cdp" >/dev/null 2>&1
    else
        "$PY" -c "import seleniumbase" >/dev/null 2>&1
    fi
}

setup_browser() {
    log_header "BROWSER STACK (SeleniumBase ${MODE})"
    if [[ "$CHECK_ONLY" != "true" ]]; then
        if ! command -v "$PY" >/dev/null 2>&1; then
            log_error "Python interpreter not found: $PY"
            return 1
        fi
        if ! seleniumbase_ok; then
            log_info "Installing seleniumbase into $PY…"
            "$PY" -m pip install --quiet --upgrade seleniumbase \
                || "$PY" -m pip install --quiet --user --upgrade seleniumbase \
                || log_warn "seleniumbase install failed"
        fi
        if ! chrome_bin >/dev/null 2>&1; then
            log_info "Installing Chromium + Xvfb (best effort)…"
            if command -v sudo >/dev/null 2>&1; then
                sudo apt-get update -qq && sudo apt-get install -y -qq chromium xvfb fonts-liberation \
                    || log_warn "Chromium install failed; install Chrome or set BROWSER_BINARY"
            fi
        fi
        if [[ "$MODE" == "uc" ]]; then
            if command -v sbase >/dev/null 2>&1; then
                timeout 180 sbase get uc_driver >/dev/null 2>&1 \
                    || log_warn "uc_driver fetch failed (legacy UC may retry at runtime)"
            fi
        else
            log_info "CDP needs no uc_driver and no pyautogui"
        fi
    fi

    local failed=0 chrome
    chrome="$(chrome_bin || true)"
    if [[ -n "$chrome" ]]; then
        log_ok "Chrome: $("$chrome" --version 2>/dev/null | head -1)"
    elif [[ -n "${BROWSER_CDP_HOST:-}" && -n "${BROWSER_CDP_PORT:-}" ]]; then
        log_ok "Dedicated CDP endpoint configured: ${BROWSER_CDP_HOST}:${BROWSER_CDP_PORT}"
    else
        log_error "No Chrome/Chromium binary found"
        failed=1
    fi
    if seleniumbase_ok; then
        log_ok "seleniumbase: $("$PY" -c 'import seleniumbase; print(seleniumbase.__version__)' 2>/dev/null)"
    else
        log_error "seleniumbase not importable by $PY"
        failed=1
    fi
    (( failed == 0 )) || return 1

    if [[ "$VERIFY_LAUNCH" == "true" ]]; then
        log_step "Launch verification (local data URL; no YouTube, no cookies)"
        if timeout 120 "$PY" - <<'PY' >/tmp/browser_verify.log 2>&1
import os
from seleniumbase import sb_cdp
kwargs = dict(headless=True, guest=True, ad_block=False)
if os.environ.get("BROWSER_BINARY"):
    kwargs["binary_location"] = os.environ["BROWSER_BINARY"]
if os.environ.get("BROWSER_CDP_HOST") and os.environ.get("BROWSER_CDP_PORT"):
    kwargs.update(host=os.environ["BROWSER_CDP_HOST"], port=int(os.environ["BROWSER_CDP_PORT"]))
    kwargs["browser_executable_path"] = os.environ.get("BROWSER_BINARY") or "google-chrome"
sb = sb_cdp.Chrome(**kwargs)
try:
    sb.goto("data:text/html,<title>CDP ready</title><h1>ok</h1>")
    assert sb.get_title() == "CDP ready"
    assert sb.evaluate("document.querySelector('h1').textContent") == "ok"
    print("TITLE: CDP ready")
finally:
    sb.quit()
PY
        then
            log_ok "Chrome launched through SeleniumBase CDP"
        else
            log_warn "Launch verification failed, see /tmp/browser_verify.log"
            tail -12 /tmp/browser_verify.log 2>/dev/null | sed 's/^/    │ /' || true
            return 1
        fi
    fi
    log_ok "Browser stack ready (mode=${MODE}; CDP exports no cookie files)"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    setup_browser
fi
