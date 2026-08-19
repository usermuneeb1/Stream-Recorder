#!/usr/bin/env python3
"""Free speaker-diarization → guest segments for the dashboard.

Uses two open-source models (both free, no API key):
  - faster-whisper   : speech-to-text with per-segment timestamps
  - pyannote.audio   : speaker diarization ("SPEAKER_00", "SPEAKER_01", ...)

Pipeline:
  1. Diarize the audio → who is talking, when (start/end per speaker).
  2. Merge consecutive same-speaker turns into one appearance (join..leave).
  3. Ignore the single most-common speaker (assumed to be the HOST) and any
     speaker with a tiny total on-air time (noise) — only guests remain.
  4. Write draft guest segments to data/guests.json keyed by video id.

You then NAME each guest once (scripts/guests/add-guest.sh or editing the
JSON). Run in a GitHub Actions workflow (public repo → unlimited free minutes),
or locally:  pip install faster-whisper pyannote.audio

Usage:
  diarize.py <video_id> <media_file>
Example:
  diarize.py eIn7iwVa8fg /tmp/stream-recorder/MyStream_raw.mp4
"""
import json
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GUESTS_FILE = os.path.join(REPO_ROOT, "data", "guests.json")

# A speaker with less than this total on-air time is treated as noise, not a guest.
MIN_GUEST_TOTAL_SECONDS = 45
# Gap (seconds) below which two turns from the same speaker are merged into one visit.
MERGE_GAP_SECONDS = 30


def load_guests():
    if os.path.exists(GUESTS_FILE):
        with open(GUESTS_FILE) as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError:
                data = {}
    else:
        data = {}
    if not isinstance(data, dict):
        data = {}
    data.pop("_comment", None)
    return data


def save_guests(data):
    with open(GUESTS_FILE, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def diarize_turns(media_file, use_auth_token=None):
    """Return [{speaker, start, end}] in chronological order."""
    from pyannote.audio import Pipeline

    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        use_auth_token=use_auth_token,  # pyannote needs a free HF token
    )
    diarization = pipeline(media_file)
    turns = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        turns.append({"speaker": speaker, "start": turn.start, "end": turn.end})
    return sorted(turns, key=lambda t: t["start"])


def merge_visits(turns):
    """Collapse consecutive same-speaker turns into a single join..leave visit."""
    visits = []
    for t in turns:
        if visits and visits[-1]["speaker"] == t["speaker"] and t["start"] - visits[-1]["end"] <= MERGE_GAP_SECONDS:
            visits[-1]["end"] = t["end"]
        else:
            visits.append({"speaker": t["speaker"], "start": t["start"], "end": t["end"]})
    return visits


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 2

    video_id, media_file = sys.argv[1], sys.argv[2]
    hf_token = os.environ.get("HF_TOKEN", os.environ.get("HUGGINGFACE_TOKEN", None))

    print(f"→ diarizing {media_file} (this is CPU-bound; a 2h talk can take ~1h on a runner)")
    turns = diarize_turns(media_file, use_auth_token=hf_token)
    if not turns:
        print("✗ no speaker turns found")
        return 1

    visits = merge_visits(turns)

    # Host = the speaker with the most total on-air time. Exclude them + noise.
    totals = {}
    for v in visits:
        totals[v["speaker"]] = totals.get(v["speaker"], 0) + (v["end"] - v["start"])
    host = max(totals, key=totals.get)

    guests = [
        {"name": v["speaker"], "join": int(v["start"]), "leave": int(v["end"])}
        for v in visits
        if v["speaker"] != host and (v["end"] - v["start"]) >= MIN_GUEST_TOTAL_SECONDS
    ]

    if not guests:
        print("✗ only the host (single speaker) detected — no guests to write")
        return 0

    print(f"✓ host detected as {host!r} (excluded)")
    print("✓ draft guests (rename each with add-guest.sh):")
    for g in guests:
        print(f"   {g['name']}: {g['join']}s → {g['leave']}s")

    data = load_guests()
    data[video_id] = guests
    save_guests(data)
    print(f"✓ wrote {len(guests)} draft guest segments to data/guests.json")
    print("  NEXT: name each SPEAKER_xx → scripts/guests/add-guest.sh <video_id> \"Name\" <join> <leave>")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
