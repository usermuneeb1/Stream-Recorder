#!/usr/bin/env python3
"""
🎞️  STORYBOARD GENERATOR — Hover-preview thumbnails for the player

For each recording, generates:
  • A single JPEG sprite sheet of frames (one every STORYBOARD_INTERVAL_SEC).
    Layout: COLS x N rows, each tile THUMB_W x THUMB_H pixels.
  • A WebVTT cues file that tells the player which sprite-coordinates to
    show for each second of the video.
  • Uploads both to Catbox (permanent CDN, no expiry).
  • Stores `storyboard` { url, vtt, interval, cols, w, h } in recordings.json.

The dashboard's <MediaPlayer> reads `storyboard` and shows a tooltip
preview as the user hovers the seek bar.

SAFE:
  - Standalone — does not touch existing scripts/workflows.
  - Skips recordings that already have a working storyboard.
  - Skips recordings under MIN_DURATION_SEC (default 10 min — too short to be useful).
  - Hard time-cap of 4 minutes per recording so a stuck ffmpeg never hangs CI.
  - Hard limit of MAX_ITEMS recordings per run (default 3) so the job never
    blows past GitHub's 30-min ceiling.

Env vars (all optional):
  STORYBOARD_MAX_ITEMS=3                 # how many recordings to process per run
  STORYBOARD_INTERVAL_SEC=10             # one frame every N seconds
  STORYBOARD_COLS=5                      # tiles per row in the sprite sheet
  STORYBOARD_THUMB_W=160                 # tile width  px
  STORYBOARD_THUMB_H=90                  # tile height px
  STORYBOARD_MIN_DURATION_SEC=600        # skip videos shorter than this
  STORYBOARD_FORCE=false                 # regenerate even if one already exists
"""
from __future__ import annotations
import json
import math
import os
import pathlib
import subprocess
import sys
import tempfile
import time
from typing import Optional

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
RECS = ROOT / "data" / "recordings.json"

# STORAGE STRATEGY
# ────────────────
# Storyboards used to be committed to dashboard/public/storyboards/ but that
# burns through GitHub's 1 GB soft repo limit fast (~500 KB per recording ×
# growing back-catalogue).
#
# Now we upload sprites + VTTs to a single shared Archive.org item, which
# gives us unlimited free storage with a global CDN. The item is bucketed
# by year-month so the file count per item stays manageable.
#
# Auth uses the same ARCHIVE_ACCESS_KEY / ARCHIVE_SECRET_KEY that the rest
# of the pipeline already has as repo secrets.
ARCHIVE_ACCESS_KEY = os.environ.get("ARCHIVE_ACCESS_KEY", "").strip()
ARCHIVE_SECRET_KEY = os.environ.get("ARCHIVE_SECRET_KEY", "").strip()
# Single permanent bucket — every storyboard sprite lives here under
# the video_id as filename. Saves on Archive.org item-creation rate limits.
ARCHIVE_ITEM = os.environ.get(
    "STORYBOARD_ARCHIVE_ITEM",
    "muslim-lantern-storyboards-v1",
)

MAX_ITEMS      = int(os.environ.get("STORYBOARD_MAX_ITEMS", "3"))
# 30s interval (was 10s) — 3× fewer frames means 3× faster ffmpeg pass.
# Long streams (3h) still get ~360 frames, plenty for hover previews.
INTERVAL_SEC   = int(os.environ.get("STORYBOARD_INTERVAL_SEC", "30"))
COLS           = int(os.environ.get("STORYBOARD_COLS", "10"))
# Smaller tiles (was 160×90 → 120×68) — half the pixels, much faster to
# encode and a smaller final JPEG to upload to free hosts.
THUMB_W        = int(os.environ.get("STORYBOARD_THUMB_W", "240"))
THUMB_H        = int(os.environ.get("STORYBOARD_THUMB_H", "135"))
MIN_DURATION   = int(os.environ.get("STORYBOARD_MIN_DURATION_SEC", "600"))
FORCE          = os.environ.get("STORYBOARD_FORCE", "false").lower() in ("1", "true", "yes")
# 8-minute ceiling (was 4) — long streams need more time to download frames
# from Archive.org over the network. ffmpeg itself is fast; the I/O is the
# bottleneck.
FFMPEG_TIMEOUT = int(os.environ.get("STORYBOARD_FFMPEG_TIMEOUT", "480"))


