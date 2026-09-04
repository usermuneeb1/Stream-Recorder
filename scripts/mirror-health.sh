#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  MIRROR HEALTH — verify every recording's mirror links are alive            ║
# ║  Reads data/recordings.json, checks each mirror URL (Archive.org, Gofile,   ║
# ║  Pixeldrain, MEGA, 0807.st, VikingFile), writes data/mirror-health.json     ║
# ║  aggregate status, and exits non-zero if any recording is below the copy    ║
# ║  guarantee (so the workflow can alert + trigger repair).                    ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

RECORDINGS_JSON="${RECORDINGS_JSON:-data/recordings.json}"
OUT_JSON="${MIRROR_HEALTH_JSON:-data/mirror-health.json}"
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
# the page can't prove existence. Preferred: Contents API with the account key
# (GOFILE_API_KEY). Fallback: the SAME API with the public website token (wt)
# from gofile.io/js/wt.obf.js — but that file is obfuscated and the token
# rotates, so a hardcoded wt usually returns "error-token" → unverifiable.
# That is ACCEPTABLE by policy: gofile is disposable; it can satisfy the fast
# side of the bar only when actually verifiable. Pixeldrain + GitHub releases
# carry the fast side otherwise.
classify_gofile() {
    local url="$1" code status
    code=$(echo "$url" | sed -n 's#.*/d/\([^/?#]*\).*#\1#p')
    if [[ -z "$code" ]]; then
        printf 'unverifiable'; return
    fi
    # Public website token only — no account API key anywhere (owner policy
    # 2026-09-02). A stale wt yields error-token → unverifiable, and the
    # pixeldrain/github/archive classifiers still carry the verdict.
    status=$(curl -sS --max-time "$CHECK_TIMEOUT" \
        "https://api.gofile.io/contents/${code}?wt=4fd6sg89d7s6" 2>/dev/null \
        | jq -r '.status // "error"' 2>/dev/null || echo error)
    case "$status" in
        ok) printf 'alive' ;;
        # API returns "error-notFound" — glob the substring, never exact-match
        *notFound*|*notfound*) printf 'dead' ;;
        *) printf 'unverifiable' ;;
    esac
}

# MEGA: the HTML page returns 200 whether or not the file exists (key is in
# the fragment, never sent to the server). But MEGA's public API CAN prove
# existence without any login: a={"a":"g","p":<handle>} returns size info for
# a live file and a negative error code for a dead one. No decryption, no
# account. This replaces the old always-"unverifiable" classifier.
classify_mega() {
    local url="$1" handle resp
    # NOTE: '|' delimiter — '#' appears literally in mega URLs (#! and /file/x#)
    handle=$(echo "$url" | sed -n 's|.*mega\.nz/#!\([^!]*\)!.*|\1|p')
    [[ -z "$handle" ]] && handle=$(echo "$url" | sed -n 's|.*/file/\([^#/]*\)[#/].*|\1|p')
    [[ -z "$handle" ]] && handle=$(echo "$url" | sed -n 's|.*/file/\([^/?#]*\).*|\1|p')
    if [[ -z "$handle" ]]; then
        printf 'unverifiable'; return
    fi
    resp=$(curl -sS --max-time "$CHECK_TIMEOUT" \
        "https://g.api.mega.co.nz/cs?id=0" \
        -d "[{\"a\":\"g\",\"p\":\"${handle}\"}]" 2>/dev/null || true)
    # Fallback endpoint (some networks/DNS only resolve one of the two)
    if [[ -z "$resp" ]]; then
        resp=$(curl -sS --max-time "$CHECK_TIMEOUT" \
            "https://api.mega.co.nz/cs?id=0" \
            -d "[{\"a\":\"g\",\"p\":\"${handle}\"}]" 2>/dev/null || echo "")
    fi
    case "$resp" in
        *'"s"'*) printf 'alive' ;;
        *'-'[0-9]*) printf 'dead' ;;     # negative error code = ENOENT etc.
        *) printf 'unverifiable' ;;
    esac
}

# GitHub release asset: plain HTTP works — 302→200 via the Azure CDN when the
# asset exists, 404 when deleted. Counts toward the FAST side of the bar.
classify_gh() {
    local url="$1"
    classify "$url"
}

# 0807.st: direct file URLs. 200/206 = alive, 404/410 = dead.
classify_st0807() {
    local url="$1"
    classify "$url"
}

# VikingFile: check-file API with the /f/<hash> id.
classify_vikingfile() {
    local url="$1" hash exist
    hash=$(echo "$url" | sed -n 's#.*vikingfile.com/f/\([^/?#]*\).*#\1#p')
    if [[ -z "$hash" ]]; then
        printf 'unverifiable'; return
    fi
    exist=$(curl -sS --max-time "$CHECK_TIMEOUT" -X POST \
        "https://vikingfile.com/api/check-file" -F "hash=${hash}" 2>/dev/null \
        | jq -r '.exist // empty' 2>/dev/null || echo "")
    case "$exist" in
        true) printf 'alive' ;;
        false) printf 'dead' ;;
        *) printf 'unverifiable' ;;
    esac
}

log_header "MIRROR HEALTH CHECK"
log_info "Checking $(jq length "$RECORDINGS_JSON" 2>/dev/null || echo '?') recordings from $RECORDINGS_JSON"

