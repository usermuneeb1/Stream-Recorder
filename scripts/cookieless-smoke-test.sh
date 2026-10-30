#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  COOKIELESS SMOKE TEST — does every no-cookie recording path still work?     ║
# ║                                                                              ║
# ║  Pulls a 10-second slice of a PUBLIC video with each cookieless method the    ║
# ║  recorder uses, and checks that real pixels come back (height > 0, bytes >   ║
# ║  MIN_BYTES). No cookies are used or required. It fails loudly when fewer     ║
# ║  than MIN_PASS methods work, i.e. when the recorder would be at risk —       ║
# ║  usually hours before the next stream goes live.                             ║
# ║                                                                              ║
# ║  Method matrix is ALIGNED with scripts/record-stream.sh (cookieless only):   ║
# ║    D android_vr · C mediaconnect · G plain yt-dlp · E mweb · J ffmpeg HLS    ║
# ║    H ytarchive (live-only, SKIPped on a VOD) · I streamlink hardened ·       ║
# ║    F streamlink · K real-browser session (SeleniumBase UC, Method K)         ║
# ║  A+B are deliberately absent: they need a cookie jar, so they are not        ║
# ║  "cookieless" and can never be the reason a public stream is missed.         ║
# ║  tests/cookieless-smoke-test.sh locks this table against record-stream.sh.   ║
# ║                                                                              ║
# ║  Usage:                                                                      ║
# ║    bash scripts/cookieless-smoke-test.sh --video-id dQw4w9WgXcQ              ║
# ║    bash scripts/cookieless-smoke-test.sh --url https://youtu.be/… --json o.json
# ║    bash scripts/cookieless-smoke-test.sh --dry-run        # print commands   ║
# ║    bash scripts/cookieless-smoke-test.sh --list           # method table     ║
# ║                                                                              ║
# ║  Env: MIN_PASS (default 2) · SMOKE_TIMEOUT (90s/method) · MIN_BYTES (100000)  ║
# ║       BROWSER_ASSIST=off skips Method K · SMOKE_OUT (/tmp/smoke)             ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/utils.sh"
# browser_assist_mode() lives here (BROWSER_ASSIST=auto|first|off). Sourced
# defensively: the smoke test must still run if the helper is missing.
if [[ -f "$SCRIPT_DIR/browser-session.sh" ]]; then
    # shellcheck source=/dev/null
    source "$SCRIPT_DIR/browser-session.sh"
fi

METHOD_ORDER=(K D C G E J H I F)
declare -A METHOD_LABEL=(
    [D]="Android VR (cookieless 1080p, primary)"
    [C]="mediaconnect player (no cookies)"
    [G]="Plain yt-dlp (default auto-select)"
    [E]="Mobile web player (mweb)"
    [J]="ffmpeg HLS direct (independent path)"
    [H]="ytarchive (purpose-built for live)"
    [I]="streamlink hardened retry"
    [F]="streamlink default"
    [K]="Real-browser recording (SeleniumBase CDP)"
)

VIDEO_ID="${SMOKE_VIDEO_ID:-}"
VIDEO_URL="${SMOKE_VIDEO_URL:-}"
OUT_DIR="${SMOKE_OUT:-/tmp/smoke}"
TIMEOUT_PER_METHOD="${SMOKE_TIMEOUT:-90}"
MIN_PASS="${MIN_PASS:-2}"
MIN_BYTES="${MIN_BYTES:-100000}"
REQUIRE_K="${SMOKE_REQUIRE_K:-true}"
ONLY=""
JSON_PATH=""
DRY_RUN=false
LIST_ONLY=false
MOBILE_UA="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"

usage() { sed -n '3,30p' "$0" | sed 's/^# \{0,1\}//'; }