def log(msg: str) -> None:
    print(f"  🎞️  Storyboard: {msg}", flush=True)


def best_source_url(r: dict) -> str:
    """Pick the most reliable direct mp4 URL for ffmpeg to read from."""
    for key in ("archive_node", "archive_direct", "github_direct", "github_release"):
        u = r.get(key)
        if u:
            return u
    return ""


def ffprobe_duration(url: str) -> Optional[int]:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "csv=p=0", url],
            capture_output=True, text=True, timeout=30,
        )
        val = (out.stdout or "").strip()
        return int(float(val)) if val else None
    except Exception:
        return None


def build_sprite(source_url: str, duration: int, out_path: pathlib.Path) -> Optional[dict]:
    """
    Build a single sprite sheet using ffmpeg's tile filter. Returns a dict
    describing the layout, or None on failure.
    """
    n_frames = max(1, duration // INTERVAL_SEC)
    rows = math.ceil(n_frames / COLS)

    # ffmpeg filter:
    #   fps=1/INTERVAL → one frame every N seconds (input timing)
    #   scale         → resize to tile size
    #   tile          → pack into COLS×rows sprite sheet (only first n_frames)
    vf = (
        f"fps=1/{INTERVAL_SEC},"
        f"scale={THUMB_W}:{THUMB_H}:force_original_aspect_ratio=decrease,"
        f"pad={THUMB_W}:{THUMB_H}:(ow-iw)/2:(oh-ih)/2:color=black,"
        f"tile={COLS}x{rows}"
    )
    cmd = [
        "ffmpeg", "-y",
        "-hide_banner", "-loglevel", "error",
        "-i", source_url,
        "-vf", vf,
        "-frames:v", "1",
        "-q:v", "3",   # JPEG quality (1=best,31=worst); 3 is sharper for 240×135
        str(out_path),
    ]
    log(f"running ffmpeg ({n_frames} tiles, {COLS}×{rows}, ~{THUMB_W*COLS}×{THUMB_H*rows}px)")
    started = time.time()
    try:
        subprocess.run(cmd, capture_output=True, timeout=FFMPEG_TIMEOUT, check=True)
    except subprocess.TimeoutExpired:
        log(f"ffmpeg timed out after {FFMPEG_TIMEOUT}s")
        return None
    except subprocess.CalledProcessError as e:
        log(f"ffmpeg failed: {(e.stderr or b'').decode('utf-8', 'replace')[:200]}")
        return None

    elapsed = int(time.time() - started)
    size = out_path.stat().st_size if out_path.exists() else 0
    if size < 5000:
        log(f"sprite output too small ({size} bytes) — discarding")
        return None
    log(f"sprite built in {elapsed}s ({size//1024} KB)")

    return {
        "n_frames": n_frames,
        "rows": rows,
        "cols": COLS,
        "w": THUMB_W,
        "h": THUMB_H,
        "interval": INTERVAL_SEC,
    }


def build_vtt(meta: dict, sprite_url: str, duration: int) -> str:
    """
    Build a WebVTT thumbnail cues file. Format example:

        WEBVTT

        00:00:00.000 --> 00:00:10.000
        https://...sprite.jpg#xywh=0,0,160,90
    """
    out = ["WEBVTT", ""]
    interval = meta["interval"]
    w, h, cols = meta["w"], meta["h"], meta["cols"]
    n = meta["n_frames"]

    def fmt(s: int) -> str:
        h_, rem = divmod(s, 3600)
        m_, s_ = divmod(rem, 60)
        return f"{h_:02d}:{m_:02d}:{s_:02d}.000"

    for i in range(n):
        start = i * interval
        end = min((i + 1) * interval, duration)
        if end <= start:
            break
        col = i % cols
        row = i // cols
        x = col * w
        y = row * h
        out.append(f"{fmt(start)} --> {fmt(end)}")
        out.append(f"{sprite_url}#xywh={x},{y},{w},{h}")
        out.append("")
    return "\n".join(out)


def upload_archive(path: pathlib.Path, remote_name: str, content_type: str) -> Optional[str]:
    """Upload a single file to the shared Archive.org storyboards item.
    Returns the public download URL on success, None on failure.

    Uses the same S3-compatible endpoint + LOW auth pattern that the rest
    of the pipeline already uses for video uploads (see url-to-cloud.yml
    line 231). Includes x-archive-auto-make-bucket so the item is created
    on first upload — subsequent uploads just add new files to it.
    """
    if not ARCHIVE_ACCESS_KEY or not ARCHIVE_SECRET_KEY:
        log("ARCHIVE_ACCESS_KEY / ARCHIVE_SECRET_KEY not set — cannot upload")
        return None
    url = f"https://s3.us.archive.org/{ARCHIVE_ITEM}/{remote_name}"
    cmd = [
        "curl", "-sS", "--max-time", "300",
        "-o", "/dev/null", "-w", "%{http_code}",
        "-H", f"authorization: LOW {ARCHIVE_ACCESS_KEY}:{ARCHIVE_SECRET_KEY}",
        "-H", "x-archive-auto-make-bucket: 1",
        "-H", "x-archive-meta-title: Muslim Lantern Storyboards",
        "-H", "x-archive-meta-creator: Stream Recorder Bot",
        "-H", "x-archive-meta-description: Hover-preview sprite sheets and WebVTT cues for the dashboard player.",
        "-H", "x-archive-meta-mediatype: image",
        "-H", "x-archive-meta-collection: opensource_media",
        "-H", f"Content-Type: {content_type}",
        "--upload-file", str(path),
        url,
    ]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=360)
        http = (out.stdout or "").strip()
        if http.startswith("2"):
            # Public download URL (CDN-fronted, edge-cached worldwide)
            return f"https://archive.org/download/{ARCHIVE_ITEM}/{remote_name}"
        log(f"archive.org returned HTTP {http} for {remote_name}: {(out.stderr or '')[:120]}")
    except Exception as e:
        log(f"archive.org upload error for {remote_name}: {e}")
    return None


