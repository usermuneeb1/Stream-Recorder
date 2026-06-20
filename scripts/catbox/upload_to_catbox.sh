#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║ 🐱 CATBOX.MOE — Free Permanent File Hosting (200MB/file)                  ║
# ║                                                                            ║
# ║ No account needed. No expiry. Direct hotlink URLs.                         ║
# ║ Perfect for: thumbnails, chat logs, transcripts, subtitles,                ║
# ║              short clips, and small recordings.                            ║
# ║                                                                            ║
# ║ For files > 200MB: uses Litterbox (temp hosting, 72h) as overflow.         ║
# ║                                                                            ║
# ║ SAFE: Does NOT touch any existing scripts/workflows.                       ║
# ║       Standalone upload utility; call from upload-clouds.sh if desired.    ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail

CATBOX_MAX_SIZE=$((200 * 1024 * 1024))  # 200 MB
LITTERBOX_MAX_SIZE=$((1024 * 1024 * 1024))  # 1 GB
CATBOX_API="https://catbox.moe/user/api.php"
LITTERBOX_API="https://litterbox.catbox.moe/resources/internals/api.php"
MAX_RETRIES=3

# ── Upload to Catbox (permanent, ≤200MB) ──────────────────────────────────────
upload_to_catbox() {
    local file="$1"
    local file_size
    file_size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null)

    if (( file_size > CATBOX_MAX_SIZE )); then
        echo "⚠️ Catbox: File too large ($(numfmt --to=iec "$file_size")), trying Litterbox..."
        upload_to_litterbox "$file"
        return $?
    fi

    local attempt=1
    while (( attempt <= MAX_RETRIES )); do
        echo "  🐱 Catbox: Uploading $(basename "$file") (attempt ${attempt}/${MAX_RETRIES})..."

        local response
        response=$(curl -s --max-time 600 \
            -F "reqtype=fileupload" \
            -F "fileToUpload=@${file}" \
            "$CATBOX_API" 2>/dev/null) || true

        # Catbox returns the direct URL on success (e.g. https://files.catbox.moe/xxxxx.mp4)
        if [[ "$response" == https://files.catbox.moe/* ]]; then
            echo "  ✅ Catbox: Upload complete → $response"
            echo "$response"
            return 0
        fi

        echo "  ⚠️ Catbox: Failed (attempt ${attempt}) — ${response:0:200}"
        (( attempt++ ))
        sleep 5
    done

    echo "  ❌ Catbox: All ${MAX_RETRIES} attempts failed"
    return 1
}

# ── Upload to Litterbox (temporary, ≤1GB, 72h) ───────────────────────────────
upload_to_litterbox() {
    local file="$1"
    local expiry="${2:-72h}"  # 1h, 12h, 24h, 72h

    local file_size
    file_size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null)

    if (( file_size > LITTERBOX_MAX_SIZE )); then
        echo "  ❌ Litterbox: File too large ($(numfmt --to=iec "$file_size")), max 1GB"
        return 1
    fi

    local attempt=1
    while (( attempt <= MAX_RETRIES )); do
        echo "  🗑️ Litterbox: Uploading $(basename "$file") (${expiry} expiry, attempt ${attempt}/${MAX_RETRIES})..."

        local response
        response=$(curl -s --max-time 600 \
            -F "reqtype=fileupload" \
            -F "time=${expiry}" \
            -F "fileToUpload=@${file}" \
            "$LITTERBOX_API" 2>/dev/null) || true

        if [[ "$response" == https://litter.catbox.moe/* ]]; then
            echo "  ✅ Litterbox: Upload complete (expires in ${expiry}) → $response"
            echo "$response"
            return 0
        fi

        echo "  ⚠️ Litterbox: Failed (attempt ${attempt}) — ${response:0:200}"
        (( attempt++ ))
        sleep 5
    done

    echo "  ❌ Litterbox: All ${MAX_RETRIES} attempts failed"
    return 1
}

# ── CLI mode ──────────────────────────────────────────────────────────────────
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [[ $# -lt 1 ]]; then
        echo "Usage: $0 <file> [expiry]"
        echo "  expiry: only used for Litterbox fallback (1h, 12h, 24h, 72h)"
        exit 1
    fi
    upload_to_catbox "$1"
fi
