#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  MIRROR HEALTH — verify every recording's mirror links are alive            ║
# ║  Reads data/recordings.json, checks each mirror URL (Archive.org, Gofile,   ║
# ║  Pixeldrain, MEGA), writes data/mirror-health.json with per-recording and   ║
# ║  aggregate status, and exits non-zero if any recording is below the copy    ║
# ║  guarantee (so the workflow can alert + trigger repair).                    ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

RECORDINGS_JSON="${RECORDINGS_JSON:-data/recordings.json}"
OUT_JSON="${MIRROR_HEALTH_JSON:-data/mirror-health.json}"
MIN_COPIES="${MIN_MIRROR_COPIES:-2}"          # minimum alive mirrors per recording
CHECK_TIMEOUT="${MIRROR_CHECK_TIMEOUT:-12}"    # seconds per URL

# ── URL liveness check ──────────────────────────────────────────────────────
# Returns 0 if the URL looks alive, 1 if dead, 2 if unverifiable.
check_url() {
    local url="$1"
    local code
    code=$(curl -sS -o /dev/null -w '%{http_code}' -L --max-time "$CHECK_TIMEOUT" \
        -A "Mozilla/5.0 (Stream-Recorder mirror-health)" "$url" 2>/dev/null)
    case "$code" in
        200|206|301|302|304) return 0 ;;
        000) return 2 ;;   # timeout / unreachable — treat as unverifiable
        401|403) return 2 ;;  # may be alive but blocking bots
        404|410) return 1 ;;
        *) return 2 ;;
    esac
}

# ── classify a mirror URL ───────────────────────────────────────────────────
# Archive.org and Pixeldrain can be verified over HTTP: 200 = alive.
classify() {
    local url="$1"
    local rc
    check_url "$url"; rc=$?
    case "$rc" in
        0) printf 'alive' ;;
        1) printf 'dead' ;;
        2) printf 'unverifiable' ;;
    esac
}

# Gofile: the /d/<code> page returns 200 even for a deleted/expired folder, so
# the page can't prove existence. The folder API needs the account key the
# uploader uses (GOFILE_API_KEY); without it the folder cannot be verified and
# we say "unverifiable" rather than claiming "alive". Returns alive/dead/unverifiable.
classify_gofile() {
    local url="$1" code status
    code=$(echo "$url" | sed -n 's#.*/d/\([^/?#]*\).*#\1#p')
    if [[ -z "$code" ]]; then
        printf 'unverifiable'; return
    fi
    if [[ -z "${GOFILE_API_KEY:-}" ]]; then
        printf 'unverifiable'; return
    fi
    status=$(curl -sS --max-time "$CHECK_TIMEOUT" \
        -H "Authorization: Bearer ${GOFILE_API_KEY}" \
        "https://api.gofile.io/contents/${code}" 2>/dev/null \
        | jq -r '.status // "error"' 2>/dev/null || echo error)
    case "$status" in
        ok) printf 'alive' ;;
        *) printf 'dead' ;;
    esac
}

# MEGA: links are mega.nz/#!<key> — the fragment never reaches the server, so
# the landing page returns 200 whether or not the file exists. Existence cannot
# be confirmed over plain HTTP, so a reachable page is "unverifiable", never
# "alive". (A truly missing page still counts as dead.)
classify_mega() {
    local url="$1" rc
    check_url "$url"; rc=$?
    case "$rc" in
        0) printf 'unverifiable' ;;
        1) printf 'dead' ;;
        2) printf 'unverifiable' ;;
    esac
}

log_header "MIRROR HEALTH CHECK"
log_info "Checking $(jq length "$RECORDINGS_JSON" 2>/dev/null || echo '?') recordings from $RECORDINGS_JSON"

