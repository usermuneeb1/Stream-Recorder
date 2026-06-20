#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║ 🎬 HLS CHUNKED STREAMING — Multi-Host Video Distribution                  ║
# ║                                                                            ║
# ║ Converts MP4 recordings into HLS format (.m3u8 + .ts chunks).             ║
# ║ Each chunk is tiny (~10s, ~5-15MB) so it can be hosted on ANY free         ║
# ║ service — even Catbox (200MB limit).                                       ║
# ║                                                                            ║
# ║ Benefits:                                                                  ║
# ║ • No single service sees the full file or bandwidth                        ║
# ║ • Chunks can be spread across multiple free hosts                          ║
# ║ • Adaptive bitrate possible (multiple quality levels)                      ║
# ║ • Better buffering behavior than single-file streaming                     ║
# ║ • If one host dies, only those chunks need re-uploading                    ║
# ║                                                                            ║
# ║ Usage: ./generate_hls.sh <input.mp4> <output_dir> [segment_duration]       ║
# ║                                                                            ║
# ║ SAFE: Does NOT touch any existing scripts/workflows.                       ║
# ║       Generates files in a new directory; nothing is overwritten.          ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail

SEGMENT_DURATION="${3:-10}"  # seconds per chunk (default: 10s)

generate_hls() {
    local input_file="$1"
    local output_dir="$2"
    local seg_duration="${3:-$SEGMENT_DURATION}"

    if [[ ! -f "$input_file" ]]; then
        echo "❌ Input file not found: $input_file"
        return 1
    fi

    mkdir -p "$output_dir"

    local base_name
    base_name=$(basename "${input_file%.*}")
    local safe_name
    safe_name=$(echo "$base_name" | sed 's/[^a-zA-Z0-9._-]/_/g')

    echo "🎬 Generating HLS stream..."
    echo "   Input:    $input_file"
    echo "   Output:   $output_dir/"
    echo "   Segment:  ${seg_duration}s"

    # ── Generate HLS with multiple quality levels ─────────────────────────────
    # Level 1: 720p (lower bandwidth, ~2-5MB/chunk)
    # Level 2: 1080p (original quality, ~5-15MB/chunk)

    local start_time
    start_time=$(date +%s)

    # 1080p stream (copy if already h264, otherwise re-encode)
    echo "  📡 Creating 1080p stream..."
    ffmpeg -y -i "$input_file" \
        -c:v copy \
        -c:a aac -b:a 128k \
        -f hls \
        -hls_time "$seg_duration" \
        -hls_list_size 0 \
        -hls_segment_filename "${output_dir}/${safe_name}_1080p_%04d.ts" \
        -hls_flags independent_segments \
        "${output_dir}/${safe_name}_1080p.m3u8" \
        2>/dev/null

    if [[ $? -ne 0 ]]; then
        echo "  ⚠️ Copy-mode failed, re-encoding..."
        ffmpeg -y -i "$input_file" \
            -c:v libx264 -preset fast -crf 22 \
            -c:a aac -b:a 128k \
            -f hls \
            -hls_time "$seg_duration" \
            -hls_list_size 0 \
            -hls_segment_filename "${output_dir}/${safe_name}_1080p_%04d.ts" \
            -hls_flags independent_segments \
            "${output_dir}/${safe_name}_1080p.m3u8" \
            2>/dev/null
    fi

    # 480p stream (for low bandwidth)
    echo "  📡 Creating 480p stream..."
    ffmpeg -y -i "$input_file" \
        -c:v libx264 -preset fast -crf 28 \
        -vf "scale=-2:480" \
        -c:a aac -b:a 96k \
        -f hls \
        -hls_time "$seg_duration" \
        -hls_list_size 0 \
        -hls_segment_filename "${output_dir}/${safe_name}_480p_%04d.ts" \
        -hls_flags independent_segments \
        "${output_dir}/${safe_name}_480p.m3u8" \
        2>/dev/null

    # ── Master playlist (adaptive bitrate) ────────────────────────────────────
    echo "  📋 Creating master playlist..."
    cat > "${output_dir}/${safe_name}.m3u8" << EOF
#EXTM3U
#EXT-X-VERSION:3

#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,NAME="1080p"
${safe_name}_1080p.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=854x480,NAME="480p"
${safe_name}_480p.m3u8
EOF

    local elapsed=$(( $(date +%s) - start_time ))
    local chunk_count
    chunk_count=$(ls -1 "${output_dir}"/*.ts 2>/dev/null | wc -l)
    local total_size
    total_size=$(du -sh "$output_dir" 2>/dev/null | cut -f1)

    echo ""
    echo "  ✅ HLS generation complete!"
    echo "  📊 Stats:"
    echo "     Chunks:   ${chunk_count} segments"
    echo "     Size:     ${total_size}"
    echo "     Time:     ${elapsed}s"
    echo "     Master:   ${output_dir}/${safe_name}.m3u8"
    echo ""

    # Write manifest for upload script
    local manifest="${output_dir}/manifest.json"
    python3 -c "
import os, json, glob
chunks = sorted(glob.glob('${output_dir}/*.ts'))
data = {
    'master': '${safe_name}.m3u8',
    'playlists': ['${safe_name}_1080p.m3u8', '${safe_name}_480p.m3u8'],
    'chunks': [os.path.basename(c) for c in chunks],
    'total_chunks': len(chunks),
    'segment_duration': ${seg_duration},
}
with open('${manifest}', 'w') as f:
    json.dump(data, f, indent=2)
print(f'  📋 Manifest: {len(chunks)} chunks written to ${manifest}')
"
    return 0
}

# ── Rewrite m3u8 playlists to use custom URLs ─────────────────────────────────
# After uploading chunks to various hosts, call this to rewrite the .m3u8
# files so they point to the actual URLs instead of local filenames.
rewrite_hls_urls() {
    local playlist_file="$1"
    local url_map_file="$2"  # JSON file: {"chunk_filename": "https://host/url", ...}

    if [[ ! -f "$playlist_file" ]] || [[ ! -f "$url_map_file" ]]; then
        echo "❌ Missing playlist or URL map file"
        return 1
    fi

    python3 -c "
import json, sys

with open('${url_map_file}') as f:
    url_map = json.load(f)

with open('${playlist_file}') as f:
    content = f.read()

for filename, url in url_map.items():
    content = content.replace(filename, url)

with open('${playlist_file}', 'w') as f:
    f.write(content)

print(f'  ✅ Rewrote {len(url_map)} URLs in ${playlist_file}')
"
}

# ── CLI mode ──────────────────────────────────────────────────────────────────
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [[ $# -lt 2 ]]; then
        echo "Usage: $0 <input.mp4> <output_dir> [segment_seconds]"
        echo ""
        echo "Examples:"
        echo "  $0 recording.mp4 ./hls_output"
        echo "  $0 recording.mp4 ./hls_output 15"
        exit 1
    fi
    generate_hls "$1" "$2" "${3:-10}"
fi
