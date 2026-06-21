#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  🧠 GEMINI FLASH GUEST DETECTION — Vision-based (replaces OCR tesseract)    ║
# ║                                                                              ║
# ║  Uses Google Gemini Flash (free tier: 15 RPM, 1M tokens/day) to LOOK at     ║
# ║  video frames and identify guest names shown on screen.                      ║
# ║                                                                              ║
# ║  Why Gemini > tesseract OCR:                                                 ║
# ║  • Gemini understands CONTEXT (knows a name vs a logo vs chat text)          ║
# ║  • Reads stylized/overlaid text that tesseract misses                        ║
# ║  • Can see partial names, nicknames, handles                                 ║
# ║  • No false positives from shirt logos, donations, etc.                      ║
# ║                                                                              ║
# ║  Env: GEMINI_API_KEY (required — get free at aistudio.google.com)            ║
# ║       Falls back to tesseract OCR if GEMINI_API_KEY is not set.              ║
# ║                                                                              ║
# ║  SAFE: Does NOT replace detect-guests.py. This is called by enrich.py       ║
# ║        when GEMINI_API_KEY is available; otherwise falls back to OCR.        ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import base64
import json
import os
import re
import subprocess
import sys
import time

GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_KEY}"

SAMPLE_STEP = int(os.environ.get("GEMINI_SAMPLE_STEP", "60"))  # 1 frame per minute
MAX_FRAMES = int(os.environ.get("GEMINI_MAX_FRAMES", "30"))     # max frames to analyze
HOST_NAME = os.environ.get("GEMINI_HOST_NAME", "Muslim Lantern,Muhammed Ali,Muhammad Ali,M.A")


def log(msg):
    print(msg, flush=True)


def extract_frame_b64(url, t):
    """Extract a single frame as base64 JPEG."""
    result = subprocess.run(
        ["ffmpeg", "-y", "-ss", str(t), "-i", url, "-frames:v", "1",
         "-vf", "scale=1280:-1", "-f", "image2", "-vcodec", "mjpeg", "-q:v", "3", "pipe:1"],
        capture_output=True, timeout=30,
    )
    if result.returncode != 0 or not result.stdout:
        return None
    return base64.b64encode(result.stdout).decode("utf-8")


def ask_gemini(frames_b64, times):
    """Send frames to Gemini Flash and ask for guest names."""
    import requests

    host_names = [h.strip() for h in HOST_NAME.split(",")]
    host_str = ", ".join(host_names)

    # Build parts: text prompt + all frame images
    parts = [{
        "text": f"""You are analyzing frames from a YouTube live stream by The Muslim Lantern (host: {host_str}).

The stream is a debate/Q&A where guests join via video call. Each guest's name is shown as an on-screen caption/overlay on their video tile.

For each frame I'm sending (with timestamps), identify any GUEST NAMES visible on screen.

Rules:
- Only report GUEST names, NOT the host ({host_str})
- Only report names shown as on-screen text/captions, NOT chat messages
- Ignore: logos, shirt text, donation alerts, YouTube UI, chat overlay
- Report the FIRST time you see each unique guest (their join time)
- Format guest names properly (capitalize first letters)

Return ONLY a JSON array of objects, each with "time" (seconds) and "label" ("<Name> joins"):
[{{"time": 120, "label": "Rocco Donofrio joins"}}, ...]

If no guests found, return: [{{"time": 0, "label": "Stream starts"}}]

The frame timestamps are: {', '.join(f'{t}s' for t in times)}
"""
    }]

    for i, (b64, t) in enumerate(zip(frames_b64, times)):
        parts.append({"text": f"\n--- Frame at {t}s ({t//60}:{t%60:02d}) ---"})
        parts.append({
            "inlineData": {
                "mimeType": "image/jpeg",
                "data": b64
            }
        })

    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 1024,
        }
    }

    for attempt in range(3):
        try:
            resp = requests.post(GEMINI_URL, json=payload, timeout=120)
            if resp.status_code == 429:
                wait = 15
                log(f"   Rate limited, waiting {wait}s...")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            data = resp.json()

            # Extract text from response
            text = data["candidates"][0]["content"]["parts"][0]["text"]

            # Parse JSON from the response (might be wrapped in ```json...```)
            json_match = re.search(r'\[.*\]', text, re.DOTALL)
            if json_match:
                chapters = json.loads(json_match.group())
                return chapters
            return []
        except Exception as e:
            log(f"   Gemini attempt {attempt+1} failed: {e}")
            time.sleep(5)

    return []


def video_duration(url):
    p = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", url],
        capture_output=True)
    try:
        return int(float(p.stdout.decode().strip()))
    except Exception:
        return 0


def detect(url, duration=0):
    """Detect guests using Gemini Flash vision."""
    if not GEMINI_KEY:
        log("   ⚠️ GEMINI_API_KEY not set — falling back to OCR")
        return None  # Signal to caller to use OCR fallback

    if not duration:
        duration = video_duration(url)
    if not duration:
        log("   ⚠️ Could not determine duration")
        return None

    log(f"   🧠 Gemini Flash: analyzing {duration}s video, sampling every {SAMPLE_STEP}s...")

    # Sample frames evenly across the video
    times = []
    t = 30  # Skip first 30s (usually intro)
    while t < duration - 30 and len(times) < MAX_FRAMES:
        times.append(t)
        t += SAMPLE_STEP

    if not times:
        return [{"time": 0, "label": "Stream starts"}]

    # Extract frames
    frames = []
    valid_times = []
    for t in times:
        b64 = extract_frame_b64(url, t)
        if b64:
            frames.append(b64)
            valid_times.append(t)

    if not frames:
        log("   ⚠️ Could not extract any frames")
        return None

    log(f"   📸 Extracted {len(frames)} frames, sending to Gemini...")

    # Send to Gemini (batch — all frames in one request for context)
    # Split into batches of 10 frames to stay within limits
    all_chapters = []
    batch_size = 10
    for i in range(0, len(frames), batch_size):
        batch_frames = frames[i:i+batch_size]
        batch_times = valid_times[i:i+batch_size]
        log(f"   🔍 Batch {i//batch_size + 1}: frames {i+1}-{i+len(batch_frames)}")
        chapters = ask_gemini(batch_frames, batch_times)
        if chapters:
            all_chapters.extend(chapters)
        time.sleep(2)  # Rate limit buffer

    # Deduplicate by guest name (keep first occurrence)
    seen = set()
    unique = []
    for ch in sorted(all_chapters, key=lambda c: c.get("time", 0)):
        name = re.sub(r'\s+joins$', '', ch.get("label", ""), flags=re.IGNORECASE).strip().lower()
        if name and name not in seen and name != "stream starts":
            seen.add(name)
            unique.append(ch)

    # Always have "Stream starts" at 0
    if not unique or unique[0]["time"] > 30:
        unique.insert(0, {"time": 0, "label": "Stream starts"})

    # Filter out "leaves" — only joins
    unique = [c for c in unique if "leave" not in c.get("label", "").lower()]

    log(f"   ✅ Gemini found {len(unique)-1} guests")
    for c in unique:
        log(f"      {c['time']//60:02d}:{c['time']%60:02d}  {c['label']}")

    return unique


if __name__ == "__main__":
    if len(sys.argv) < 2:
        log("usage: detect-guests-gemini.py <video_url> [duration]")
        sys.exit(1)
    dur = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    result = detect(sys.argv[1], dur)
    if result:
        print(json.dumps(result, indent=2))