while (( $# )); do
    case "$1" in
        -v|--video-id)  VIDEO_ID="${2:-}"; shift 2 ;;
        -u|--url)       VIDEO_URL="${2:-}"; shift 2 ;;
        -o|--out)       OUT_DIR="${2:-}"; shift 2 ;;
        -t|--timeout)   TIMEOUT_PER_METHOD="${2:-90}"; shift 2 ;;
        -m|--min-pass)  MIN_PASS="${2:-2}"; shift 2 ;;
        --only)         ONLY="${2:-}"; shift 2 ;;
        --json)         JSON_PATH="${2:-}"; shift 2 ;;
        --dry-run)      DRY_RUN=true; shift ;;
        --list)         LIST_ONLY=true; shift ;;
        -h|--help)      usage; exit 0 ;;
        *) echo "unknown argument: $1" >&2; usage; exit 2 ;;
    esac
done

if $LIST_ONLY; then
    for m in "${METHOD_ORDER[@]}"; do printf '%s\t%s\n' "$m" "${METHOD_LABEL[$m]}"; done
    exit 0
fi

# ── resolve the target ──────────────────────────────────────────────────────
if [[ -z "$VIDEO_URL" && -n "$VIDEO_ID" ]]; then
    VIDEO_URL="https://www.youtube.com/watch?v=${VIDEO_ID}"
fi
if [[ -z "$VIDEO_URL" ]]; then
    log_error "no target: pass --video-id <id> or --url <youtube url>"
    exit 2
fi
if [[ "$VIDEO_URL" =~ (v=|/)([A-Za-z0-9_-]{11}) ]]; then
    VIDEO_ID="${VIDEO_ID:-${BASH_REMATCH[2]}}"
fi

mkdir -p "$OUT_DIR" || { log_error "cannot create $OUT_DIR"; exit 2; }

PASSED=(); FAILED=(); SKIPPED=()
declare -A NOTE=()

# A method passes only when REAL pixels came back — a 200/“downloaded” that
# yields an empty or audio-only file is a failure, not a pass.
verify_media() {
    local f="$1"
    [[ -s "$f" ]] || return 1
    local size height
    size=$(stat -c%s "$f" 2>/dev/null || echo 0)
    (( size > MIN_BYTES )) || return 1
    height=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$f" 2>/dev/null | head -1)
    [[ "$height" =~ ^[0-9]+$ ]] || return 1
    (( height > 0 )) || return 1
    NOTE[height]="${height}"
    NOTE[size]="$size"
    return 0
}

record_result() {   # $1=method $2=PASS|FAIL|SKIP $3=note
    NOTE[$1]="$3"
    case "$2" in
        PASS) PASSED+=("$1") ;;
        FAIL) FAILED+=("$1") ;;
        SKIP) SKIPPED+=("$1") ;;
    esac
}

# The yt-dlp slice every method shares. Recorder parity matters more than
# pretty output: same player client, same format selector, 10s only.
ytdlp_args() {
    printf '%s\n' \
        --no-warnings \
        --no-check-certificates \
        --download-sections "*0-10" \
        --force-keyframes-at-cuts \
        -f "bestvideo[height<=1080]+bestaudio/best" \
        --merge-output-format mp4
}

run_ytdlp() {   # $1=method  $2=extra-args-array-name
    local m="$1" var="$2"
    local -a extra=()
    [[ -n "$var" ]] && eval "extra=(\"\${${var}[@]}\")"
    local out="${OUT_DIR}/$(echo "$m" | tr 'A-Z' 'a-z')"
    local -a args
    mapfile -t args < <(ytdlp_args)
    local cmd=(yt-dlp "${args[@]}" "${extra[@]}" -o "${out}.%(ext)s" "$VIDEO_URL")

    if $DRY_RUN; then
        printf '[dry-run] %s\n' "${cmd[*]}"
        record_result "$m" SKIP "dry-run"
        return 0
    fi
    if ! command -v yt-dlp >/dev/null 2>&1; then
        record_result "$m" SKIP "yt-dlp not installed"
        return 0
    fi
    if timeout "$TIMEOUT_PER_METHOD" "${cmd[@]}" >"${out}.log" 2>&1 \
        && verify_media "${out}.mp4"; then
        record_result "$m" PASS "1080p-ish slice ok (${NOTE[size]:-0} bytes)"
        log_ok "  Method ${m}: PASS (${NOTE[height]:-?}p, ${NOTE[size]:-0} bytes)"
    else
        tail -3 "${out}.log" 2>/dev/null | sed 's/^/       /'
        record_result "$m" FAIL "no usable media"
        log_warn "  Method ${m}: FAIL"
    fi
}

