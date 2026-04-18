#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  📡 STREAM RECORDER — SHARED UTILITIES                                     ║
# ║  Author : Muneeb Ahmad                                                     ║
# ║  Version: 2.0.0                                                            ║
# ║  License: MIT                                                              ║
# ║                                                                            ║
# ║  This file contains all shared helper functions used across every script.   ║
# ║  Every other script sources this file first.                               ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

# ═══════════════════════════════════════════════════════════════════════════════
#  LOGGING FRAMEWORK
#  Consistent, timestamped, color-coded logging with emoji prefixes.
# ═══════════════════════════════════════════════════════════════════════════════

LOG_RESET="\033[0m"
LOG_RED="\033[1;31m"
LOG_GREEN="\033[1;32m"
LOG_YELLOW="\033[1;33m"
LOG_BLUE="\033[1;34m"
LOG_PURPLE="\033[1;35m"
LOG_CYAN="\033[1;36m"
LOG_GRAY="\033[0;37m"
LOG_BOLD="\033[1m"

_log_timestamp() {
    date '+%Y-%m-%d %H:%M:%S'
}

log_info() {
    echo -e "${LOG_GRAY}[$(_log_timestamp)]${LOG_RESET} ${LOG_BLUE}ℹ️  INFO ${LOG_RESET} │ $*"
}

log_ok() {
    echo -e "${LOG_GRAY}[$(_log_timestamp)]${LOG_RESET} ${LOG_GREEN}✅ OK   ${LOG_RESET} │ $*"
}

log_warn() {
    echo -e "${LOG_GRAY}[$(_log_timestamp)]${LOG_RESET} ${LOG_YELLOW}⚠️  WARN ${LOG_RESET} │ $*"
}

log_error() {
    echo -e "${LOG_GRAY}[$(_log_timestamp)]${LOG_RESET} ${LOG_RED}❌ ERROR${LOG_RESET} │ $*"
}

log_step() {
    echo -e "${LOG_GRAY}[$(_log_timestamp)]${LOG_RESET} ${LOG_PURPLE}🔷 STEP ${LOG_RESET} │ $*"
}

log_debug() {
    if [[ "${DEBUG:-false}" == "true" ]]; then
        echo -e "${LOG_GRAY}[$(_log_timestamp)]${LOG_RESET} ${LOG_GRAY}🔍 DEBUG${LOG_RESET} │ $*"
    fi
}

log_header() {
    echo ""
    echo -e "${LOG_BOLD}${LOG_CYAN}╔══════════════════════════════════════════════════════════════╗${LOG_RESET}"
    echo -e "${LOG_BOLD}${LOG_CYAN}║  $*${LOG_RESET}"
    echo -e "${LOG_BOLD}${LOG_CYAN}╚══════════════════════════════════════════════════════════════╝${LOG_RESET}"
    echo ""
}

