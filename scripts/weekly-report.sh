#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  📡 STREAM RECORDER — WEEKLY ANALYTICS REPORT                              ║
# ║  Generates a detailed weekly summary from stats.json and links.txt.        ║
# ║  Sends a premium Discord embed every Monday at 3:00 PM PKT.               ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

# ═══════════════════════════════════════════════════════════════════════════════
#  GENERATE WEEKLY REPORT
# ═══════════════════════════════════════════════════════════════════════════════

generate_weekly_report() {
    log_header "📊 WEEKLY ANALYTICS REPORT"
    
    # ── Read stats.json ──────────────────────────────────────────────────────
    log_step "Reading statistics..."
    
    local stats_content
    stats_content=$(github_api_read_content "stats.json" 2>/dev/null) || stats_content='{}'
    
    local lifetime_streams lifetime_hours lifetime_gb lifetime_avg
    lifetime_streams=$(echo "$stats_content" | jq -r '.total_streams // 0' 2>/dev/null)
    lifetime_hours=$(echo "$stats_content" | jq -r '.total_hours // 0' 2>/dev/null)
    lifetime_gb=$(echo "$stats_content" | jq -r '.total_gb // 0' 2>/dev/null)
    lifetime_avg=$(echo "$stats_content" | jq -r '.avg_duration_hours // 0' 2>/dev/null)
    
    log_info "Lifetime: ${lifetime_streams} streams, ${lifetime_hours}h, ${lifetime_gb} GB"
    
    # ── Read recordings.json for this week ───────────────────────────────────
    # (Canonical data source. links.txt was retired; recordings.json is truth.)
    log_step "Analyzing this week's recordings..."

    local recs_content
    recs_content=$(github_api_read_content "data/recordings.json" 2>/dev/null) || recs_content="[]"
    echo "$recs_content" | jq -e 'type=="array"' >/dev/null 2>&1 || recs_content="[]"

    # Calculate date range for this week (Monday-Sunday)
    local week_start
    week_start=$(TZ='Asia/Karachi' date -d 'last monday' '+%Y-%m-%d' 2>/dev/null || \
                 TZ='Asia/Karachi' date -d '7 days ago' '+%Y-%m-%d')
    local today
    today=$(TZ='Asia/Karachi' date '+%Y-%m-%d')

    log_info "Week range: ${week_start} to ${today}"

    local weekly_streams=0
    local weekly_hours=0
    local weekly_gb=0
    local streams_list=""

    # Count + summarize entries whose date falls in this week.
    weekly_streams=$(echo "$recs_content" | jq --arg s "$week_start" --arg e "$today" \
        '[ .[] | select(.date >= $s and .date <= $e) ] | length' 2>/dev/null || echo 0)

    if [[ "${weekly_streams:-0}" -gt 0 ]]; then
        # Sum hours (from duration_sec) and GB (from size_gb/size_bytes).
        weekly_hours=$(echo "$recs_content" | jq -r --arg s "$week_start" --arg e "$today" \
            '[ .[] | select(.date >= $s and .date <= $e) | (.duration_sec // 0) ] | add / 3600 | (.*100|round/100)' 2>/dev/null || echo 0)
        weekly_gb=$(echo "$recs_content" | jq -r --arg s "$week_start" --arg e "$today" \
            '[ .[] | select(.date >= $s and .date <= $e) | (.size_gb // ((.size_bytes // 0)/1073741824)) ] | add | (.*100|round/100)' 2>/dev/null || echo 0)

        # Build the per-stream list (markdown bullets).
        streams_list=$(echo "$recs_content" | jq -r --arg s "$week_start" --arg e "$today" '
            [ .[] | select(.date >= $s and .date <= $e) ]
            | map("• **" + ((.title // "Untitled")[0:40]) + "** — " + (.date // "?") + " — " + (.duration_fmt // "?") + " — " + (.size_human // "?"))
            | join("\\n")' 2>/dev/null || echo "")
    fi
    
    # Calculate weekly average
    local weekly_avg="0h"
    if (( weekly_streams > 0 )); then
        weekly_avg=$(echo "scale=1; $weekly_hours / $weekly_streams" | bc)
        weekly_avg="${weekly_avg}h"
    fi
    
    # Default streams list if empty
    if [[ -z "$streams_list" ]]; then
        streams_list="*No streams recorded this week* 😴"
    fi
    
    log_info "This week: ${weekly_streams} streams, ${weekly_hours}h, ${weekly_gb} GB"
    
    # ── Export for Discord notification ───────────────────────────────────────
    set_env "WEEKLY_TOTAL_STREAMS" "$weekly_streams"
    set_env "WEEKLY_TOTAL_HOURS" "$weekly_hours"
    set_env "WEEKLY_TOTAL_GB" "$weekly_gb"
    set_env "WEEKLY_AVG_DURATION" "$weekly_avg"
    set_env "WEEKLY_STREAMS_LIST" "$streams_list"
    # Aliases read by discord-notify.sh
    set_env "WEEK_STREAMS" "$weekly_streams"
    set_env "WEEK_HOURS" "$weekly_hours"
    set_env "WEEK_GB" "$weekly_gb"
    set_env "LIFETIME_TOTAL_STREAMS" "$lifetime_streams"
    set_env "LIFETIME_TOTAL_HOURS" "$lifetime_hours"
    set_env "LIFETIME_TOTAL_GB" "$lifetime_gb"
    set_env "LIFETIME_AVG_DURATION" "$lifetime_avg"
    
    # ── Send Discord notification ────────────────────────────────────────────
    source "$SCRIPT_DIR/discord-notify.sh"
    notify_weekly_summary
    
    log_ok "Weekly report generated and sent"
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    generate_weekly_report
fi