# streamlink (F/I): resolve the stream, then prove the URL yields bytes with a
# Range request. Downloading a whole VOD is unacceptable in a smoke test.
run_streamlink() {   # $1=method  $2=hardened|default
    local m="$1" flavour="$2"
    local out="${OUT_DIR}/$(echo "$m" | tr 'A-Z' 'a-z')"
    local -a hardened=(
        --hls-segment-threads 4 --hls-playlist-reload-attempts 10
        --hls-playlist-reload-time 2 --hls-segment-attempts 10
        --hls-segment-timeout 30 --retry-streams 5 --retry-max 10
        --retry-open 3 --stream-timeout 60 --ffmpeg-fout mp4 --ffmpeg-copyts
    )
    local -a flags=()
    [[ "$flavour" == "hardened" ]] && flags=("${hardened[@]}")
    local cmd=(streamlink --json "${flags[@]}" "$VIDEO_URL" best)

    if $DRY_RUN; then
        printf '[dry-run] %s\n' "${cmd[*]}"
        record_result "$m" SKIP "dry-run"
        return 0
    fi
    if ! command -v streamlink >/dev/null 2>&1; then
        record_result "$m" SKIP "streamlink not installed"
        return 0
    fi
    if ! timeout "$TIMEOUT_PER_METHOD" "${cmd[@]}" > "${out}.json" 2>"${out}.log"; then
        tail -3 "${out}.log" | sed 's/^/       /'
        record_result "$m" FAIL "streamlink could not resolve"
        log_warn "  Method ${m}: FAIL"
        return 0
    fi
    local url
    url=$(jq -r '.url // empty' "${out}.json" 2>/dev/null)
    if [[ -z "$url" ]]; then
        record_result "$m" FAIL "no stream URL in streamlink JSON"
        return 0
    fi
    if curl -sS --max-time 30 -r 0-2047 -o "${out}.probe" "$url" 2>/dev/null \
        && [[ "$(stat -c%s "${out}.probe" 2>/dev/null || echo 0)" -gt 1000 ]]; then
        record_result "$m" PASS "URL resolves and serves bytes"
        log_ok "  Method ${m}: PASS (${NOTE[size]:-0} bytes)"
    else
        record_result "$m" FAIL "resolved URL serves no bytes"
        log_warn "  Method ${m}: FAIL"
    fi
}

run_method_d() { local a=(--extractor-args "youtube:player_client=android_vr"); run_ytdlp D a; }
run_method_c() { local a=(--extractor-args "youtube:player_client=mediaconnect"); run_ytdlp C a; }
run_method_g() { run_ytdlp G ""; }
run_method_e() { local a=(--extractor-args "youtube:player_client=mweb" --user-agent "$MOBILE_UA"); run_ytdlp E a; }

