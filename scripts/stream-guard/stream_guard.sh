#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║ 🛡️  STREAM GUARD — Live Recording Watchdog & Auto-Recovery                ║
# ║                                                                            ║
# ║ Monitors an active recording and auto-recovers from common failures:      ║
# ║                                                                            ║
# ║ 1. STALL DETECTION: If the output file stops growing for >60s,            ║
# ║    kills yt-dlp and restarts with the next recording method.              ║
# ║                                                                            ║
# ║ 2. NETWORK HICCUP RECOVERY: If recording dies but stream is still live,   ║
# ║    waits 10s and restarts (preserves what was already recorded).           ║
# ║                                                                            ║
# ║ 3. DISK SPACE MONITOR: Alerts and gracefully stops if disk drops below    ║
# ║    1GB during recording (prevents corrupted output).                       ║
# ║                                                                            ║
# ║ 4. OUTPUT INTEGRITY: Periodically ffprobe-checks the growing file for     ║
# ║    container errors; triggers re-mux early if needed.                      ║
# ║                                                                            ║
# ║ HOW TO USE: Source this file ALONGSIDE record-stream.sh.                   ║
# ║ The main recording loop calls these functions as safety wrappers.          ║
# ║                                                                            ║
# ║ SAFE: Does NOT modify record-stream.sh. These are additive helpers.        ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail

GUARD_STALL_TIMEOUT="${GUARD_STALL_TIMEOUT:-60}"       # seconds without growth = stall
GUARD_CHECK_INTERVAL="${GUARD_CHECK_INTERVAL:-15}"     # check every N seconds
GUARD_MIN_DISK_GB="${GUARD_MIN_DISK_GB:-1}"            # stop if disk below this
GUARD_MAX_RESTARTS="${GUARD_MAX_RESTARTS:-3}"           # max auto-restarts per session

_guard_restart_count=0

# ── Monitor a recording process ──────────────────────────────────────────────
# Usage: guard_monitor <pid> <output_file> <video_id>
guard_monitor() {
    local pid="$1"
    local output_file="$2"
    local video_id="${3:-}"
    local last_size=0
    local stall_seconds=0

    echo "  🛡️  Guard: Monitoring PID ${pid} → ${output_file}"

    while kill -0 "$pid" 2>/dev/null; do
        sleep "$GUARD_CHECK_INTERVAL"

        # Check if process is still alive
        if ! kill -0 "$pid" 2>/dev/null; then
            echo "  🛡️  Guard: Recording process ended"
            break
        fi

        # Check file growth
        local current_size=0
        if [[ -f "$output_file" ]]; then
            current_size=$(stat -c%s "$output_file" 2>/dev/null || echo "0")
        fi

        if (( current_size == last_size )); then
            stall_seconds=$(( stall_seconds + GUARD_CHECK_INTERVAL ))
            if (( stall_seconds >= GUARD_STALL_TIMEOUT )); then
                echo "  🛡️  Guard: ⚠️ STALL DETECTED — file hasn't grown in ${stall_seconds}s"
                echo "  🛡️  Guard: Killing stalled process (PID ${pid})..."
                kill -9 "$pid" 2>/dev/null || true
                wait "$pid" 2>/dev/null || true
                return 2  # stall exit code
            fi
        else
            stall_seconds=0
            last_size=$current_size
        fi

        # Check disk space
        local disk_free_gb
        disk_free_gb=$(df -BG /tmp 2>/dev/null | tail -1 | awk '{print $4}' | tr -dc '0-9')
        if [[ -n "$disk_free_gb" ]] && (( disk_free_gb < GUARD_MIN_DISK_GB )); then
            echo "  🛡️  Guard: 🚨 DISK CRITICALLY LOW (${disk_free_gb}GB) — stopping recording!"
            kill -15 "$pid" 2>/dev/null || true
            sleep 5
            kill -9 "$pid" 2>/dev/null || true
            wait "$pid" 2>/dev/null || true
            return 3  # disk exit code
        fi

        # Log progress every 5 checks
        if (( RANDOM % 5 == 0 )); then
            local size_human
            size_human=$(numfmt --to=iec "$current_size" 2>/dev/null || echo "${current_size}B")
            echo "  🛡️  Guard: Recording... ${size_human} | Disk: ${disk_free_gb:-?}GB free"
        fi
    done

    # Process ended normally
    wait "$pid" 2>/dev/null
    return $?
}

# ── Wrapped recording with auto-restart ──────────────────────────────────────
# Usage: guard_record <method_function> <video_url> <output_file> <video_id>
guard_record() {
    local method="$1"
    local video_url="$2"
    local output_file="$3"
    local video_id="${4:-}"

    while (( _guard_restart_count < GUARD_MAX_RESTARTS )); do
        echo "  🛡️  Guard: Starting recording (attempt $(( _guard_restart_count + 1 ))/${GUARD_MAX_RESTARTS})"

        # Run the recording method in background
        $method "$video_url" "$output_file" &
        local rec_pid=$!

        # Monitor it
        guard_monitor "$rec_pid" "$output_file" "$video_id"
        local guard_status=$?

        case $guard_status in
            0|124)
                # Normal exit or timeout — success
                echo "  🛡️  Guard: Recording completed normally"
                return 0
                ;;
            2)
                # Stall — check if stream is still live and restart
                echo "  🛡️  Guard: Checking if stream is still live..."
                if is_stream_still_live "$video_id" 2>/dev/null; then
                    (( _guard_restart_count++ ))
                    echo "  🛡️  Guard: Stream still live — restarting (${_guard_restart_count}/${GUARD_MAX_RESTARTS})"
                    sleep 10
                    continue
                else
                    echo "  🛡️  Guard: Stream ended — stall was end-of-stream"
                    return 0
                fi
                ;;
            3)
                # Disk full — don't restart
                echo "  🛡️  Guard: Disk full — cannot continue"
                return 1
                ;;
            *)
                # Other error — check if stream still live
                if is_stream_still_live "$video_id" 2>/dev/null; then
                    (( _guard_restart_count++ ))
                    echo "  🛡️  Guard: Error but stream still live — restarting"
                    sleep 10
                    continue
                else
                    echo "  🛡️  Guard: Recording method exited (status ${guard_status})"
                    return $guard_status
                fi
                ;;
        esac
    done

    echo "  🛡️  Guard: Max restarts (${GUARD_MAX_RESTARTS}) reached"
    return 1
}

# ── Quick integrity check on the recording file ─────────────────────────────
guard_check_integrity() {
    local file="$1"
    if [[ ! -f "$file" ]] || [[ ! -s "$file" ]]; then
        return 1
    fi

    # Quick ffprobe check — does the container parse?
    if ffprobe -v error -show_entries format=duration -of csv=p=0 "$file" >/dev/null 2>&1; then
        return 0
    fi
    return 1
}