log_separator() {
    echo -e "${LOG_GRAY}──────────────────────────────────────────────────────────────${LOG_RESET}"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  TIME & DATE UTILITIES
#  All times converted to PKT (Pakistan Standard Time = UTC+5)
# ═══════════════════════════════════════════════════════════════════════════════

# Convert any UTC time string to PKT formatted string
to_pkt() {
    local utc_time="${1:-}"
    if [[ -z "$utc_time" ]]; then
        TZ='Asia/Karachi' date '+%Y-%m-%d %I:%M:%S %p PKT'
    else
        TZ='Asia/Karachi' date -d "$utc_time" '+%Y-%m-%d %I:%M:%S %p PKT' 2>/dev/null || \
        TZ='Asia/Karachi' date '+%Y-%m-%d %I:%M:%S %p PKT'
    fi
}

# Get current time in PKT
now_pkt() {
    TZ='Asia/Karachi' date '+%Y-%m-%d %I:%M:%S %p PKT'
}

# Get current date in PKT (YYYY-MM-DD)
today_pkt() {
    TZ='Asia/Karachi' date '+%Y-%m-%d'
}

# Get current UTC ISO 8601 timestamp (for Discord API)
now_utc_iso() {
    date -u '+%Y-%m-%dT%H:%M:%S.000Z'
}

# Get Unix epoch timestamp
now_epoch() {
    date '+%s'
}

# Calculate duration between two epoch timestamps
calc_duration_seconds() {
    local start_epoch="$1"
    local end_epoch="$2"
    echo $(( end_epoch - start_epoch ))
}

# ═══════════════════════════════════════════════════════════════════════════════
#  FORMATTING UTILITIES
#  Convert raw numbers into human-readable strings
# ═══════════════════════════════════════════════════════════════════════════════

# Convert seconds to HH:MM:SS format
format_duration() {
    local total_seconds="${1:-0}"
    total_seconds="${total_seconds%.*}"  # Remove any decimals
    total_seconds="${total_seconds:-0}"
    local hours=$(( total_seconds / 3600 ))
    local minutes=$(( (total_seconds % 3600) / 60 ))
    local seconds=$(( total_seconds % 60 ))
    printf "%02d:%02d:%02d" "$hours" "$minutes" "$seconds"
}

# Convert seconds to human-readable string (e.g., "2h 45m 30s")
format_duration_human() {
    local total_seconds="${1:-0}"
    total_seconds="${total_seconds%.*}"
    total_seconds="${total_seconds:-0}"
    local hours=$(( total_seconds / 3600 ))
    local minutes=$(( (total_seconds % 3600) / 60 ))
    local seconds=$(( total_seconds % 60 ))
    
    if (( hours > 0 )); then
        printf "%dh %dm %ds" "$hours" "$minutes" "$seconds"
    elif (( minutes > 0 )); then
        printf "%dm %ds" "$minutes" "$seconds"
    else
        printf "%ds" "$seconds"
    fi
}

# Convert bytes to human-readable size (KB, MB, GB, TB)
format_size() {
    local bytes="${1:-0}"
    if (( bytes >= 1099511627776 )); then
        echo "$(echo "scale=2; $bytes / 1099511627776" | bc) TB"
    elif (( bytes >= 1073741824 )); then
        echo "$(echo "scale=2; $bytes / 1073741824" | bc) GB"
    elif (( bytes >= 1048576 )); then
        echo "$(echo "scale=2; $bytes / 1048576" | bc) MB"
    elif (( bytes >= 1024 )); then
        echo "$(echo "scale=2; $bytes / 1024" | bc) KB"
    else
        echo "${bytes} B"
    fi
}

# Convert bytes to GB with 2 decimal places
format_size_gb() {
    local bytes="${1:-0}"
    echo "scale=2; $bytes / 1073741824" | bc
}

# Convert hours decimal to human-readable (e.g., 2.5 → "2h 30m")
format_hours_human() {
    local hours_decimal="${1:-0}"
    local total_minutes
    total_minutes=$(echo "$hours_decimal * 60" | bc | cut -d. -f1)
    total_minutes="${total_minutes:-0}"
    local h=$(( total_minutes / 60 ))
    local m=$(( total_minutes % 60 ))
    if (( h > 0 )); then
        echo "${h}h ${m}m"
    else
        echo "${m}m"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  FILENAME UTILITIES
#  Clean up filenames for safe filesystem use
# ═══════════════════════════════════════════════════════════════════════════════

# Sanitize a string for use as a filename
sanitize_filename() {
    local name="$1"
    # Remove filesystem-unsafe characters
    name=$(echo "$name" | sed 's/[\/\\:*?"<>|#&%$!@^`~]//g')
    # Replace common separators with hyphens
    name=$(echo "$name" | sed 's/[|]/ - /g')
    # Collapse multiple spaces/hyphens
    name=$(echo "$name" | sed 's/  */ /g; s/--*/-/g')
    # Trim leading/trailing whitespace and hyphens
    name=$(echo "$name" | sed 's/^[[:space:]-]*//; s/[[:space:]-]*$//')
    # Limit to 180 characters
    name="${name:0:180}"
    # Fallback if empty
    [[ -z "$name" ]] && name="Live_Stream_$(date '+%Y%m%d_%H%M%S')"
    echo "$name"
}

# Generate a safe output filename with date
generate_output_filename() {
    local title="$1"
    local date_str
    date_str=$(TZ='Asia/Karachi' date '+%Y-%m-%d')
    local safe_title
    safe_title=$(sanitize_filename "$title")
    echo "${safe_title} - ${date_str}"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  DISK SPACE UTILITIES
#  Monitor available disk space on the runner
# ═══════════════════════════════════════════════════════════════════════════════

# Get available disk space in GB (returns decimal)
get_disk_space_gb() {
    local available_kb
    available_kb=$(df / | tail -1 | awk '{print $4}')
    echo "scale=2; $available_kb / 1048576" | bc
}

# Get total disk space in GB
get_total_disk_gb() {
    local total_kb
    total_kb=$(df / | tail -1 | awk '{print $2}')
    echo "scale=2; $total_kb / 1048576" | bc
}

# Get used disk space percentage
get_disk_used_percent() {
    df / | tail -1 | awk '{print $5}' | sed 's/%//'
}

# Check if enough disk space is available (returns 0=ok, 1=low)
check_disk_space() {
    local required_gb="${1:-3}"
    local available_gb
    available_gb=$(get_disk_space_gb)
    
    local result
    result=$(echo "$available_gb >= $required_gb" | bc -l)
    
    if [[ "$result" == "1" ]]; then
        log_ok "Disk space: ${available_gb} GB available (minimum: ${required_gb} GB)"
        return 0
    else
        log_error "Low disk space: ${available_gb} GB available (minimum: ${required_gb} GB required)"
        return 1
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  USER AGENT ROTATION
#  Rotate between modern browser User-Agent strings to avoid fingerprinting
# ═══════════════════════════════════════════════════════════════════════════════

rotate_user_agent() {
    local agents=(
        # Chrome on Windows (most common)
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        # Firefox on Windows
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0"
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0"
        # Chrome on macOS
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
        # Safari on macOS
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
        # Edge on Windows
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0"
        # Chrome on Linux
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
        # Firefox on Linux
        "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0"
        # Firefox on macOS
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:126.0) Gecko/20100101 Firefox/126.0"
        # Opera on Windows
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/110.0.0.0"
        # Chrome on Android (for mweb)
        "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"
    )
    local idx=$(( RANDOM % ${#agents[@]} ))
    echo "${agents[$idx]}"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  GITHUB API UTILITIES
#  Read and write files via the GitHub Contents API
# ═══════════════════════════════════════════════════════════════════════════════

# Read a file from GitHub repo (returns full API JSON response)
github_api_read() {
    local filepath="$1"
    local repo="${GITHUB_REPOSITORY:-}"
    local token="${GH_PAT:-}"
    
    if [[ -z "$repo" ]]; then
        log_error "GITHUB_REPOSITORY not set"
        return 1
    fi
    if [[ -z "$token" ]]; then
        log_error "GH_PAT not set"
        return 1
    fi
    
    local response
    response=$(curl -s -f \
        -H "Authorization: token $token" \
        -H "Accept: application/vnd.github.v3+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "https://api.github.com/repos/${repo}/contents/${filepath}" 2>/dev/null) || {
        log_warn "File not found or API error: $filepath"
        echo "{}"
        return 1
    }
    
    echo "$response"
}

# Read a file's decoded content from GitHub repo
github_api_read_content() {
    local filepath="$1"
    local response
    response=$(github_api_read "$filepath") || return 1
    
    local content
    content=$(echo "$response" | jq -r '.content // empty' 2>/dev/null)
    
    if [[ -z "$content" ]]; then
        log_warn "No content found for: $filepath"
        return 1
    fi
    
    echo "$content" | base64 -d 2>/dev/null
}

# Write/update a file in GitHub repo
github_api_write() {
    local filepath="$1"
    local content="$2"
    local message="${3:-📡 Auto-update: $filepath [$(now_pkt)]}"
    local repo="${GITHUB_REPOSITORY:-}"
    local token="${GH_PAT:-}"
    
    if [[ -z "$repo" ]]; then
        log_error "GITHUB_REPOSITORY not set"
        return 1
    fi
    if [[ -z "$token" ]]; then
        log_error "GH_PAT not set"
        return 1
    fi
    
    # Get current file SHA (required for updates)
    local sha=""
    local existing
    existing=$(curl -s \
        -H "Authorization: token $token" \
        -H "Accept: application/vnd.github.v3+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "https://api.github.com/repos/${repo}/contents/${filepath}" 2>/dev/null)
    sha=$(echo "$existing" | jq -r '.sha // empty' 2>/dev/null)
    
    # Encode content to base64 (single line, no wrapping)
    local encoded
    encoded=$(echo -n "$content" | base64 -w 0)
    
    # Build JSON payload using jq (--arg properly JSON-escapes all values)
    local payload
    if [[ -n "$sha" ]]; then
        payload=$(jq -n \
            --arg msg     "$message" \
            --arg content "$encoded" \
            --arg sha     "$sha" \
            '{message: $msg, content: $content, sha: $sha}')
    else
        payload=$(jq -n \
            --arg msg     "$message" \
            --arg content "$encoded" \
            '{message: $msg, content: $content}')
    fi

    # Validate payload was produced — if jq failed, payload would be empty
    if [[ -z "$payload" ]] || ! echo "$payload" | jq -e . >/dev/null 2>&1; then
        log_error "Failed to build JSON payload for GitHub API write ($filepath)"
        log_debug "jq exit=$? payload_len=${#payload}"
        return 1
    fi

    # Write to temp file — avoids ALL shell-expansion / curl -d "$var" issues
    # that cause GitHub to return "Problems parsing JSON" for large payloads
    local payload_file
    payload_file=$(mktemp "/tmp/gha_payload_XXXXXX.json")
    printf '%s' "$payload" > "$payload_file"

    local response
    response=$(curl -s -X PUT \
        -H "Authorization: token $token" \
        -H "Accept: application/vnd.github.v3+json" \
        -H "Content-Type: application/json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "https://api.github.com/repos/${repo}/contents/${filepath}" \
        --data-binary "@${payload_file}" 2>/dev/null)

    rm -f "$payload_file"
    
    local commit_sha
    commit_sha=$(echo "$response" | jq -r '.commit.sha // empty' 2>/dev/null)
    
    if [[ -n "$commit_sha" ]]; then
        log_ok "File written to GitHub: $filepath (commit: ${commit_sha:0:7})"
        return 0
    else
        local err_msg
        err_msg=$(echo "$response" | jq -r '.message // empty' 2>/dev/null)
        log_error "Failed to write file to GitHub: $filepath"
        if [[ -n "$err_msg" ]]; then
            log_error "  GitHub API error: $err_msg"
            if [[ "$err_msg" == *"not accessible"* ]] || [[ "$err_msg" == *"Resource not accessible"* ]]; then
                log_error "  FIX: Your GH_PAT needs 'Contents: Read and write' permission"
                log_error "  Go to: GitHub → Settings → Developer settings → Personal access tokens"
                log_error "  Create a new token with 'repo' scope (classic) or 'Contents: Read and write' (fine-grained)"
            fi
        fi
        log_debug "Response: $response"
        return 1
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  NETWORK UTILITIES
#  HTTP helpers with retry logic
# ═══════════════════════════════════════════════════════════════════════════════

# Random sleep between requests to avoid rate limiting
random_sleep() {
    local min="${1:-2}"
    local max="${2:-8}"
    local delay=$(( RANDOM % (max - min + 1) + min ))
    log_debug "Sleeping for ${delay}s (rate limit protection)"
    sleep "$delay"
}

# Get current public IP address
get_public_ip() {
    curl -s --max-time 10 https://ifconfig.me 2>/dev/null || \
    curl -s --max-time 10 https://api.ipify.org 2>/dev/null || \
    curl -s --max-time 10 https://icanhazip.com 2>/dev/null || \
    echo "unknown"
}

# Retry a command with backoff
retry_command() {
    local max_attempts="${1:-3}"
    local delay="${2:-5}"
    local attempt=1
    shift 2
    
    while (( attempt <= max_attempts )); do
        log_debug "Attempt $attempt/$max_attempts: $*"
        if "$@"; then
            return 0
        fi
        
        if (( attempt < max_attempts )); then
            log_warn "Attempt $attempt failed, retrying in ${delay}s..."
            sleep "$delay"
            delay=$(( delay * 2 ))  # Exponential backoff
        fi
        (( attempt++ ))
    done
    
    log_error "All $max_attempts attempts failed for: $*"
    return 1
}

# ═══════════════════════════════════════════════════════════════════════════════
#  VIDEO UTILITIES
#  Helpers for video file analysis
# ═══════════════════════════════════════════════════════════════════════════════

# Get video duration in seconds using ffprobe
get_video_duration() {
    local file="$1"
    local duration
    duration=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$file" 2>/dev/null)
    duration="${duration%.*}"  # Remove decimals
    echo "${duration:-0}"
}

# Get video resolution
get_video_resolution() {
    local file="$1"
    local width height
    width=$(ffprobe -v quiet -select_streams v:0 -show_entries stream=width -of csv=p=0 "$file" 2>/dev/null)
    height=$(ffprobe -v quiet -select_streams v:0 -show_entries stream=height -of csv=p=0 "$file" 2>/dev/null)
    echo "${width:-0}x${height:-0}"
}

# Get file size in bytes
get_file_size() {
    local file="$1"
    stat -c %s "$file" 2>/dev/null || echo "0"
}

# Check if a file is a valid video (has video stream)
is_valid_video() {
    local file="$1"
    local min_size="${2:-102400}"  # 100 KB default minimum
    
    # Check file exists
    [[ ! -f "$file" ]] && return 1
    
    # Check minimum size
    local size
    size=$(get_file_size "$file")
    (( size < min_size )) && return 1
    
    # Check for video stream
    ffprobe -v quiet -show_streams "$file" 2>/dev/null | grep -q "codec_type=video"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  JSON UTILITIES
#  Helpers for building JSON payloads (used by Discord notifications)
# ═══════════════════════════════════════════════════════════════════════════════

# Escape a string for JSON embedding
json_escape() {
    local str="$1"
    # Use python for reliable JSON string escaping
    python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$str" 2>/dev/null | \
        sed 's/^"//; s/"$//' || \
        echo "$str" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\n/\\n/g; s/\t/\\t/g; s/\r/\\r/g'
}

# ═══════════════════════════════════════════════════════════════════════════════
#  GITHUB ACTIONS OUTPUT HELPERS
#  Set GitHub Actions outputs and environment variables
# ═══════════════════════════════════════════════════════════════════════════════

# Set a GitHub Actions output variable
set_output() {
    local name="$1"
    local value="$2"
    if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
        echo "${name}=${value}" >> "$GITHUB_OUTPUT"
    fi
    log_debug "Output: ${name}=${value}"
}

# Set a GitHub Actions environment variable
set_env() {
    local name="$1"
    local value="$2"
    if [[ -n "${GITHUB_ENV:-}" ]]; then
        echo "${name}=${value}" >> "$GITHUB_ENV"
    fi
    export "${name}=${value}"
    log_debug "Env: ${name}=${value}"
}

# Append to GitHub Actions step summary
append_summary() {
    local text="$1"
    if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
        echo "$text" >> "$GITHUB_STEP_SUMMARY"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  CONFIGURATION LOADER
#  Load configuration from config.env
# ═══════════════════════════════════════════════════════════════════════════════

load_config() {
    local config_file
    config_file="$(dirname "$(realpath "${BASH_SOURCE[0]}")")/config.env"
    
    if [[ -f "$config_file" ]]; then
        # shellcheck source=/dev/null
        source "$config_file"
        log_debug "Configuration loaded from: $config_file"
    else
        log_warn "Config file not found: $config_file — using defaults"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  INITIALIZATION
#  Auto-load config when this file is sourced
# ═══════════════════════════════════════════════════════════════════════════════

# Load configuration automatically
load_config
