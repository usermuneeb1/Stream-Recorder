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
    
    # ── Read links.txt for this week ─────────────────────────────────────────
    log_step "Analyzing this week's recordings..."
    
    local links_content
    links_content=$(github_api_read_content "links.txt" 2>/dev/null) || links_content=""
    
    # Calculate date range for this week (Monday-Sunday)
    local week_start
    week_start=$(TZ='Asia/Karachi' date -d 'last monday' '+%Y-%m-%d' 2>/dev/null || \
                 TZ='Asia/Karachi' date -d '7 days ago' '+%Y-%m-%d')
    local today
    today=$(TZ='Asia/Karachi' date '+%Y-%m-%d')
    
    log_info "Week range: ${week_start} to ${today}"
    
    # Parse this week's entries from links.txt
    local weekly_streams=0
    local weekly_hours=0
    local weekly_gb=0
    local streams_list=""
    local in_entry=false
    local entry_date="" entry_title="" entry_duration="" entry_size=""
    
    while IFS= read -r line; do
        # Start of entry
        if [[ "$line" == "========================================"* ]] && [[ "$in_entry" == "false" ]]; then
            in_entry=true
            entry_date="" entry_title="" entry_duration="" entry_size=""
            continue
        fi
        
        # End of entry
        if [[ "$line" == "========================================"* ]] && [[ "$in_entry" == "true" ]]; then
            in_entry=false
            
            # Check if this entry is from this week
            if [[ -n "$entry_date" ]]; then
                local entry_ymd
                entry_ymd=$(echo "$entry_date" | grep -oP '\d{4}-\d{2}-\d{2}' | head -1)
                
                if [[ -n "$entry_ymd" ]] && [[ "$entry_ymd" >= "$week_start" ]] && [[ "$entry_ymd" <= "$today" ]]; then
                    (( weekly_streams++ ))
                    
                    # Parse duration to hours
                    if [[ "$entry_duration" =~ ([0-9]+):([0-9]+):([0-9]+) ]]; then
                        local d_hours=${BASH_REMATCH[1]}
                        local d_mins=${BASH_REMATCH[2]}
                        local d_total_hours
                        d_total_hours=$(echo "scale=2; $d_hours + $d_mins / 60" | bc)
                        weekly_hours=$(echo "scale=2; $weekly_hours + $d_total_hours" | bc)
                    fi
                    
                    # Parse size
                    local s_val
                    s_val=$(echo "$entry_size" | grep -oP '[\d.]+(?=\s*GB)' | head -1)
                    if [[ -n "$s_val" ]]; then
                        weekly_gb=$(echo "scale=2; $weekly_gb + $s_val" | bc)
                    fi
                    
                    # Build stream list entry
                    local short_title="${entry_title:0:40}"
                    [[ ${#entry_title} -gt 40 ]] && short_title+="..."
                    streams_list+="• **${short_title}** — ${entry_ymd} — ${entry_duration} — ${entry_size}\\n"
                fi
            fi
            continue
        fi
        
        # Parse entry fields
        if [[ "$in_entry" == "true" ]]; then
            [[ "$line" =~ ^Date:\ *(.+)$ ]] && entry_date="${BASH_REMATCH[1]}"
            [[ "$line" =~ ^Title:\ *(.+)$ ]] && entry_title="${BASH_REMATCH[1]}"
            [[ "$line" =~ ^Duration:\ *(.+)$ ]] && entry_duration="${BASH_REMATCH[1]}"
            [[ "$line" =~ ^Size:\ *(.+)$ ]] && entry_size="${BASH_REMATCH[1]}"
        fi
    done <<< "$links_content"
    
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
    set_env "LIFETIME_TOTAL_STREAMS" "$lifetime_streams"
    set_env "LIFETIME_TOTAL_HOURS" "$lifetime_hours"
    set_env "LIFETIME_TOTAL_GB" "$lifetime_gb"
    
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
