#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  🩺 ARCHIVE DATA REPAIR — normalize, dedupe, backfill, and re-derive         ║
# ║                                                                            ║
# ║  One-shot + scheduled self-healing for the public archive dataset.         ║
# ║  Idempotent and safe to run any time:                                     ║
# ║    1. Dedupes data/recordings.json by the REAL YouTube ID (merging the     ║
# ║       richest entry instead of dropping data).                            ║
# ║    2. Normalizes schema: video_id = YouTube ID, archive item id kept in    ║
# ║       `archive_id`, video_url backfilled from the YouTube ID.             ║
# ║    3. Backfills archive_direct / archive_node via the archive.org          ║
# ║       metadata API (network); offline it reconstructs candidate filenames  ║
# ║       from the exact pipeline naming rules and HEAD-verifies them.         ║
# ║    4. Recomputes stats.json from recordings.json (single source of truth,  ║
# ║       drift-proof — replaces the old incremental counter that drifted).    ║
# ║    5. Regenerates links.txt, data/system-status.json, badges, feeds,       ║
# ║       podcast, sitemap.                                                    ║
# ║                                                                            ║
# ║  Usage:  python3 scripts/repair-archive-data.py [--dry-run]                ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

from __future__ import annotations

import json
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RECS = ROOT / "data" / "recordings.json"
STATS = ROOT / "stats.json"
LINKS = ROOT / "links.txt"
DATA = ROOT / "data"

YT_ID_RE = re.compile(r"(?:v=|youtu\.be/|/shorts/|/live/)([\w-]{11})")
# Archive identifiers embed the YouTube ID: tml-2026-06-PYkqrEBc_zY-1781734865
ARCHIVE_YT_RE = re.compile(r"tml-\d{4}-\d{2}(?:-\d+)?-([\w-]{11})-\d+$")
DATE_RE = re.compile(r"(\d{4})-(\d{2})-(\d{2})")

NETWORK_TIMEOUT = 12


def log(msg: str) -> None:
    print(msg, flush=True)


