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
# Sprites + VTTs live in the dashboard's public folder so Vercel serves
# them statically from its edge CDN. No third-party host needed — Catbox
# and 0x0.st both stopped accepting uploads from GitHub Actions IPs.
STORYBOARDS_DIR = ROOT / "dashboard" / "public" / "storyboards"
# jsDelivr serves any file in the repo for free with global CDN caching.
# Use this as the public URL so dev environments work without Vercel too.
JSDELIVR_BASE = "https://cdn.jsdelivr.net/gh/usermuneeb1/Stream-Recorder@main/dashboard/public/storyboards"

MAX_ITEMS      = int(os.environ.get("STORYBOARD_MAX_ITEMS", "3"))
# 30s interval (was 10s) — 3× fewer frames means 3× faster ffmpeg pass.
# Long streams (3h) still get ~360 frames, plenty for hover previews.
INTERVAL_SEC   = int(os.environ.get("STORYBOARD_INTERVAL_SEC", "30"))
COLS           = int(os.environ.get("STORYBOARD_COLS", "10"))
# Smaller tiles (was 160×90 → 120×68) — half the pixels, much faster to
# encode and a smaller final JPEG to upload to free hosts.
THUMB_W        = int(os.environ.get("STORYBOARD_THUMB_W", "120"))
THUMB_H        = int(os.environ.get("STORYBOARD_THUMB_H", "68"))
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
        "-q:v", "5",   # JPEG quality (1=best,31=worst); 5 is small + sharp enough
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


def upload_catbox(path: pathlib.Path) -> Optional[str]:
    """Upload a file to catbox.moe and return the permanent URL."""
    try:
        out = subprocess.run(
            ["curl", "-sS", "--max-time", "120",
             "-A", "Mozilla/5.0 (X11; Linux x86_64) Stream-Recorder/1.0",
             "-F", "reqtype=fileupload",
             "-F", f"fileToUpload=@{path}",
             "https://catbox.moe/user/api.php"],
            capture_output=True, text=True, timeout=150,
        )
        url = (out.stdout or "").strip()
        if url.startswith("https://"):
            return url
        log(f"catbox returned: {url[:120]}")
    except Exception as e:
        log(f"catbox upload error: {e}")
    return None


def upload_0x0(path: pathlib.Path) -> Optional[str]:
    """Upload to 0x0.st as a fallback when Catbox rejects."""
    try:
        out = subprocess.run(
            ["curl", "-sS", "--max-time", "120",
             "-A", "Stream-Recorder/1.0 (storyboard generator)",
             "-F", f"file=@{path}",
             "-F", "expires=8760",   # 1 year retention (max for 0x0.st)
             "https://0x0.st"],
            capture_output=True, text=True, timeout=150,
        )
        url = (out.stdout or "").strip()
        if url.startswith("https://0x0.st/"):
            return url
        log(f"0x0.st returned: {url[:120]}")
    except Exception as e:
        log(f"0x0.st upload error: {e}")
    return None


def upload_anywhere(path: pathlib.Path) -> Optional[str]:
    """Try every supported anonymous file host until one accepts the upload.
    Catbox is preferred (truly permanent, well-known); 0x0.st is the
    fallback (also permanent for 1y, more lenient on user-agents and IPs).
    """
    url = upload_catbox(path)
    if url:
        return url
    log("  catbox rejected — trying 0x0.st fallback")
    url = upload_0x0(path)
    if url:
        return url
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

            # Generate sprite directly into the public storyboards dir.
            STORYBOARDS_DIR.mkdir(parents=True, exist_ok=True)
            sprite_path = STORYBOARDS_DIR / f"{vid}.jpg"
            meta = build_sprite(src, duration, sprite_path)
            if not meta:
                log("  ✗ sprite generation failed — skipping")
                continue
            sprite_url = f"{JSDELIVR_BASE}/{vid}.jpg"
            log(f"  ✓ sprite saved:    {sprite_path.relative_to(ROOT)}")

            vtt_path = STORYBOARDS_DIR / f"{vid}.vtt"
            vtt_text = build_vtt(meta, sprite_url, duration)
            vtt_path.write_text(vtt_text)
            vtt_url = f"{JSDELIVR_BASE}/{vid}.vtt"
            log(f"  ✓ vtt saved:       {vtt_path.relative_to(ROOT)}")

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
