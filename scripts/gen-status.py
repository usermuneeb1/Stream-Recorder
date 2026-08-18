#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  📊 System Status Generator                                                  ║
# ║  Aggregates the public data files into data/system-status.json + shields.io  ║
# ║  endpoint badges (data/badges/*.json) for the README and the dashboard.      ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import json
import os
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
BADGES = os.path.join(DATA, "badges")


def load(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return default


def write(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f, indent=2)
        f.write("\n")


def badge(label, message, color):
    # shields.io "endpoint" schema
    return {"schemaVersion": 1, "label": label, "message": str(message), "color": color}


def main():
    recordings = load(os.path.join(DATA, "recordings.json"), [])
    yt = load(os.path.join(DATA, "youtube-stats.json"), {})

    total = len(recordings)
    total_gb = round(sum((r.get("size_bytes", 0) or 0) for r in recordings) / 1073741824, 2)
    # Hours derived from the canonical dataset — never trust drifted stats.json
    total_hours = round(sum((r.get("duration_sec", 0) or 0) for r in recordings) / 3600, 2)
    latest = recordings[0] if recordings else {}

    # Preserve the previous timestamp when nothing changed (zero git noise).
    prev = load(os.path.join(DATA, "system-status.json"), {})
    updated_at = time.strftime("%Y-%m-%dT%H:%M:%SZ")
    if isinstance(prev, dict) and prev.get("recordings_total") == total and prev.get("total_size_gb") == total_gb:
        if prev.get("total_hours") == total_hours and prev.get("latest_recording") == {
            "title": (recordings[0].get("title") if recordings else None),
            "date": (recordings[0].get("date") if recordings else None),
        }:
            updated_at = prev.get("updated_at") or updated_at

    status = {
        "updated_at": updated_at,
        "recordings_total": total,
        "total_size_gb": total_gb,
        "total_hours": total_hours,
        "latest_recording": {
            "title": latest.get("title"),
            "date": latest.get("date"),
        },
        "youtube": {
            "subscribers": f"{yt.get('subscribers','?')}{yt.get('subscribers_suffix','')}",
            "views": f"{yt.get('total_views','?')}{yt.get('views_suffix','')}",
            "videos": yt.get("video_count"),
        },
    }
    write(os.path.join(DATA, "system-status.json"), status)

    # README badges (no AI badge anymore — feature removed)
    write(os.path.join(BADGES, "recordings.json"), badge("recordings", total, "red"))
    write(os.path.join(BADGES, "storage.json"), badge("archived", f"{total_gb} GB", "orange"))
    write(os.path.join(BADGES, "subscribers.json"),
          badge("subscribers", status["youtube"]["subscribers"], "informational"))

    print(f"✅ status: {total} recordings, {total_gb} GB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
