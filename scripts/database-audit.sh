#!/usr/bin/env bash
# Validate public archive data files for duplicate IDs, broken schema, and bad links.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

fail=0
warn=0

_report() {
    local level="$1" msg="$2"
    case "$level" in
        error) log_error "$msg"; fail=$((fail + 1)) ;;
        warn)  log_warn "$msg"; warn=$((warn + 1)) ;;
        *)     log_info "$msg" ;;
    esac
}

_audit_json() {
    local file="$1"
    if [[ ! -f "$file" ]]; then
        _report error "Missing required file: $file"
        return
    fi
    if ! jq -e . "$file" >/dev/null 2>&1; then
        _report error "Invalid JSON: $file"
    else
        _report ok "JSON OK: $file"
    fi
}

_audit_recordings() {
    local file="data/recordings.json"
    [[ ! -f "$file" ]] && return
    jq -e 'type == "array"' "$file" >/dev/null 2>&1 || { _report error "recordings.json must be an array"; return; }

    local total duplicates missing_title bad_url
    total=$(jq 'length' "$file")
    duplicates=$(jq -r '[.[].video_id // empty] | group_by(.)[] | select(length > 1) | .[0]' "$file" 2>/dev/null | sed '/^$/d' || true)
    missing_title=$(jq '[.[] | select((.title // "") == "")] | length' "$file")
    bad_url=$(jq '[.[] | select((.video_url // "") != "" and ((.video_url | test("^https?://")) | not))] | length' "$file")

    _report ok "recordings.json entries: $total"
    [[ -n "$duplicates" ]] && _report error "Duplicate recording video_id(s): $(echo "$duplicates" | paste -sd ', ' -)"
    (( missing_title > 0 )) && _report warn "recordings.json entries missing title: $missing_title"
    (( bad_url > 0 )) && _report warn "recordings.json entries with non-http URL: $bad_url"

    # ── Archive-link ownership check ─────────────────────────────────────────
    # Identifiers follow tml-YYYY-MM-<videoid>-<ts>, so an entry whose
    # archive_link lacks its OWN video_id is cross-wired (observed:
    # 84lG-ZjxCGI pointing at another video's item). Auto-swap only when the
    # true owner is unambiguous; otherwise flag for human review.
    local crosswired swapped
    swapped=0
    crosswired=$(jq -r '.[]
        | select((.archive_link // "") != "")
        | select((.archive_link | contains(.video_id // "###none###")) | not)
        | "\(.video_id)\t\(.archive_link)"' "$file" 2>/dev/null || true)
    if [[ -n "$crosswired" ]]; then
        while IFS=$'\t' read -r vid link; do
            [[ -z "$vid" ]] && continue
            # find entries whose identifier contains THIS video's id
            local owners
            owners=$(jq -r --arg v "$vid" '.[] | select((.archive_link // "") != "" and ((.archive_link | contains($v)))) | .video_id' "$file" 2>/dev/null | tr '\n' ' ')
            if [[ $(echo "$owners" | wc -w) -eq 1 ]] && [[ "${owners// /}" != "$vid" ]]; then
                local owner="${owners// /}"
                local stolen
                stolen=$(jq -r --arg o "$owner" --arg l "$link" '.[] | select(.video_id == $o and .archive_link == $l) | .video_id' "$file" 2>/dev/null)
                if [[ -n "$stolen" ]]; then
                    # swap: give each entry the link that names it
                    local tmp
                    tmp=$(jq --arg v "$vid" --arg o "$owner" '
                        (map(select(.video_id == $v)) | .[0].archive_link // "") as $a
                        | map(if .video_id == $v then .archive_link = ""
                              elif .video_id == $o then .archive_link = $a
                              else . end)' "$file" 2>/dev/null)
                    if echo "$tmp" | jq -e 'type=="array"' >/dev/null 2>&1; then
                        printf '%s' "$tmp" > "$file"
                        (( swapped++ ))
                        _report ok "Swapped cross-wired archive_link: ${vid} ↔ ${owner}"
                    fi
                fi
            else
                _report warn "Cross-wired archive_link on ${vid} (ambiguous owner: ${owners:-none}) — manual review"
            fi
        done <<< "$crosswired"
    fi
}

_audit_links() {
    local file="links.txt"
    [[ ! -f "$file" ]] && { _report warn "links.txt missing"; return; }
    local blocks youtube_count no_archive
    blocks=$(grep -c '^========================================' "$file" 2>/dev/null || echo 0)
    youtube_count=$(grep -Eic '^URL:[[:space:]]+https?://(www\.)?(youtube\.com|youtu\.be)' "$file" 2>/dev/null || echo 0)
    no_archive=$(awk '
      /^========================================/ { if (inb && title != "" && archive == 0) missing++; inb=1; title=""; archive=0 }
      /^Title:/ { title=$0 }
      /^\[archive:/ { archive=1 }
      END { if (inb && title != "" && archive == 0) missing++; print missing+0 }
    ' "$file")
    _report ok "links.txt separator lines: $blocks; YouTube URLs: $youtube_count"
    (( no_archive > 0 )) && _report warn "links.txt entries without Archive.org link: $no_archive"
}

_audit_stats_consistency() {
    [[ ! -f stats.json || ! -f data/recordings.json ]] && return
    local stat_total rec_total
    stat_total=$(jq -r '.total_streams // 0' stats.json 2>/dev/null || echo 0)
    rec_total=$(jq 'length' data/recordings.json 2>/dev/null || echo 0)
    if (( rec_total > 0 && stat_total < rec_total )); then
        _report warn "stats.json total_streams ($stat_total) is lower than recordings.json entries ($rec_total)"
    fi
}

main() {
    log_header "ARCHIVE DATABASE AUDIT"
    _audit_json "stats.json"
    _audit_json "data/recordings.json"
    _audit_json "data/youtube-stats.json"
    _audit_recordings
    _audit_links
    _audit_stats_consistency

    log_separator
    log_info "Warnings: $warn"
    log_info "Errors  : $fail"

    local summary_file="${GITHUB_STEP_SUMMARY:-}"
    if [[ -n "$summary_file" ]]; then
        {
            echo "## Archive Database Audit"
            echo ""
            echo "| Result | Count |"
            echo "|---|---:|"
            echo "| Warnings | $warn |"
            echo "| Errors | $fail |"
        } >> "$summary_file" || true
    fi

    (( fail == 0 ))
}

main "$@"
