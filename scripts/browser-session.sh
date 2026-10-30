#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  BROWSER SESSION, Google "Sign in to confirm you're not a bot" bypass        ║
# ║                                                                              ║
# ║  Wraps scripts/browser_session.py (SeleniumBase Pure CDP by default) so the  ║
# ║  recorder can read anonymous player URLs on the runner's own IP.             ║
# ║                                                                              ║
# ║  What it gives the recorder:                                                  ║
# ║    • stream.json                  → hlsManifestUrl / dashManifestUrl /       ║
# ║                                     per-format URLs for a pure-ffmpeg path   ║
# ║    • browser.env                  → UA + visitorData + capture facts         ║
# ║                                                                              ║
# ║  NO GOOGLE ACCOUNT OR EXPORTED JAR IS USED IN CDP MODE. Legacy UC mode is    ║
# ║  opt-in (BROWSER_MODE=uc) and is the only path that adopts a cookie jar.     ║
# ║                                                                              ║
# ║  Controls (all optional):                                                    ║
# ║    BROWSER_MODE=cdp|uc             (default cdp; no cookie export)           ║
# ║    BROWSER_ASSIST=auto|first|off   (CI/config default first)                 ║
# ║        first → Method K is tried before every other method                   ║
# ║        auto  → Method K sits after the cookieless yt-dlp/ytarchive paths     ║
# ║        off   → feature disabled, behaviour identical to pre-2026-10          ║
# ║    BROWSER_SESSION_DIR      where stream.json/browser.env land (default:     ║
# ║                             ${RECORD_DIR}/browser_session)                    ║
# ║    BROWSER_SESSION_TIMEOUT  hard cap for one browser launch (default 240s)   ║
# ║    BROWSER_SESSION_MAX_AGE  reuse window for a captured session (default 900)║
# ║    BROWSER_HEADED=true      run headed (needs Xvfb); default xvfb+headless   ║
# ║    BROWSER_PYTHON           python interpreter (default python3)             ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

# Intentionally NO `set -e`: this file is sourced by record-stream.sh (which is
# `set -uo pipefail`) and by detect-stream.sh. A helper must never abort the
# caller's recording because the optional browser step failed.

BROWSER_SESSION_SH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v log_info >/dev/null 2>&1; then
    # shellcheck disable=SC1091
    source "${BROWSER_SESSION_SH_DIR}/utils.sh"
fi

browser_assist_mode() {
    local mode="${BROWSER_ASSIST:-auto}"
    case "$mode" in
        auto|first|off) echo "$mode" ;;
        true|on|yes|1) echo "auto" ;;
        false|no|0) echo "off" ;;
        *) echo "auto" ;;
    esac
}

browser_mode() {
    local mode="${BROWSER_MODE:-cdp}"
    case "${mode,,}" in
        cdp|uc) echo "${mode,,}" ;;
        *) echo "cdp" ;;
    esac
}

browser_chrome_binary() {
    local candidate
    for candidate in "${BROWSER_BINARY:-}" google-chrome google-chrome-stable chromium chromium-browser chrome; do
        [[ -n "$candidate" ]] || continue
        if [[ -x "$candidate" ]]; then echo "$candidate"; return 0; fi
        command -v "$candidate" 2>/dev/null && return 0
    done
    return 1
}

browser_session_dir() {
    echo "${BROWSER_SESSION_DIR:-${RECORD_DIR:-/tmp/stream-recorder}/browser_session}"
}

# _browser_json_get <file> <field> → scalar value (jq if present, python3 else)
_browser_json_get() {
    local file="$1" field="$2"
    [[ -s "$file" ]] || return 0
    if command -v jq >/dev/null 2>&1; then
        jq -r ".${field} // \"\"" "$file" 2>/dev/null || true
        return 0
    fi
    "${BROWSER_PYTHON:-python3}" - "$file" "$field" <<'PY' 2>/dev/null || true
import json, sys
try:
    data = json.load(open(sys.argv[1]))
except Exception:
    sys.exit(0)
value = data.get(sys.argv[2], "")
if isinstance(value, bool):
    value = "true" if value else "false"
print(value)
PY
}

# browser_video_id_from_url <url> → 11-char id (empty when not a watch URL)
browser_video_id_from_url() {
    local url="${1:-}"
    if [[ "$url" =~ (v=|youtu\.be/|/live/|/shorts/)([A-Za-z0-9_-]{11}) ]]; then
        echo "${BASH_REMATCH[2]}"
        return 0
    fi
    return 0
}