def pick_candidates(data: list[dict]) -> list[dict]:
    """Return recordings that don't already have a working storyboard."""
    out = []
    for r in data:
        if not (r.get("channel", "").lower().find("muslim lantern") >= 0):
            continue
        dur = int(r.get("duration_sec", 0) or 0)
        if dur < MIN_DURATION:
            continue
        if not best_source_url(r):
            continue
        if not FORCE and isinstance(r.get("storyboard"), dict) and r["storyboard"].get("url"):
            continue
        out.append(r)
    # newest first
    out.sort(key=lambda x: x.get("date", ""), reverse=True)
    return out[:MAX_ITEMS]


def main() -> int:
    if not RECS.exists():
        log("recordings.json missing")
        return 0

    data = json.loads(RECS.read_text())
    candidates = pick_candidates(data)
    if not candidates:
        log("no candidates need storyboards — nothing to do")
        return 0

    log(f"processing {len(candidates)} recording(s)")

    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        updated = 0

        for rec in candidates:
            vid = rec.get("video_id", "")
            src = best_source_url(rec)
            duration = int(rec.get("duration_sec", 0) or 0)
            log(f"── {vid} — {rec.get('title','')[:60]} ({duration//60} min)")

            # Generate sprite into a tmp file (Archive.org-hosted, NOT git-hosted).
            sprite_path = tmp / f"{vid}.jpg"
            meta = build_sprite(src, duration, sprite_path)
            if not meta:
                log("  ✗ sprite generation failed — skipping")
                continue

            sprite_url = upload_archive(sprite_path, f"{vid}.jpg", "image/jpeg")
            if not sprite_url:
                log("  ✗ sprite upload to Archive.org failed — skipping")
                continue
            log(f"  ✓ sprite uploaded: {sprite_url}")

            vtt_path = tmp / f"{vid}.vtt"
            vtt_text = build_vtt(meta, sprite_url, duration)
            vtt_path.write_text(vtt_text)
            vtt_url = upload_archive(vtt_path, f"{vid}.vtt", "text/vtt")
            if not vtt_url:
                log("  ✗ vtt upload to Archive.org failed — skipping")
                continue
            log(f"  ✓ vtt uploaded:    {vtt_url}")

            rec["storyboard"] = {
                "url": sprite_url,
                "vtt": vtt_url,
                "interval": meta["interval"],
                "cols": meta["cols"],
                "rows": meta["rows"],
                "n_frames": meta["n_frames"],
                "w": meta["w"],
                "h": meta["h"],
                "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
            updated += 1

        if updated > 0:
            RECS.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
            log(f"✓ wrote {updated} storyboard entries to recordings.json")
        else:
            log("nothing successfully generated")

    return 0


if __name__ == "__main__":
    sys.exit(main())
