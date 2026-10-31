#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  System Status Generator                                                     ║
# ║  Aggregates the public data files into data/system-status.json + shields.io  ║
# ║  endpoint badges (data/badges/*.json) for the README and the dashboard.      ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import json
import os
import sys
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


def _num(v):
    """Coerce size_bytes-ish values (int/float/numeric-string) to float.

    String sizes crashed sum() with TypeError; garbage coerces to 0.
    """
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def main():
    # Windows consoles default to cp1252, which cannot encode the ✅ below
    # (crashed the script after it had already written everything). Ask for
    # UTF-8 so the summary print works everywhere; CI is UTF-8 already.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

    # The canonical index is not an optional input. Never turn a failed read,
    # malformed document, or wrong schema into a published zero-record archive.
    # Validate everything before the first write so the last good status and
    # badges remain intact on failure.
    try:
        with open(os.path.join(DATA, "recordings.json"), encoding="utf-8") as f:
            recordings = json.load(f)
    except (OSError, ValueError) as exc:
        print(f"❌ refusing to publish status: cannot read canonical recordings index: {exc}",
              file=sys.stderr)
        return 1
    if not isinstance(recordings, list) or not all(isinstance(r, dict) for r in recordings):
        print("❌ refusing to publish status: recordings.json must be an array of objects",
              file=sys.stderr)
        return 1
    if not recordings:
        print("❌ refusing to publish status: recordings.json is empty", file=sys.stderr)
        return 1
    # These are optional enrichment inputs. A wrong-shape optional document
    # must not take down status publication for an otherwise valid archive.
    stats = load(os.path.join(ROOT, "stats.json"), {})
    yt = load(os.path.join(DATA, "youtube-stats.json"), {})
    if not isinstance(stats, dict):
        print("⚠️ stats.json is not an object; omitting optional totals", file=sys.stderr)
        stats = {}
    if not isinstance(yt, dict):
        print("⚠️ youtube-stats.json is not an object; using unknown channel stats", file=sys.stderr)
        yt = {}

    total = len(recordings)
    total_gb = round(sum(_num(r.get("size_bytes")) for r in recordings) / 1073741824, 2)
    # Newest by date, not by file position (nothing guarantees [0] is latest).
    latest = max(recordings, key=lambda r: str(r.get("date", ""))) if recordings else {}

    status = {
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "recordings_total": total,
        "total_size_gb": total_gb,
        "total_hours": stats.get("total_hours"),
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
    # Mirror health is owned by the health sweep, not by this aggregation.
    # Preserve its last result across status refreshes (the dashboard reads it
    # from this document). A malformed previous status is not a canonical-input
    # failure, but also must not inject arbitrary fields into the new output.
    previous = load(os.path.join(DATA, "system-status.json"), {})
    if isinstance(previous, dict) and isinstance(previous.get("mirror_health"), dict):
        status["mirror_health"] = previous["mirror_health"]

    write(os.path.join(DATA, "system-status.json"), status)

    # README badges (no AI badge anymore, feature removed)
    write(os.path.join(BADGES, "recordings.json"), badge("recordings", total, "red"))
    write(os.path.join(BADGES, "storage.json"), badge("archived", f"{total_gb} GB", "orange"))
    write(os.path.join(BADGES, "subscribers.json"),
          badge("subscribers", status["youtube"]["subscribers"], "informational"))

    print(f"✅ status: {total} recordings, {total_gb} GB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