# Returns 0 when the Python helper can actually launch a browser.
# Cheap: imports only, never starts Chrome.
browser_session_available() {
    [[ "$(browser_assist_mode)" == "off" ]] && return 1
    local py="${BROWSER_PYTHON:-python3}"
    command -v "$py" >/dev/null 2>&1 || return 1
    if [[ "$(browser_mode)" == "cdp" ]]; then
        "$py" -c "from seleniumbase import sb_cdp" >/dev/null 2>&1 || return 1
        browser_chrome_binary >/dev/null 2>&1 || [[ -n "${BROWSER_CDP_HOST:-}" && -n "${BROWSER_CDP_PORT:-}" ]] || return 1
    else
        "$py" -c "import seleniumbase" >/dev/null 2>&1 || return 1
    fi
    return 0
}

browser_session_why_unavailable() {
    local py="${BROWSER_PYTHON:-python3}"
    if ! command -v "$py" >/dev/null 2>&1; then
        echo "python3 not found"
    elif ! "$py" -c "import seleniumbase" >/dev/null 2>&1; then
        echo "seleniumbase not installed (bash scripts/setup-browser.sh)"
    elif [[ "$(browser_mode)" == "cdp" ]] && ! browser_chrome_binary >/dev/null 2>&1 \
        && ! [[ -n "${BROWSER_CDP_HOST:-}" && -n "${BROWSER_CDP_PORT:-}" ]]; then
        echo "Chrome/Chromium missing (or set BROWSER_CDP_HOST/BROWSER_CDP_PORT)"
    else
        echo "available"
    fi
}

# Export everything the Python helper recorded in browser.env.
_browser_session_load_env_file() {
    local env_file="$1" requested_mode
    [[ -s "$env_file" ]] || return 1
    requested_mode="$(browser_mode)"
    # Clear stale facts before loading a new capture. In particular, a CDP
    # capture must never inherit a jar pointer from an earlier UC capture.
    BROWSER_MODE="$(browser_mode)"
    BROWSER_SESSION_OK=0
    BROWSER_SESSION_BLOCKED=0
    BROWSER_COOKIES_FILE=""
    BROWSER_COOKIE_COUNT=0
    BROWSER_STREAM_JSON=""
    BROWSER_UA=""
    BROWSER_VISITOR_DATA=""
    BROWSER_IS_LIVE=0
    BROWSER_PLAYABILITY=""
    BROWSER_HLS_MANIFEST=""
    BROWSER_DASH_MANIFEST=""
    # shellcheck disable=SC1090
    source "$env_file"
    BROWSER_MODE="$requested_mode"
    export BROWSER_MODE BROWSER_SESSION_OK BROWSER_SESSION_BLOCKED \
           BROWSER_COOKIES_FILE BROWSER_COOKIE_COUNT BROWSER_STREAM_JSON \
           BROWSER_UA BROWSER_VISITOR_DATA BROWSER_IS_LIVE BROWSER_PLAYABILITY \
           BROWSER_HLS_MANIFEST BROWSER_DASH_MANIFEST 2>/dev/null || true
    return 0
}

# Adopt a captured session as the recorder's cookie source.
_browser_session_adopt() {
    local cookies="$1" stream="$2" expected_id="${3:-}"
    [[ -s "$stream" ]] || return 1
    local ok mode cached_id
    ok=$(_browser_json_get "$stream" "ok")
    mode=$(_browser_json_get "$stream" "mode")
    cached_id=$(_browser_json_get "$stream" "video_id")
    if [[ -n "$expected_id" && "$cached_id" != "$expected_id" ]]; then
        return 1
    fi

    if [[ "$(browser_mode)" == "cdp" ]]; then
        # CDP success means a playable anonymous player was captured, not a
        # jar. Never touch operator cookies or promote them to a valid status.
        [[ "$mode" == "cdp" && "$ok" == "true" ]] || return 1
    else
        [[ -s "$cookies" ]] || return 1
    fi

    BROWSER_STREAM_JSON="$stream"
    BROWSER_SESSION_OK=1
    export BROWSER_STREAM_JSON BROWSER_SESSION_OK
    set_env "BROWSER_STREAM_JSON" "$stream" 2>/dev/null || true
    set_env "BROWSER_MODE" "$(browser_mode)" 2>/dev/null || true

    if [[ "$(browser_mode)" == "cdp" ]]; then
        BROWSER_COOKIES_FILE=""
        BROWSER_COOKIE_COUNT=0
        export BROWSER_COOKIES_FILE BROWSER_COOKIE_COUNT
        set_env "BROWSER_COOKIES_FILE" "" 2>/dev/null || true
        set_env "BROWSER_COOKIE_COUNT" "0" 2>/dev/null || true
        return 0
    fi

    BROWSER_COOKIES_FILE="$cookies"
    export BROWSER_COOKIES_FILE
    COOKIES_FILE="$cookies"
    export COOKIES_FILE
    COOKIE_STATUS="valid_unverified"
    export COOKIE_STATUS
    set_env "COOKIES_FILE" "$cookies" 2>/dev/null || true
    set_env "BROWSER_COOKIES_FILE" "$cookies" 2>/dev/null || true
    set_env "COOKIE_STATUS" "valid_unverified" 2>/dev/null || true
    return 0
}