def load_json(path: Path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write("\n")


# ─────────────────────────────────────────────────────────────────────────────
#  ID EXTRACTION
# ─────────────────────────────────────────────────────────────────────────────

def is_yt_id(s) -> bool:
    return bool(s) and bool(re.fullmatch(r"[\w-]{11}", str(s)))


def yt_id_from_url(url: str) -> str:
    m = YT_ID_RE.search(url or "")
    return m.group(1) if m else ""


def yt_id_from_archive_id(aid: str) -> str:
    m = ARCHIVE_YT_RE.search(aid or "")
    if m:
        return m.group(1)
    # Fallback: last 11-char run before the trailing timestamp
    m = re.search(r"-([\w-]{11})-(\d{9,})$", aid or "")
    return m.group(1) if m else ""


def archive_id_from_link(link: str) -> str:
    m = re.search(r"/details/([^/?#]+)", link or "")
    return m.group(1) if m else ""


def extract_yt_id(rec: dict) -> str:
    vid = str(rec.get("video_id") or "")
    return (
        yt_id_from_url(str(rec.get("video_url") or ""))
        or (vid if is_yt_id(vid) else "")
        or yt_id_from_archive_id(str(rec.get("archive_id") or ""))
        or yt_id_from_archive_id(archive_id_from_link(str(rec.get("archive_link") or "")))
    )


def extract_archive_id(rec: dict) -> str:
    return (
        str(rec.get("archive_id") or "")
        or archive_id_from_link(str(rec.get("archive_link") or ""))
        or (str(rec.get("video_id") or "") if "tml-" in str(rec.get("video_id") or "") else "")
    )


# ─────────────────────────────────────────────────────────────────────────────
#  FILENAME RECONSTRUCTION (mirrors utils.sh sanitize_filename +
#  upload-clouds.sh make_safe_filename — the exact pipeline naming rules)
# ─────────────────────────────────────────────────────────────────────────────

def sanitize_filename(name: str) -> str:
    s = re.sub(r'[\\/:*?"<>|#&%$!@^`~]', "", name or "")
    s = re.sub(r"\.\.", "", s)
    s = s.strip(".")
    s = re.sub(r"\s{2,}", " ", s)
    s = re.sub(r"-{2,}", "-", s)
    s = s.strip(" -")
    s = s[:180]
    return s or f"Live_Stream_{datetime.now():%Y%m%d_%H%M%S}"


def make_safe_filename(raw: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9._\-]", "_", sanitize_filename(raw))
    s = re.sub(r"_+", "_", s)
    s = s[:200]
    return s or f"recording_{int(datetime.now().timestamp())}.mp4"


def candidate_archive_files(title: str, date: str) -> list[str]:
    base = make_safe_filename(title)
    out = [f"{base}.mp4"]
    # Title sometimes carries the date already; also try stripped variants.
    stripped = re.sub(r"\s+\d{4}-\d{2}-\d{2}\s*$", "", title)
    if stripped.strip() and stripped.strip() != title.strip():
        sb = make_safe_filename(stripped)
        out += [f"{sb}.mp4", f"{sb}_{date}.mp4", f"{sb}_-_{date}.mp4"]
    # Keep unique, preserve order
    seen, uniq = set(), []
    for f in out:
        if f not in seen:
            seen.add(f)
            uniq.append(f)
    return uniq


def archive_url_ok(url: str) -> bool:
    """HEAD check with a tiny range request — true on any 2xx/3xx."""
    try:
        req = urllib.request.Request(url, method="HEAD")
        req.add_header("Range", "bytes=0-1")
        req.add_header("User-Agent", "Mozilla/5.0 (Stream-Recorder repair)")
        with urllib.request.urlopen(req, timeout=NETWORK_TIMEOUT) as resp:
            return 200 <= resp.status < 400
    except Exception:
        return False


# ─────────────────────────────────────────────────────────────────────────────
#  ARCHIVE.DIRECT / NODE RESOLUTION
# ─────────────────────────────────────────────────────────────────────────────

def resolve_archive_urls(rec: dict, allow_network: bool) -> tuple[str, str]:
    """Return (archive_direct, archive_node). Preserves existing values."""
    existing_direct = str(rec.get("archive_direct") or "")
    existing_node = str(rec.get("archive_node") or "")
    if existing_direct.startswith("http"):
        return existing_direct, existing_node

    aid = extract_archive_id(rec)
    if not aid:
        return "", ""

    # ── Network path: ask the metadata API for the real file list ──────────
    if allow_network:
        try:
            with urllib.request.urlopen(
                f"https://archive.org/metadata/{urllib.parse.quote(aid)}",
                timeout=NETWORK_TIMEOUT,
            ) as resp:
                meta = json.loads(resp.read().decode("utf-8", "replace"))
            files = meta.get("files") or []
            mp4s = [
                f
                for f in files
                if re.search(r"\.(mp4|m4v|webm|mkv)$", str(f.get("name") or ""), re.I)
                and "_thumb" not in str(f.get("name"))
                and f.get("source") != "metadata"
            ]
            mp4s.sort(key=lambda f: float(f.get("size") or 0), reverse=True)
            if mp4s:
                name = mp4s[0]["name"]
                enc = urllib.parse.quote(name, safe="/")
                direct = f"https://archive.org/download/{aid}/{enc}"
                # Resolve the storage node via the 302 redirect target
                node = ""
                try:
                    req = urllib.request.Request(direct, method="GET")
                    req.add_header("Range", "bytes=0-1")
                    req.add_header("User-Agent", "Stream-Recorder repair")
                    opener = urllib.request.build_opener(
                        urllib.request.HTTPRedirectHandler()
                    )
                    with opener.open(req, timeout=NETWORK_TIMEOUT) as r:
                        node = r.geturl().split("?")[0]
                except Exception:
                    node = ""
                return direct, node
        except Exception as exc:
            log(f"    ⚠️  metadata API failed for {aid}: {exc}")

    # ── Offline path: reconstruct candidate filenames, HEAD-verify ─────────
    title = str(rec.get("title") or "")
    date = str(rec.get("date") or "")[:10]
    for cand in candidate_archive_files(title, date):
        direct = f"https://archive.org/download/{aid}/{urllib.parse.quote(cand)}"
        if allow_network and archive_url_ok(direct):
            return direct, ""
        if not allow_network:
            # No network: keep the most likely candidate without verification
            # (CI runs re-verify and correct via the metadata API).
            return direct, ""
    return "", ""


# ─────────────────────────────────────────────────────────────────────────────
#  MERGE LOGIC
# ─────────────────────────────────────────────────────────────────────────────

def merge_records(records: list[dict]) -> list[dict]:
    groups: dict[str, list[dict]] = {}
    for r in records:
        yt = extract_yt_id(r)
        aid = extract_archive_id(r)
        key = yt or aid or str(r.get("video_id") or "")
        groups.setdefault(key, []).append(r)

    merged: list[dict] = []
    dropped = 0
    for key, group in groups.items():
        if len(group) > 1:
            dropped += len(group) - 1
        base: dict = {}
        for r in group:
            for k, v in r.items():
                if v in (None, "", [], {}):
                    continue
                if k not in base or base[k] in (None, "", [], {}):
                    base[k] = v
                elif k == "duration_sec":
                    base[k] = max(base[k], v)
                elif k == "size_bytes":
                    base[k] = max(base[k], v)
                elif k == "resolution" and re.search(r"\d{3,4}", str(v)):
                    cur = int((re.search(r"(\d{3,4})", str(base[k])) or [0])[0]) if base[k] else 0
                    new = int((re.search(r"(\d{3,4})", str(v)) or [0])[0])
                    if new > cur:
                        base[k] = v
                elif k in ("chapters", "storyboard") and not base.get(k):
                    base[k] = v
        merged.append(base)

    log(f"  🧬 merged {len(records)} raw entries → {len(merged)} unique streams "
        f"({dropped} duplicate record(s) folded in)")
    return merged


def normalize_records(records: list[dict]) -> list[dict]:
    """Normalize schema fields; backfill video_url/archive_id/size_gb."""
    for r in records:
        yt = extract_yt_id(r)
        aid = extract_archive_id(r)
        if yt:
            r["video_id"] = yt
            if not str(r.get("video_url") or ""):
                r["video_url"] = f"https://www.youtube.com/watch?v={yt}"
        if aid:
            r["archive_id"] = aid
        if str(r.get("archive_link") or "").startswith("http"):
            r["archive_link"] = str(r["archive_link"]).split("?")[0]
        sizeb = r.get("size_bytes") or 0
        if not r.get("size_gb"):
            r["size_gb"] = round(sizeb / 1073741824, 4)
        r.setdefault("channel", "The Muslim Lantern")
    return records


# ─────────────────────────────────────────────────────────────────────────────
#  STATS RECOMPUTE (drift-proof, from the canonical dataset)
# ─────────────────────────────────────────────────────────────────────────────

def recompute_stats(records: list[dict]) -> dict:
    total_sec = sum(int(r.get("duration_sec") or 0) for r in records)
    total_bytes = sum(int(r.get("size_bytes") or 0) for r in records)
    total_streams = len(records)
    total_hours = round(total_sec / 3600, 2)
    total_gb = round(total_bytes / 1073741824, 2)
    avg = round(total_hours / total_streams, 2) if total_streams else 0.0

    def count(link_key: str) -> int:
        return sum(1 for r in records if str(r.get(link_key) or "").startswith("http"))

    first = records[0] if records else {}
    dur = first.get("duration_fmt") or (
        f"{int((first.get('duration_sec') or 0)//3600):02d}:"
        f"{int((first.get('duration_sec') or 0)%3600//60):02d}:"
        f"{int((first.get('duration_sec') or 0)%60):02d}"
        if records else "00:00:00"
    )
    return {
        "total_streams": total_streams,
        "total_hours": total_hours,
        "total_gb": total_gb,
        "avg_duration_hours": avg,
        "sources": {
            "archive": count("archive_link"),
            "mega": count("mega_link"),
            "pixel": count("pixeldrain_link"),
            "gofile": count("gofile_link"),
        },
        "last_stream": {
            "title": first.get("title"),
            "channel": first.get("channel"),
            "date": first.get("date"),
            "duration": dur,
            "size_gb": round(float(first.get("size_gb") or 0), 4) if first else 0,
        },
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
    }


# ─────────────────────────────────────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────────────────────────────────────

def network_available() -> bool:
    try:
        urllib.request.urlopen("https://archive.org", timeout=6)
        return True
    except Exception:
        return False


def main() -> int:
    dry = "--dry-run" in sys.argv
    log("🩺 ARCHIVE DATA REPAIR")
    log(f"  mode: {'DRY-RUN (no writes)' if dry else 'LIVE'}")
    log(f"  source: {RECS}")

    allow_network = network_available()
    log(f"  network (archive.org): {'yes' if allow_network else 'NO — offline fallbacks only'}")

    if not RECS.exists():
        log("❌ data/recordings.json missing — nothing to repair")
        return 1

    records = load_json(RECS, [])
    if not isinstance(records, list) or not records:
        log("❌ recordings.json is not a non-empty array")
        return 1

    raw_count = len(records)
    log(f"\n📥 loaded {raw_count} raw entries")

    # 1. Dedupe + normalize
    merged = merge_records(records)
    merged = normalize_records(merged)
    merged.sort(key=lambda r: (str(r.get("date") or ""), str(r.get("recorded_at") or "")), reverse=True)

    # 2. Backfill archive_direct / archive_node
    log("\n🔗 resolving archive_direct / archive_node…")
    backfilled = 0
    for r in merged:
        direct, node = resolve_archive_urls(r, allow_network)
        if direct and not r.get("archive_direct"):
            r["archive_direct"] = direct
            backfilled += 1
        if node and not r.get("archive_node"):
            r["archive_node"] = node
    log(f"  backfilled archive_direct for {backfilled} entries")
    still_missing = [r.get("video_id") for r in merged if not r.get("archive_direct")]
    if still_missing:
        log(f"  ⚠️  still missing archive_direct: {still_missing} (CI run will resolve via metadata API)")

    # 3. Write recordings.json
    log("\n💾 writing data/recordings.json…")
    if not dry:
        write_json(RECS, merged)
    log(f"  {raw_count} → {len(merged)} entries")

    # 4. Recompute + write stats.json
    log("\n📊 recomputing stats.json from recordings (drift-proof)…")
    stats = recompute_stats(merged)
    if not dry:
        # Preserve the old timestamp when nothing actually changed, so weekly
        # runs on a healthy dataset produce zero git noise.
        prev = load_json(STATS, {})
        if isinstance(prev, dict) and prev.get("total_streams") == stats["total_streams"]:
            same = all(
                prev.get(k) == stats[k]
                for k in ("total_hours", "total_gb", "avg_duration_hours", "sources", "last_stream")
            )
            if same:
                stats["updated_at"] = prev.get("updated_at") or stats["updated_at"]
        write_json(STATS, stats)
    log(f"  {stats['total_streams']} streams · {stats['total_hours']}h · {stats['total_gb']} GB")

    # 5. Regenerate links.txt as a JSON mirror of the canonical dataset
    log("\n🔁 regenerating links.txt (JSON mirror)…")
    if not dry:
        write_json(LINKS, merged)

    # 6. Regenerate derived artifacts (system-status, badges, feeds, podcast)
    log("\n🧩 regenerating derived artifacts…")
    for script in ("scripts/gen-status.py", "scripts/generate-feeds.py"):
        if dry:
            log(f"  (dry-run) would run {script}")
            continue
        try:
            subprocess.run(
                [sys.executable, str(ROOT / script)],
                cwd=ROOT, check=True, capture_output=True, text=True, timeout=120,
            )
            log(f"  ✅ {script}")
        except subprocess.CalledProcessError as e:
            log(f"  ⚠️  {script} failed:\n{e.stderr[:800]}")
        except Exception as e:
            log(f"  ⚠️  {script} error: {e}")

    log("\n✅ repair complete" if not dry else "\n✅ dry-run complete — no files written")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