# ── build health JSON ───────────────────────────────────────────────────────
# COPY GUARANTEE (the settled bar):
#   every recording needs ≥1 PERMANENT mirror alive (Archive.org or MEGA)
#   AND ≥1 FAST mirror alive (Pixeldrain, Gofile, GitHub release, 0807.st, VikingFile).
# Gofile is disposable by policy — it can satisfy "fast" but nothing else.
TMP_JSON="$(mktemp)"
jq -c '.[]' "$RECORDINGS_JSON" | while IFS= read -r rec; do
    vid=$(echo "$rec" | jq -r '.video_id')
    title=$(echo "$rec" | jq -r '.title')
    archive=$(echo "$rec" | jq -r '.archive_link // empty')
    gofile=$(echo "$rec" | jq -r '.gofile_link // empty')
    pixel=$(echo "$rec" | jq -r '.pixeldrain_link // empty')
    mega=$(echo "$rec" | jq -r '.mega_link // empty')
    ghrel=$(echo "$rec" | jq -r '.github_release // .github_direct // empty')
    st0807=$(echo "$rec" | jq -r '.st0807_link // empty')
    viking=$(echo "$rec" | jq -r '.vikingfile_link // empty')

    a="null"; g="null"; p="null"; m="null"; gh="null"; s="null"; v="null"
    if [[ -n "$archive" ]]; then a=$(classify "$archive"); fi
    if [[ -n "$gofile" ]]; then g=$(classify_gofile "$gofile"); fi
    if [[ -n "$pixel" ]]; then p=$(classify "$pixel"); fi
    if [[ -n "$mega" ]]; then m=$(classify_mega "$mega"); fi
    if [[ -n "$ghrel" ]]; then gh=$(classify_gh "$ghrel"); fi
    if [[ -n "$st0807" ]]; then s=$(classify_st0807 "$st0807"); fi
    if [[ -n "$viking" ]]; then v=$(classify_vikingfile "$viking"); fi

    is_alive() { [[ "$1" == "alive" ]] && return 0 || return 1; }

    permanent_ok=false; fast_ok=false
    if is_alive "$a" || is_alive "$m"; then permanent_ok=true; fi
    # FAST = Pixeldrain, Gofile, GitHub release, 0807.st, VikingFile (see the
    # bar comment above): omitting $s/$v marked 0807-only recordings degraded
    # and triggered needless repair storms.
    if is_alive "$p" || is_alive "$g" || is_alive "$gh" || is_alive "$s" || is_alive "$v"; then fast_ok=true; fi

    alive=0; dead=0; unverifiable=0
    for st in "$a" "$g" "$p" "$m" "$gh" "$s" "$v"; do
        [[ "$st" == "null" ]] && continue
        case "$st" in
            alive) ((++alive)) ;;
            dead) ((++dead)) ;;
            *) ((++unverifiable)) ;;
        esac
    done

    healthy="true"
    { $permanent_ok && $fast_ok; } || healthy="false"

    # serialise each mirror status as a JSON string ("alive"/"dead"/...), or
    # JSON null when no link exists. --argjson requires VALID JSON, so the
    # quotes must not be backslash-escaped (2026-09-02 vacuous-output bug).
    jv() { [[ -n "$1" ]] && printf '"%s"' "$2" || printf 'null'; }

    jq -cn \
        --arg id "$vid" \
        --arg title "$title" \
        --argjson alive "$alive" \
        --argjson dead "$dead" \
        --argjson unverifiable "$unverifiable" \
        --argjson healthy "$healthy" \
        --argjson permanent_ok "$permanent_ok" \
        --argjson fast_ok "$fast_ok" \
        --argjson archive "$(jv "$archive" "$a")" \
        --argjson gofile "$(jv "$gofile" "$g")" \
        --argjson pixeldrain "$(jv "$pixel" "$p")" \
        --argjson mega "$(jv "$mega" "$m")" \
        --argjson github "$(jv "$ghrel" "$gh")" \
        --argjson st0807 "$(jv "$st0807" "$s")" \
        --argjson vikingfile "$(jv "$viking" "$v")" \
        '{video_id:$id, title:$title, alive:$alive, dead:$dead, unverifiable:$unverifiable, healthy:$healthy, permanent_ok:$permanent_ok, fast_ok:$fast_ok, mirrors:{archive:$archive, gofile:$gofile, pixeldrain:$pixeldrain, mega:$mega, github:$github, st0807:$st0807, vikingfile:$vikingfile}}'
done > "$TMP_JSON"

# ── vacuous-output guard (2026-09-02: emitter broke silently, wrote total:0, ──
# ── exit 0 — dead links became invisible and repair was never triggered) ────
TOTAL=$(wc -l < "$TMP_JSON" | tr -d ' ')
EXPECTED_TOTAL=$(jq 'length' "$RECORDINGS_JSON" 2>/dev/null || echo '?')
if [[ "$EXPECTED_TOTAL" == "?" ]] || (( TOTAL != EXPECTED_TOTAL )); then
    log_error "Serialisation failed: emitted $TOTAL of $EXPECTED_TOTAL recordings. Refusing to publish vacuous health data."
    exit 2
fi

# ── aggregate ───────────────────────────────────────────────────────────────
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
    '{updated_at:$updated, summary:{total:$total, healthy:$healthy, degraded:$degraded, dead_links:$dead_links, unverifiable_links:$unverifiable}, recordings:map({video_id,title,alive,dead,unverifiable,healthy,permanent_ok,fast_ok,mirrors})}' \
    "$TMP_JSON" > "$OUT_JSON"
rm -f "$TMP_JSON"

log_info "Total: $TOTAL | Healthy: $HEALTHY | Degraded: $DEAD_RECS | Dead links: $DEAD_LINKS | Unverifiable: $UNVER"

# ── exit status: non-zero if any recording is below the copy guarantee ──────
if (( DEAD_RECS > 0 )); then
    log_warn "DEGRADED: $DEAD_RECS recording(s) below the copy guarantee (≥1 permanent + ≥1 fast mirror)"
    echo "degraded=true"
    exit 1
fi
log_ok "All recordings meet the copy guarantee (≥1 permanent + ≥1 fast mirror)"
echo "degraded=false"
exit 0