# A captured session is reusable while it is fresh AND for the same video.
_browser_session_is_fresh() {
    local dir="$1" target="${2:-}"
    local cookies="$dir/cookies.txt" stream="$dir/stream.json"
    [[ -s "$stream" ]] || return 1
    local max_age age mtime ok blocked cached_id mode
    max_age="${BROWSER_SESSION_MAX_AGE:-900}"
    mtime=$(stat -c %Y "$stream" 2>/dev/null || echo 0)
    age=$(( $(date +%s) - mtime ))
    (( age >= 0 && age < max_age )) || return 1
    ok=$(_browser_json_get "$stream" "ok")
    blocked=$(_browser_json_get "$stream" "blocked")
    cached_id=$(_browser_json_get "$stream" "video_id")
    mode=$(_browser_json_get "$stream" "mode")
    [[ "$ok" == "true" && "$blocked" != "true" && -n "$cached_id" ]] || return 1
    [[ -z "$target" || "$cached_id" == "$target" ]] || return 1
    if [[ "$(browser_mode)" == "cdp" ]]; then
        [[ "$mode" == "cdp" ]] || return 1
        local hls dash vurl aurl muxed
        hls=$(_browser_json_get "$stream" "hls_manifest_url")
        dash=$(_browser_json_get "$stream" "dash_manifest_url")
        vurl=$(_browser_json_get "$stream" "video_url")
        aurl=$(_browser_json_get "$stream" "audio_url")
        muxed=$(_browser_json_get "$stream" "muxed_url")
        [[ -n "$hls" || -n "$dash" || -n "$muxed" || ( -n "$vurl" && -n "$aurl" ) ]] || return 1
    else
        [[ -s "$cookies" ]] || return 1
    fi
    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
#  browser_mint_session [video-id-or-url]
#    Launches the real browser and captures the session.
#    Returns 0 on success (CDP: playable stream.json; UC: jar), 1 on failure.
#    NEVER fatal: callers treat failure as "try the next method".
# ─────────────────────────────────────────────────────────────────────────────
browser_mint_session() {
    local target="${1:-${STREAM_VIDEO_ID:-}}"

    if [[ "$(browser_assist_mode)" == "off" ]]; then
        log_info "  Browser session: disabled (BROWSER_ASSIST=off)"
        return 1
    fi
    if [[ -z "$target" ]]; then
        log_warn "  Browser session: no video id/url supplied"
        return 1
    fi

    local dir url adopt_id
    dir="$(browser_session_dir)"
    mkdir -p "$dir" 2>/dev/null || true
    adopt_id="$target"

    if [[ "$target" =~ ^https?:// ]]; then
        url="$target"
        # Normalise watch URLs so the freshness check can compare ids. A channel
        # /live URL keeps its URL as the freshness key (never reuse an old id for
        # a new channel probe), but adopts whatever id the player resolves to.
        if [[ "$target" =~ (v=|youtu\.be/|/live/)([A-Za-z0-9_-]{11}) ]]; then
            target="${BASH_REMATCH[2]}"
            adopt_id="$target"
        else
            adopt_id=""
        fi
    else
        url="https://www.youtube.com/watch?v=${target}"
    fi

    BROWSER_SESSION_OK=0
    BROWSER_COOKIES_FILE=""
    BROWSER_STREAM_JSON=""
    export BROWSER_SESSION_OK BROWSER_COOKIES_FILE BROWSER_STREAM_JSON

    local log_file="${RECORD_DIR:-/tmp/stream-recorder}/method_logs/browser_session.log"
    mkdir -p "$(dirname "$log_file")" 2>/dev/null || true

    # ── reuse a fresh capture (one launch serves detection + recording) ─────
    if _browser_session_is_fresh "$dir" "$target"; then
        if _browser_session_load_env_file "$dir/browser.env" 2>/dev/null; then
            :
        fi
        if _browser_session_adopt "$dir/cookies.txt" "$dir/stream.json" "$adopt_id"; then
            if [[ "$(browser_mode)" == "cdp" ]]; then
                log_ok "  Browser session: reusing fresh CDP player capture (0 cookie files)"
            else
                log_ok "  Browser session: reusing fresh UC capture ($(_browser_json_get "$dir/stream.json" cookie_count) cookies)"
            fi
            return 0
        fi
    fi

    # ── availability gate (install once, never block a recording) ───────────
    if ! command -v "${BROWSER_PYTHON:-python3}" >/dev/null 2>&1; then
        log_warn "  Browser session: python3 missing, skipping"
        return 1
    fi
    local import_probe="from seleniumbase import sb_cdp"
    [[ "$(browser_mode)" == "uc" ]] && import_probe="import seleniumbase"
    if ! "${BROWSER_PYTHON:-python3}" -c "$import_probe" >/dev/null 2>&1; then
        log_warn "  Browser session: seleniumbase not installed, skipping"
        log_info "  Install with: bash scripts/setup-browser.sh"
        return 1
    fi

    # ── launch ──────────────────────────────────────────────────────────────
    local timeout_s="${BROWSER_SESSION_TIMEOUT:-240}"
    local py="${BROWSER_PYTHON:-python3}"
    local helper="${BROWSER_SESSION_SH_DIR}/browser_session.py"
    local -a mode_args=(--mode "$(browser_mode)")
    [[ "${BROWSER_HEADED:-false}" == "true" ]] && mode_args+=(--headed)
    [[ -n "${BROWSER_BINARY:-}" ]] && mode_args+=(--binary "$BROWSER_BINARY")
    [[ -n "${BROWSER_CDP_HOST:-}" ]] && mode_args+=(--cdp-host "$BROWSER_CDP_HOST")
    [[ -n "${BROWSER_CDP_PORT:-}" ]] && mode_args+=(--cdp-port "$BROWSER_CDP_PORT")
    [[ "${BROWSER_ALLOW_LOCAL:-false}" == "true" ]] && mode_args+=(--allow-local)

    log_info "  Browser session: SeleniumBase $(browser_mode) (no account login)"
    log_info "  Browser session: target ${url}"

    local rc=0
    timeout --kill-after=10 "$timeout_s" "$py" "$helper" \
        --url "$url" \
        --outdir "$dir" \
        --max-wait "${BROWSER_MAX_WAIT:-60}" \
        --max-height "${BROWSER_MAX_HEIGHT:-1080}" \
        "${mode_args[@]}" >"$log_file" 2>&1 || rc=$?

    # Surface the tail either way; the full log stays in method_logs/.
    tail -12 "$log_file" 2>/dev/null | sed 's/^/    │ /' || true

    if [[ "$rc" == "124" ]]; then
        log_warn "  Browser session: timed out after ${timeout_s}s"
    elif [[ "$rc" == "3" ]]; then
        log_warn "  Browser session: seleniumbase unavailable"
    elif [[ "$rc" != "0" ]]; then
        log_warn "  Browser session: capture failed (rc=${rc})"
    fi

    if [[ "$(browser_mode)" == "cdp" ]]; then
        # A crashed/timed-out CDP process may leave an older stream.json/env behind.
        # Never load or adopt it: only this launch's successful capture counts.
        if [[ "$rc" == "0" ]] && _browser_session_load_env_file "$dir/browser.env" 2>/dev/null \
            && _browser_session_adopt "$dir/cookies.txt" "$dir/stream.json" "$adopt_id"; then
            log_ok "  Browser session: CDP player captured; 0 cookie files exported"
            return 0
        fi
        BROWSER_SESSION_OK=0
        BROWSER_COOKIES_FILE=""
        BROWSER_STREAM_JSON=""
        export BROWSER_SESSION_OK BROWSER_COOKIES_FILE BROWSER_STREAM_JSON
        log_warn "  Browser session: CDP capture failed; operator cookies left untouched"
        return 1
    fi

    _browser_session_load_env_file "$dir/browser.env" 2>/dev/null || true

    # Legacy UC mode only: a blocked page can still leave a jar worth trying.
    if [[ -s "$dir/cookies.txt" && -s "$dir/stream.json" ]]; then
        if _browser_session_adopt "$dir/cookies.txt" "$dir/stream.json" "$adopt_id"; then
            local blocked
            blocked=$(_browser_json_get "$dir/stream.json" "blocked")
            if [[ "$blocked" == "true" ]]; then
                BROWSER_SESSION_BLOCKED=1
                export BROWSER_SESSION_BLOCKED
                log_warn "  Browser session: UC bot wall still shown, jar kept and tried anyway"
            fi
            log_ok "  Browser session: minted fresh UC cookies"
            return 0
        fi
    fi
    return 1
}

# ─────────────────────────────────────────────────────────────────────────────
#  browser_session_jq <field>
#    Read one field out of the captured stream.json (empty when absent).
# ─────────────────────────────────────────────────────────────────────────────
browser_session_jq() {
    local field="$1"
    local stream="${BROWSER_STREAM_JSON:-$(browser_session_dir)/stream.json}"
    [[ -s "$stream" ]] || return 0
    _browser_json_get "$stream" "$field"
}

# ─────────────────────────────────────────────────────────────────────────────
#  browser_detect_live [channel_url]
#    Detection Method 5. Opens the channel's /live page in a real browser and
#    reads the player response, which is the one channel YouTube cannot lie to
#    (it either hands the player a manifest or it does not).
#    Sets DETECTED_* globals (defined in detect-stream.sh) on success.
# ─────────────────────────────────────────────────────────────────────────────
browser_detect_live() {
    local channel_url="${1:-}"
    if [[ -z "$channel_url" ]] && declare -F get_live_url >/dev/null 2>&1; then
        channel_url="$(get_live_url)"
    fi
    if [[ -z "$channel_url" ]]; then
        log_warn "  Method 5: no channel URL to probe"
        return 1
    fi

    log_info "  Method 5: real browser session on ${channel_url}"
    if ! browser_mint_session "$channel_url"; then
        log_info "  Method 5: no session / channel not broadcasting"
        return 1
    fi

    # A wall page can still carry a stale/embedded player blob; never trust
    # player facts from a capture that admits it was blocked.
    local blocked
    blocked=$(browser_session_jq blocked)
    if [[ "$blocked" == "true" ]]; then
        log_info "  Method 5: page still showed the bot wall, not trusting player data"
        return 1
    fi

    local is_live vid title author playability
    is_live=$(browser_session_jq is_live)
    vid=$(browser_session_jq video_id)
    title=$(browser_session_jq title)
    author=$(browser_session_jq author)
    playability=$(browser_session_jq playability)

    if [[ -z "$vid" ]]; then
        log_info "  Method 5: browser player exposed no video id (playability=${playability:-unknown})"
        return 1
    fi
    if [[ "$is_live" != "true" ]]; then
        log_info "  Method 5: video ${vid} is not live right now (playability=${playability:-unknown})"
        return 1
    fi

    DETECTED_VIDEO_ID="$vid"
    DETECTED_TITLE="${title:-Live Stream}"
    DETECTED_CHANNEL="${author:-${CHANNEL_DISPLAY_NAME:-The Muslim Lantern}}"
    DETECTED_THUMBNAIL="https://i.ytimg.com/vi/${vid}/maxresdefault_live.jpg"
    DETECTED_METHOD="Browser (SeleniumBase $(browser_mode))"
    DETECTED_URL="https://www.youtube.com/watch?v=${vid}"

    log_ok "Method 5: ✅ LIVE DETECTED via real browser, ${DETECTED_TITLE} by ${DETECTED_CHANNEL}"
    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
#  browser_session_selfcheck
#    Human-readable readiness report (used by setup-check / smoke test).
# ─────────────────────────────────────────────────────────────────────────────
browser_session_selfcheck() {
    echo "BROWSER_ASSIST            = $(browser_assist_mode)"
    echo "BROWSER_MODE              = $(browser_mode)"
    echo "BROWSER_SESSION_DIR       = $(browser_session_dir)"
    echo "python                    = ${BROWSER_PYTHON:-python3}"
    echo "seleniumbase python pkg   = $(browser_session_why_unavailable)"
    if command -v google-chrome >/dev/null 2>&1; then
        echo "chrome                    = $(google-chrome --version 2>/dev/null | head -1)"
    elif command -v chromium >/dev/null 2>&1; then
        echo "chromium                  = $(chromium --version 2>/dev/null | head -1)"
    else
        echo "chrome                    = MISSING"
    fi
    if command -v Xvfb >/dev/null 2>&1; then
        echo "Xvfb                      = $(command -v Xvfb)"
    else
        echo "Xvfb                      = MISSING (headed UC mode needs it)"
    fi
}
