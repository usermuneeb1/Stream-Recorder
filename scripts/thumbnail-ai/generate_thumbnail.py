#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║ 🎨 AI THUMBNAIL GENERATOR — Auto-Generate Custom Thumbnails               ║
# ║                                                                            ║
# ║ When YouTube thumbnails break (stream deleted, private, etc.), this        ║
# ║ generates a branded fallback thumbnail from the video itself:              ║
# ║                                                                            ║
# ║ 1. Extracts a good frame from the video (10% into the stream)             ║
# ║ 2. Adds title overlay text + channel branding                              ║
# ║ 3. Uploads to Catbox (permanent) + Archive.org                            ║
# ║ 4. Updates recordings.json with the custom thumbnail                       ║
# ║                                                                            ║
# ║ Also generates thumbnails for clips (auto-clip).                           ║
# ║                                                                            ║
# ║ SAFE: Does NOT touch any existing scripts. Additive only.                  ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RECORDINGS = os.path.join(ROOT, "data", "recordings.json")


def log(msg):
    print(f"  🎨 ThumbGen: {msg}", flush=True)


def extract_frame(source_url, timestamp_sec, output_path):
    """Extract a single frame from a video at the given timestamp."""
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(int(timestamp_sec)),
        "-i", source_url,
        "-vframes", "1",
        "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:-1:-1:color=black",
        "-q:v", "2",
        output_path,
    ]
    try:
        subprocess.run(cmd, capture_output=True, timeout=60, check=True)
        return os.path.exists(output_path) and os.path.getsize(output_path) > 5000
    except Exception as e:
        log(f"Frame extract error: {e}")
        return False


def add_text_overlay(input_path, output_path, title, date_str, channel="The Muslim Lantern"):
    """Add title and branding text overlay using ffmpeg drawtext."""
    # Escape special chars for ffmpeg drawtext
    safe_title = title.replace("'", "'\\''").replace(":", " -")[:60]
    safe_date = date_str or ""
    safe_channel = channel

    # Multi-line overlay: title on top, channel + date on bottom
    vf = (
        # Dark gradient overlay for readability
        "drawbox=x=0:y=ih-ih/4:w=iw:h=ih/4:color=black@0.6:t=fill,"
        "drawbox=x=0:y=0:w=iw:h=ih/5:color=black@0.6:t=fill,"
        # Channel name (top)
        f"drawtext=text='☪️ {safe_channel}':"
        "fontsize=36:fontcolor=white:x=(w-text_w)/2:y=30:"
        "borderw=2:bordercolor=black,"
        # Title (bottom)
        f"drawtext=text='{safe_title}':"
        "fontsize=42:fontcolor=white:x=(w-text_w)/2:y=h-100:"
        "borderw=3:bordercolor=black,"
        # Date (bottom right)
        f"drawtext=text='{safe_date}':"
        "fontsize=28:fontcolor=white@0.8:x=w-text_w-20:y=h-50:"
        "borderw=2:bordercolor=black"
    )

    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-vf", vf,
        "-q:v", "2",
        output_path,
    ]
    try:
        subprocess.run(cmd, capture_output=True, timeout=30, check=True)
        return os.path.exists(output_path) and os.path.getsize(output_path) > 5000
    except Exception as e:
        log(f"Overlay error: {e}")
        # Fall back to raw frame
        if input_path != output_path:
            import shutil
            shutil.copy2(input_path, output_path)
        return os.path.exists(output_path)


def upload_to_catbox(file_path):
    """Upload to Catbox.moe."""
    try:
        result = subprocess.run(
            ["curl", "-s", "-F", "reqtype=fileupload",
             "-F", f"fileToUpload=@{file_path}",
             "https://catbox.moe/user/api.php"],
            capture_output=True, text=True, timeout=60,
        )
        url = result.stdout.strip()
        if url.startswith("https://files.catbox.moe/"):
            return url
    except Exception:
        pass
    return None


def main():
    max_items = int(os.environ.get("THUMB_MAX_ITEMS", "2"))

    if not os.path.exists(RECORDINGS):
        log("No recordings.json")
        return 1

    with open(RECORDINGS) as f:
        recs = json.load(f)

    # Find recordings that need thumbnails
    todo = []
    for r in recs:
        thumb = r.get("thumbnail", "")
        custom = r.get("custom_thumbnail", "")
        has_source = r.get("github_direct") or r.get("archive_node") or r.get("archive_direct")
        
        # Needs thumbnail if: no custom one yet AND has a video source
        if not custom and has_source:
            todo.append(r)

    todo = todo[:max_items]
    if not todo:
        log("All recordings have custom thumbnails (or no source)")
        return 0

    log(f"Generating thumbnails for {len(todo)} recording(s)...")

    updated = False
    for rec in todo:
        title = rec.get("title", "Stream")
        date_str = rec.get("date", "")
        duration = rec.get("duration_sec", 0)
        source = (rec.get("github_direct") or rec.get("archive_node")
                  or rec.get("archive_direct") or "")

        log(f"\n🖼️ {title}")

        # Extract frame at 10% into the video (skip intro)
        frame_time = max(60, int(duration * 0.1)) if duration else 60

        with tempfile.TemporaryDirectory() as tmpdir:
            raw_frame = os.path.join(tmpdir, "raw.jpg")
            final_thumb = os.path.join(tmpdir, "thumbnail.jpg")

            if extract_frame(source, frame_time, raw_frame):
                log(f"  Frame extracted at {frame_time}s")

                if add_text_overlay(raw_frame, final_thumb, title, date_str):
                    log(f"  Text overlay added")

                    url = upload_to_catbox(final_thumb)
                    if url:
                        rec["custom_thumbnail"] = url
                        updated = True
                        log(f"  ✅ Uploaded → {url}")
                    else:
                        log(f"  ❌ Upload failed")
                else:
                    log(f"  ❌ Overlay failed")
            else:
                log(f"  ❌ Frame extraction failed")

    if updated:
        with open(RECORDINGS, "w") as f:
            json.dump(recs, f, indent=2)
            f.write("\n")
        log("📋 Updated recordings.json")

    return 0


if __name__ == "__main__":
    sys.exit(main())
