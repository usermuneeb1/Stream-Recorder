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

    local total duplicates missing_title bad_url missing_url no_archive_id missing_duration
    total=$(jq 'length' "$file")
    duplicates=$(jq -r '[.[].video_id // empty] | group_by(.)[] | select(length > 1) | .[0]' "$file" 2>/dev/null | sed '/^$/d' || true)
    missing_title=$(jq '[.[] | select((.title // "") == "")] | length' "$file")
    bad_url=$(jq '[.[] | select((.video_url // "") != "" and ((.video_url | test("^https?://")) | not))] | length' "$file")
    missing_url=$(jq '[.[] | select((.video_url // "") == "")] | length' "$file")
    no_archive_id=$(jq '[.[] | select((.archive_id // "") == "")] | length' "$file")
    missing_duration=$(jq '[.[] | select((( .duration_sec // 0) | tonumber) <= 0)] | length' "$file")

    _report ok "recordings.json entries: $total"
    [[ -n "$duplicates" ]] && _report error "Duplicate recording video_id(s): $(echo "$duplicates" | paste -sd ', ' -)"
    (( missing_title > 0 )) && _report warn "recordings.json entries missing title: $missing_title"
    (( bad_url > 0 )) && _report warn "recordings.json entries with non-http URL: $bad_url"
    (( missing_url > 0 )) && _report warn "recordings.json entries missing video_url: $missing_url"
    (( no_archive_id > 0 )) && _report warn "recordings.json entries missing archive_id: $no_archive_id"
    (( missing_duration > 0 )) && _report warn "recordings.json entries with zero duration: $missing_duration"
}

_audit_links() {
    local file="links.txt"
    [[ ! -f "$file" ]] && { _report warn "links.txt missing"; return; }

    # links.txt is a JSON mirror of recordings.json (same schema).
    if jq -e 'type == "array"' "$file" >/dev/null 2>&1; then
        local count no_archive
        count=$(jq 'length' "$file")
        no_archive=$(jq '[.[] | select((.archive_link // "") == "")] | length' "$file")
        _report ok "links.txt JSON entries: $count"
        (( no_archive > 0 )) && _report warn "links.txt entries without Archive.org link: $no_archive"
        return
    fi

    # Legacy text-format fallback (pre-JSON archives).
    local blocks youtube_count no_archive
    blocks=$(grep -c '^========================================' "$file" 2>/dev/null || echo 0)
    youtube_count=$(grep -Eic '^URL:[[:space:]]+https?://(www\\.)?(youtube\\.com|youtu\\.be)' "$file" 2>/dev/null || echo 0)
    no_archive=$(awk '
      /^========================================/ { if (inb && title != "" && archive == 0) missing++; inb=1; title=""; archive=0 }
      /^Title:/ { title=$0 }
      /^\[archive:/ { archive=1 }
      END { if (inb && title != "" && archive == 0) missing++; print missing+0 }
    ' "$file")
    _report warn "links.txt is in legacy text format — expected JSON mirror of recordings.json"
    _report ok "links.txt separator lines: $blocks; YouTube URLs: $youtube_count"
    (( no_archive > 0 )) && _report warn "links.txt entries without Archive.org link: $no_archive"
}

_audit_stats_consistency() {
    [[ ! -f stats.json || ! -f data/recordings.json ]] && return
    local stat_total rec_total stat_hours rec_hours
    stat_total=$(jq -r '.total_streams // 0' stats.json 2>/dev/null || echo 0)
    rec_total=$(jq 'length' data/recordings.json 2>/dev/null || echo 0)
    stat_hours=$(jq -r '.total_hours // 0' stats.json 2>/dev/null || echo 0)
    rec_hours=$(jq -r '[.[].duration_sec // 0] | add / 3600 | . * 100 | round / 100' data/recordings.json 2>/dev/null || echo 0)
    if (( rec_total > 0 && stat_total != rec_total )); then
        _report error "stats.json total_streams ($stat_total) != recordings.json entries ($rec_total) — run scripts/repair-archive-data.py"
    fi
    if (( $(echo "$stat_hours > $rec_hours + 1" | bc -l 2>/dev/null || echo 0) )); then
        _report warn "stats.json total_hours ($stat_hours) exceeds recordings.json sum ($rec_hours) — run scripts/repair-archive-data.py"
    fi
}

_audit_feeds() {
    [[ ! -f data/recordings.json ]] && return
    local file="dashboard/public/feed.json"
    [[ ! -f "$file" ]] && { _report warn "dashboard/public/feed.json missing — run scripts/generate-feeds.py"; return; }
    if ! jq -e . "$file" >/dev/null 2>&1; then
        _report error "Invalid JSON: $file"
        return
    fi
    local feed_count rec_count
    feed_count=$(jq '(.items // []) | length' "$file" 2>/dev/null || echo 0)
    rec_count=$(jq 'length' data/recordings.json 2>/dev/null || echo 0)
    if (( rec_count > 0 && feed_count != rec_count )); then
        _report warn "feed.json has $feed_count items but recordings.json has $rec_count — run scripts/generate-feeds.py"
    fi
}

main() {
    log_header "🧪 ARCHIVE DATABASE AUDIT"
    _audit_json "stats.json"
    _audit_json "data/recordings.json"
    _audit_json "data/youtube-stats.json"
    _audit_recordings
    _audit_links
    _audit_stats_consistency
    _audit_feeds

    log_separator
    log_info "Warnings: $warn"
    log_info "Errors  : $fail"

    local summary_file="${GITHUB_STEP_SUMMARY:-}"
    if [[ -n "$summary_file" ]]; then
        {
            echo "## 🧪 Archive Database Audit"
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
