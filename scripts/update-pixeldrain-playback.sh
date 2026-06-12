#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  🟣 PIXELDRAIN PLAYBACK HEALTH                                             ║
# ║  Builds a safe official Pixeldrain playback map using Pixeldrain's API.     ║
# ║  Does NOT use third-party bypass/proxy services.                            ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

_extract_pixeldrain_id() {
    local url="$1"
    if [[ "$url" =~ pixeldrain\.com/u/([a-zA-Z0-9_-]+) ]]; then
        echo "${BASH_REMATCH[1]}"
    elif [[ "$url" =~ pixeldrain\.com/api/file/([a-zA-Z0-9_-]+) ]]; then
        echo "${BASH_REMATCH[1]}"
    fi
}

_collect_links() {
    local recordings="${1:-data/recordings.json}"
    local links_file="${2:-links.txt}"
    {
        if [[ -f "$recordings" ]]; then
            jq -r '.[]? | select((.pixeldrain_link // "") != "") | [.video_id, .title, .pixeldrain_link] | @tsv' "$recordings" 2>/dev/null || true
        fi
        if [[ -f "$links_file" ]]; then
            awk '
              /^Title:/ { title=$0; sub(/^Title:[[:space:]]*/, "", title) }
              /^URL:/ { url=$0; sub(/^URL:[[:space:]]*/, "", url); vid=url; sub(/^.*[?&]v=/, "", vid); sub(/[& ].*$/, "", vid) }
              /^\[pixeldrain:/ { link=$2; if (link != "") print vid "\t" title "\t" link }
            ' "$links_file" 2>/dev/null || true
        fi
    } | awk -F '\t' 'NF >= 3 && $3 != "" { key=$3; if (!seen[key]++) print }'
}

_update_pixeldrain_playback() {
    log_header "🟣 PIXELDRAIN PLAYBACK HEALTH"

    local rows="[]"
    local checked=0 alive=0 dead=0

    while IFS=$'\t' read -r video_id title link; do
        [[ -z "$link" ]] && continue
        checked=$((checked + 1))
        local file_id direct_url info success name size message status
        file_id=$(_extract_pixeldrain_id "$link")
        direct_url=""
        status="dead"
        name=""
        size="0"
        message=""

        if [[ -n "$file_id" ]]; then
            direct_url="https://pixeldrain.com/api/file/${file_id}"
            info=$(curl -s --max-time 20 "https://pixeldrain.com/api/file/${file_id}/info" 2>/dev/null || echo '{}')
            success=$(jq -r '.success // true' <<< "$info" 2>/dev/null)
            name=$(jq -r '.name // empty' <<< "$info" 2>/dev/null)
            size=$(jq -r '.size // 0' <<< "$info" 2>/dev/null)
            message=$(jq -r '.message // .value // empty' <<< "$info" 2>/dev/null)
            if [[ "$success" != "false" ]]; then
                status="alive"
                alive=$((alive + 1))
                log_ok "  ${video_id:-unknown}: alive (${file_id})"
            else
                dead=$((dead + 1))
                log_warn "  ${video_id:-unknown}: dead (${file_id}) ${message}"
            fi
        else
            dead=$((dead + 1))
            message="could not extract Pixeldrain file id"
            log_warn "  ${video_id:-unknown}: invalid Pixeldrain link: $link"
        fi

        rows=$(jq \
            --arg video_id "$video_id" \
            --arg title "$title" \
            --arg original_url "$link" \
            --arg file_id "$file_id" \
            --arg direct_url "$direct_url" \
            --arg status "$status" \
            --arg name "$name" \
            --arg size "$size" \
            --arg message "$message" \
            '. + [{video_id: $video_id, title: $title, provider: "pixeldrain", original_url: $original_url, file_id: $file_id, direct_url: $direct_url, status: $status, name: $name, size: ($size | tonumber? // 0), message: $message}]' \
            <<< "$rows")
    done < <(_collect_links)

    local output
    output=$(jq -n \
        --arg updated_at "$(now_utc_iso)" \
        --arg checked "$checked" \
        --arg alive "$alive" \
        --arg dead "$dead" \
        --argjson sources "$rows" \
        '{updated_at: $updated_at, totals: {checked: ($checked|tonumber), alive: ($alive|tonumber), dead: ($dead|tonumber)}, sources: $sources}')

    mkdir -p data
    printf '%s\n' "$output" > data/pixeldrain-health.json

    if [[ "${DRY_RUN:-false}" != "true" ]]; then
        github_api_write "data/pixeldrain-health.json" "$output" "🟣 Pixeldrain playback health ($(now_pkt))" >/dev/null 2>&1 || true
    fi

    log_separator
    log_ok "Pixeldrain health complete: checked=${checked}, alive=${alive}, dead=${dead}"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    _update_pixeldrain_playback
fi