# Method J: yt-dlp only RESOLVES the manifest, ffmpeg pulls the 10s slice — an
# independent code path from yt-dlp's internal downloader.
run_method_j() {
    local out="${OUT_DIR}/j"
    local resolve=(yt-dlp --no-download --no-playlist --no-warnings --quiet -f best -g "$VIDEO_URL")
    if $DRY_RUN; then
        printf '[dry-run] %s\n' "${resolve[*]}"
        printf '[dry-run] ffmpeg -t 10 -i <manifest> -c copy %s.mp4\n' "$out"
        record_result J SKIP "dry-run"
        return 0
    fi
    command -v ffmpeg >/dev/null 2>&1 || { record_result J SKIP "ffmpeg not installed"; return 0; }
    command -v yt-dlp >/dev/null 2>&1 || { record_result J SKIP "yt-dlp not installed"; return 0; }

    local raw
    raw=$(timeout 60 "${resolve[@]}" 2>"${out}.log") || {
        tail -3 "${out}.log" | sed 's/^/       /'
        record_result J FAIL "could not resolve manifest"
        log_warn "  Method J: FAIL"
        return 0
    }
    local -a urls=()
    mapfile -t urls <<< "$raw"
    local -a maps=()
    (( ${#urls[@]} > 1 )) && maps=(-map 0:v:0 -map 1:a:0)
    local -a inputs=()
    local u
    for u in "${urls[@]}"; do [[ -n "$u" ]] && inputs+=(-i "$u"); done
    (( ${#inputs[@]} )) || { record_result J FAIL "empty manifest"; return 0; }

    if timeout "$TIMEOUT_PER_METHOD" ffmpeg -y -loglevel error "${inputs[@]}" \
            ${maps[@]+"${maps[@]}"} -t 10 -c copy -movflags +faststart "${out}.mp4" 2>"${out}.fflog" \
        && verify_media "${out}.mp4"; then
        record_result J PASS "ffmpeg pulled a slice (${NOTE[size]:-0} bytes)"
        log_ok "  Method J: PASS (${NOTE[height]:-?}p)"
    else
        tail -3 "${out}.fflog" | sed 's/^/       /'
        record_result J FAIL "ffmpeg could not pull a slice"
        log_warn "  Method J: FAIL"
    fi
}

# Method H is ytarchive, which only records LIVE streams. On a finished VOD it
# cannot be exercised end-to-end; report presence instead of pretending.
run_method_h() {
    if $DRY_RUN; then
        printf '[dry-run] ytarchive --version   # live-only, not run on a VOD\n'
        record_result H SKIP "dry-run"
        return 0
    fi
    if command -v ytarchive >/dev/null 2>&1; then
        record_result H SKIP "installed; live-only (verified during a real stream)"
    else
        record_result H SKIP "not installed (recorder skips it too)"
    fi
}

# Method K exercises the REAL recorder function, not just "did Chrome open?".
# A pass requires a bounded ffmpeg recording with both video and audio pixels.
run_method_k() {
    local out="${OUT_DIR}/k"
    local py="${BROWSER_PYTHON:-python3}"
    local helper="$SCRIPT_DIR/browser_session.py"
    if $DRY_RUN; then
        printf '[dry-run] %s %s --mode %s --url %s --outdir %s\n' "$py" "$helper" "$(browser_mode 2>/dev/null || echo cdp)" "$VIDEO_URL" "$out"
        printf '[dry-run] record_method_k -> ffmpeg -t 10 -> ffprobe %s.mp4\n' "$out"
        record_result K SKIP "dry-run"
        return 0
    fi
    if [[ "$(browser_assist_mode 2>/dev/null || echo auto)" == "off" ]]; then
        record_result K SKIP "BROWSER_ASSIST=off"
        return 0
    fi
    if [[ "$(browser_mode 2>/dev/null || echo cdp)" != "cdp" ]]; then
        record_result K FAIL "cookieless smoke requires BROWSER_MODE=cdp"
        return 0
    fi
    if [[ -z "$VIDEO_URL" ]]; then
        record_result K SKIP "no target URL"
        return 0
    fi
    if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
        record_result K FAIL "ffmpeg/ffprobe missing"
        return 0
    fi

    # Isolate recorder logs from any live recording on the same runner.
    export RECORD_DIR="${OUT_DIR}/recorder"
    export SEGMENTS_DIR="${RECORD_DIR}/segments"
    export BROWSER_SESSION_DIR="$out"
    export BROWSER_ASSIST=first BROWSER_MODE=cdp PUBLIC_STREAM_ONLY=true
    export CUSTOM_DURATION_MODE=true RECORD_CAPTURE_SECONDS=10
    export MAX_RECORD_DURATION="$TIMEOUT_PER_METHOD"
    export BROWSER_SESSION_TIMEOUT=$(( TIMEOUT_PER_METHOD * 2 ))
    export BROWSER_MAX_WAIT="${BROWSER_MAX_WAIT:-45}"
    mkdir -p "$SEGMENTS_DIR"
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/record-stream.sh"
    record_method_k "$VIDEO_URL" "${out}.mp4" >"${out}.log" 2>&1
    local rc=$?
    if [[ "$rc" == "0" ]] && verify_media "${out}.mp4" \
        && ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${out}.mp4" 2>/dev/null | grep -qx audio; then
        record_result K PASS "CDP -> ffmpeg slice ok (${NOTE[size]:-0} bytes, video+audio, 0 cookie files)"
        log_ok "  Method K: PASS (${NOTE[height]:-?}p, video+audio, no cookie file)"
    else
        tail -8 "${out}.log" 2>/dev/null | sed 's/^/       /'
        record_result K FAIL "no playable CDP recording (rc=${rc})"
        log_warn "  Method K: FAIL"
    fi
}

wanted() {
    [[ -z "$ONLY" ]] && return 0
    local f
    for f in ${ONLY//,/ }; do [[ "${f^^}" == "$1" ]] && return 0; done
    return 1
}

log_header "COOKIELESS SMOKE TEST"
log_info "target: $VIDEO_URL"
log_info "methods: ${METHOD_ORDER[*]} · min pass: ${MIN_PASS} · timeout: ${TIMEOUT_PER_METHOD}s"
[[ -n "$ONLY" ]] && log_info "restricted to: $ONLY"
$DRY_RUN && log_info "DRY RUN — commands only, nothing downloaded"

[[ "$(browser_assist_mode 2>/dev/null || echo auto)" != "off" ]] || log_info "BROWSER_ASSIST=off → Method K will be skipped"

for m in "${METHOD_ORDER[@]}"; do
    wanted "$m" || continue
    log_step "Method ${m}: ${METHOD_LABEL[$m]}"
    case "$m" in
        D) run_method_d ;;
        C) run_method_c ;;
        G) run_method_g ;;
        E) run_method_e ;;
        J) run_method_j ;;
        H) run_method_h ;;
        I) run_streamlink I hardened ;;
        F) run_streamlink F default ;;
        K) run_method_k ;;
    esac
