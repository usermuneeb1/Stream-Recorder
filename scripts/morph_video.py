#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  👻 YOUTUBE GHOST-HOST — Safe Video Morphing Engine                        ║
# ║                                                                             ║
# ║  Applies minimal, imperceptible transformations to defeat automated         ║
# ║  Content ID matching while preserving watchable quality:                    ║
# ║    1. Subtle 0.5° rotation (undetectable to human eye)                      ║
# ║    2. Light noise floor (level 3, film-grain style)                         ║
# ║    3. Pitch shift 0.8% (cannot hear it, hash-based detectors hate it)      ║
# ║                                                                             ║
# ║  When SKIP_MORPH=true (env var), passes through clean — useful for          ║
# ║  unlisted backups where Content ID is not a concern.                        ║
# ║                                                                             ║
# ║  Usage:  python3 scripts/morph_video.py <input.mp4> <output.mp4>           ║
# ║  Env:    SKIP_MORPH=true   →  pass-through copy (no morphing)              ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import os
import subprocess
import sys


def get_video_duration(input_path: str) -> float:
    """Return duration in seconds via ffprobe."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "quiet",
                "-show_entries", "format=duration",
                "-of", "csv=p=0",
                input_path,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return float(result.stdout.strip())
    except (ValueError, subprocess.TimeoutExpired):
        return 0.0


def morph(input_path: str, output_path: str):
    """Apply gentle morphing or pass-through depending on SKIP_MORPH env."""

    skip = os.environ.get("SKIP_MORPH", "false").lower() in ("true", "1", "yes")

    if skip:
        print("   ⏭️  SKIP_MORPH=true — copying clean (no morphing applied)")
        subprocess.run(
            ["ffmpeg", "-y", "-i", input_path,
             "-c", "copy", "-movflags", "+faststart",
             output_path],
            check=True,
        )
        print(f"   ✅ Clean copy saved to {output_path}")
        return

    # ── Gentle morph parameters ──────────────────────────────────────────────
    #  rotate=0.5*PI/180  →  0.5° rotation (not the aggressive 3°)
    #  noise=alls=3:allf=t → level 3 noise (film grain, nearly invisible)
    #  asetrate=44100*1.008 → 0.8% pitch shift (imperceptible)
    #
    # These values are intentionally MINIMAL — just enough to change the
    # binary fingerprint without affecting watchability.
    #
    # The rotate uses a black fill color (which gets mostly cropped out
    # by the player's viewport; if the source is already 1080p, the
    # slight crop at edges is invisible).

    duration = get_video_duration(input_path)
    print(f"   🎬 Input: {os.path.basename(input_path)} ({duration:.0f}s)")

    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-vf", "rotate=0.5*PI/180:fillcolor=black,noise=alls=3:allf=t+u",
        "-af", "asetrate=44100*1.008,aresample=44100",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        "-max_muxing_queue_size", "4096",
        output_path,
    ]

    print("   👻 Applying gentle morph (0.5° rotate, 0.8% pitch, level-3 noise)...")
    subprocess.run(cmd, check=True)

    out_size = os.path.getsize(output_path)
    in_size = os.path.getsize(input_path)
    ratio = (out_size / in_size * 100) if in_size else 0
    print(f"   ✅ Morphed video saved to {output_path}")
    print(f"   📊 Size: {out_size / 1024 / 1024:.1f} MB ({ratio:.0f}% of original)")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 scripts/morph_video.py <input.mp4> <output.mp4>")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    if not os.path.exists(input_path):
        print(f"❌ Input file not found: {input_path}")
        sys.exit(1)

    morph(input_path, output_path)
