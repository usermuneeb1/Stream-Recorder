#!/usr/bin/env python3
"""Normalize data/recordings.json after the schema-conflict corruption.

Fixes three concrete bugs that broke playback:
  1. video_id written as the Archive.org identifier (old update-links.sh
     schema) instead of the real YouTube id — breaks watch URLs + dedup.
  2. Duplicate records for the same stream (two scripts wrote the same
     recording with different schemas).
  3. Newest recordings missing archive_direct (the MP4 mirror), so the only
     playback source is the (now-private) original YouTube VOD — nothing plays.

archive_direct is derived deterministically from archive_link + title using the
same make_safe_filename() rule upload-clouds.sh applies, a pattern proven by the
already-enriched older records. archive_node (the 302 storage node) is left for
the CI backfill (needs network).

Usage:  python3 scripts/normalize-recordings.py [--write]
        (default prints a summary; --write rewrites data/recordings.json)
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REC = os.path.join(ROOT, "data", "recordings.json")

YT_ID = re.compile(r"(?:v=|youtu\.be/|/)([\w-]{11})")


def make_safe_filename(raw: str) -> str:
    safe = "".join(c if (c.isprintable()) else "" for c in raw)
    safe = re.sub(r"[^a-zA-Z0-9._\-]", "_", safe)
    safe = re.sub(r"__+", "_", safe)
    safe = safe[:200]
    return safe or f"recording_{0}.mp4"


def yt_id_of(rec: dict) -> str:
    """Stable identity = the ORIGINAL stream id from video_url (the source of
    truth), NOT youtube_id (which is the unlisted re-upload used for playback)."""
    vurl = rec.get("video_url", "")
    m = YT_ID.search(vurl or "")
    if m:
        return m.group(1)
    un = rec.get("youtube_unlisted", "")
    m = YT_ID.search(un or "")
    if m:
        return m.group(1)
    vid = rec.get("video_id", "")
    if vid and re.fullmatch(r"[\w-]{11}", vid):
        return vid
    return ""


def main():
    write = "--write" in sys.argv[1:]
    with open(REC) as f:
        data = json.load(f)

    changes = {"video_id_fixed": 0, "deduped": 0, "archive_direct_added": 0, "youtube_id_added": 0}

    # Pass 1: fix video_id to the original stream id (from video_url).
    for r in data:
        yt = yt_id_of(r)
        if yt and r.get("video_id") != yt:
            r["video_id"] = yt
            changes["video_id_fixed"] += 1

    # Pass 2: dedupe by YouTube id — merge fields, prefer non-empty.
    merged = {}
    order = []
    for r in data:
        yt = yt_id_of(r) or r.get("video_id", "")
        if not yt:
            continue
        if yt in merged:
            ex = merged[yt]
            for k, v in r.items():
                if v not in ("", None, [], {}) and not ex.get(k):
                    ex[k] = v
            changes["deduped"] += 1
        else:
            merged[yt] = dict(r)
            order.append(yt)

    out = [merged[k] for k in order]

    # Pass 3: derive archive_direct where missing but archive_link present.
    # Filename = make_safe_filename(FULL title) + ".mp4" (proven by old records).
    for r in out:
        if not r.get("archive_direct") and r.get("archive_link"):
            ident = r["archive_link"].rstrip("/").split("/details/")[-1]
            fname = make_safe_filename(r.get("title", "")) + ".mp4"
            r["archive_direct"] = f"https://archive.org/download/{ident}/{fname}"
            changes["archive_direct_added"] += 1

    # Pass 4: repair empty video_url (the dashboard's dedup drops records
    # without a valid watch URL). Use youtube_id / youtube_unlisted / video_id.
    for r in out:
        if not YT_ID.search(r.get("video_url", "") or ""):
            for src in ("youtube_id", "youtube_unlisted", "video_id"):
                v = r.get(src, "") or ""
                m = YT_ID.search(v)
                if m:
                    r["video_url"] = f"https://www.youtube.com/watch?v={m.group(1)}"
                    changes["video_id_fixed"] += 1  # reuse counter for "repaired"
                    break

    print("Normalization summary:")
    print(f"  video_id fixed (archive-id -> YT id): {changes['video_id_fixed']}")
    print(f"  duplicate records merged:              {changes['deduped']}")
    print(f"  archive_direct derived:                {changes['archive_direct_added']}")
    print(f"  youtube_id backfilled:                 {changes['youtube_id_added']}")
    print(f"  records: {len(data)} -> {len(out)}")

    if write:
        # newest-first, same order the dashboard expects
        out.sort(key=lambda r: r.get("date", ""), reverse=True)
        with open(REC, "w") as f:
            json.dump(out, f, indent=2)
            f.write("\n")
        print("  ✓ data/recordings.json rewritten")
    else:
        print("  (dry run — re-run with --write to persist)")


if __name__ == "__main__":
    main()