done

TOTAL=$(( ${#PASSED[@]} + ${#FAILED[@]} ))
BROWSER_REQUIRED=false
if [[ "$REQUIRE_K" == "true" && "$(browser_assist_mode)" != "off" ]]; then
    BROWSER_REQUIRED=true
fi
BROWSER_PASSED=false
case " ${PASSED[*]-} " in *" K "*) BROWSER_PASSED=true ;; esac
AT_RISK=false
if (( ${#PASSED[@]} < MIN_PASS )); then AT_RISK=true; fi
if [[ "$BROWSER_REQUIRED" == "true" && "$BROWSER_PASSED" != "true" ]]; then AT_RISK=true; fi
printf '\n════════════════════════════════════════\n'
printf '  PASSED: %d / %d   SKIPPED: %d\n' "${#PASSED[@]}" "$TOTAL" "${#SKIPPED[@]}"
printf '  FAILED: %d\n' "${#FAILED[@]}"
printf '════════════════════════════════════════\n'
for m in "${METHOD_ORDER[@]}"; do
    case " ${PASSED[*]-} " in *" $m "*) printf '  ✅ %s  %s\n' "$m" "${NOTE[$m]-}" ;; esac
done
for m in "${METHOD_ORDER[@]}"; do
    case " ${FAILED[*]-} " in *" $m "*) printf '  ❌ %s  %s\n' "$m" "${NOTE[$m]-}" ;; esac
done
for m in "${METHOD_ORDER[@]}"; do
    case " ${SKIPPED[*]-} " in *" $m "*) printf '  ⏭  %s  %s\n' "$m" "${NOTE[$m]-}" ;; esac
done

# ── machine-readable result ─────────────────────────────────────────────────
build_json() {
    python3 - "$VIDEO_URL" "$VIDEO_ID" "$TOTAL" "${#PASSED[@]}" "${#FAILED[@]}" \
             "${#SKIPPED[@]}" "${PASSED[*]-}" "${FAILED[*]-}" "${SKIPPED[*]-}" "$MIN_PASS" "$BROWSER_REQUIRED" "$BROWSER_PASSED" <<'PY'
import json, sys
url, vid, total, p, f, s = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6])
passed, failed, skipped = (x.split() if x.strip() else [] for x in sys.argv[7:10])
print(json.dumps({
    "video_url": url, "video_id": vid, "total": total,
    "passed": p, "failed": f, "skipped": s, "min_pass": int(sys.argv[10]),
    "passed_methods": passed, "failed_methods": failed, "skipped_methods": skipped,
    "browser_required": sys.argv[11] == "true",
    "browser_passed": sys.argv[12] == "true",
    "at_risk": p < int(sys.argv[10]) or (sys.argv[11] == "true" and sys.argv[12] != "true"),
}))
PY
}