# ── build health JSON ───────────────────────────────────────────────────────
TMP_JSON="$(mktemp)"
jq -c '.[]' "$RECORDINGS_JSON" | while IFS= read -r rec; do
    vid=$(echo "$rec" | jq -r '.video_id')
    title=$(echo "$rec" | jq -r '.title')
    archive=$(echo "$rec" | jq -r '.archive_link // empty')
    gofile=$(echo "$rec" | jq -r '.gofile_link // empty')
    pixel=$(echo "$rec" | jq -r '.pixeldrain_link // empty')
    mega=$(echo "$rec" | jq -r '.mega_link // empty')

    a="null"; g="null"; p="null"; m="null"
    alive=0; dead=0; unverifiable=0
    if [[ -n "$archive" ]]; then a=$(classify "$archive"); case "$a" in alive) alive=$((alive+1));; dead) dead=$((dead+1));; *) unverifiable=$((unverifiable+1));; esac; fi
    if [[ -n "$gofile" ]]; then g=$(classify_gofile "$gofile"); case "$g" in alive) alive=$((alive+1));; dead) dead=$((dead+1));; *) unverifiable=$((unverifiable+1));; esac; fi
    if [[ -n "$pixel" ]]; then p=$(classify "$pixel"); case "$p" in alive) alive=$((alive+1));; dead) dead=$((dead+1));; *) unverifiable=$((unverifiable+1));; esac; fi
    if [[ -n "$mega" ]]; then m=$(classify_mega "$mega"); case "$m" in alive) alive=$((alive+1));; dead) dead=$((dead+1));; *) unverifiable=$((unverifiable+1));; esac; fi

    healthy="true"
    (( alive >= MIN_COPIES )) || healthy="false"

    # serialise each mirror as a real JSON string, or null when no link exists
    jv() { [[ -n "$1" ]] && printf '"%s"' "$2" || printf 'null'; }

    jq -cn \
        --arg id "$vid" \
        --arg title "$title" \
        --argjson alive "$alive" \
        --argjson dead "$dead" \
        --argjson unverifiable "$unverifiable" \
        --argjson healthy "$healthy" \
        --argjson archive "$(jv "$archive" "$a")" \
        --argjson gofile "$(jv "$gofile" "$g")" \
        --argjson pixeldrain "$(jv "$pixel" "$p")" \
        --argjson mega "$(jv "$mega" "$m")" \
        '{video_id:$id, title:$title, alive:$alive, dead:$dead, unverifiable:$unverifiable, healthy:$healthy, mirrors:{archive:$archive, gofile:$gofile, pixeldrain:$pixeldrain, mega:$mega}}'
done > "$TMP_JSON"

# ── aggregate ───────────────────────────────────────────────────────────────
TOTAL=$(wc -l < "$TMP_JSON" | tr -d ' ')
HEALTHY=$(jq -s '[.[] | select(.healthy==true)] | length' "$TMP_JSON")
DEAD_RECS=$(jq -s '[.[] | select(.healthy==false)] | length' "$TMP_JSON")
DEAD_LINKS=$(jq -s '[.[] | .mirrors | to_entries[] | select(.value=="dead")] | length' "$TMP_JSON")
UNVER=$(jq -s '[.[] | .mirrors | to_entries[] | select(.value=="unverifiable")] | length' "$TMP_JSON")

NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
jq -s \
    --arg updated "$NOW" \
    --argjson total "$TOTAL" \
    --argjson healthy "$HEALTHY" \
    --argjson degraded "$DEAD_RECS" \
    --argjson dead_links "$DEAD_LINKS" \
    --argjson unverifiable "$UNVER" \
    '{updated_at:$updated, summary:{total:$total, healthy:$healthy, degraded:$degraded, dead_links:$dead_links, unverifiable_links:$unverifiable}, recordings:map({video_id,title,alive,dead,unverifiable,healthy,mirrors})}' \
    "$TMP_JSON" > "$OUT_JSON"
rm -f "$TMP_JSON"

log_info "Total: $TOTAL | Healthy: $HEALTHY | Degraded: $DEAD_RECS | Dead links: $DEAD_LINKS | Unverifiable: $UNVER"

# ── exit status: non-zero if any recording is below the copy guarantee ──────
if (( DEAD_RECS > 0 )); then
    log_warn "DEGRADED: $DEAD_RECS recording(s) below ${MIN_COPIES} live mirrors"
    echo "degraded=true" 
    exit 1
fi
log_ok "All recordings have at least ${MIN_COPIES} live mirrors"
echo "degraded=false"
exit 0