DETAILS=""
for m in "${METHOD_ORDER[@]}"; do
    case " ${PASSED[*]-} " in *" $m "*) DETAILS+="✅ ${m}: ${METHOD_LABEL[$m]} — ${NOTE[$m]-}\n" ;; esac
done
for m in "${METHOD_ORDER[@]}"; do
    case " ${FAILED[*]-} " in *" $m "*) DETAILS+="❌ ${m}: ${METHOD_LABEL[$m]} — ${NOTE[$m]-}\n" ;; esac
done
for m in "${METHOD_ORDER[@]}"; do
    case " ${SKIPPED[*]-} " in *" $m "*) DETAILS+="⏭ ${m}: ${METHOD_LABEL[$m]} — ${NOTE[$m]-}\n" ;; esac
done

if [[ -n "$JSON_PATH" ]]; then
    SUMMARY=$(build_json)
    printf '%s\n' "$SUMMARY" | jq --arg d "$DETAILS" '. + {details: $d}' > "$JSON_PATH" \
        || log_warn "could not write $JSON_PATH"
fi

# GitHub Actions plumbing (no-ops outside CI).
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    {
        echo "passed=${#PASSED[@]}"
        echo "failed=${#FAILED[@]}"
        echo "total=${TOTAL}"
        printf 'details<<DETAILS_EOF\n%b\nDETAILS_EOF\n' "$DETAILS"
    } >> "$GITHUB_OUTPUT"
fi
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    {
        echo "## Cookieless smoke test"
        echo ""
        echo "**Target**: \`$VIDEO_URL\`"
        echo ""
        echo "| Result | Method | Note |"
        echo "|---|---|---|"
        for m in "${METHOD_ORDER[@]}"; do
            case " ${PASSED[*]-} " in *" $m "*) echo "| ✅ | ${m} — ${METHOD_LABEL[$m]} | ${NOTE[$m]-} |" ;; esac
        done
        for m in "${METHOD_ORDER[@]}"; do
            case " ${FAILED[*]-} " in *" $m "*) echo "| ❌ | ${m} — ${METHOD_LABEL[$m]} | ${NOTE[$m]-} |" ;; esac
        done
        for m in "${METHOD_ORDER[@]}"; do
            case " ${SKIPPED[*]-} " in *" $m "*) echo "| ⏭ | ${m} — ${METHOD_LABEL[$m]} | ${NOTE[$m]-} |" ;; esac
        done
    } >> "$GITHUB_STEP_SUMMARY"
fi

if $DRY_RUN; then
    log_info "dry run complete — no verdict"
    exit 0
fi
if [[ "$AT_RISK" != "true" ]]; then
    log_ok "recorder is safe: ${#PASSED[@]}/${TOTAL} cookieless methods working; required CDP=${BROWSER_PASSED}"
    exit 0
fi
if [[ "$BROWSER_REQUIRED" == "true" && "$BROWSER_PASSED" != "true" ]]; then
    log_error "RECORDER AT RISK: required CDP recording did not produce playable video+audio"
fi
log_error "RECORDER AT RISK: only ${#PASSED[@]}/${TOTAL} cookieless methods working (need ${MIN_PASS}, CDP required=${BROWSER_REQUIRED})"
exit 1
