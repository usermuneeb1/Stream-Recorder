#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  📱 TELEGRAM MIRROR — upload every recording that lacks a Telegram link.     ║
# ║                                                                            ║
# ║  Replaces the fragile inline YAML logic that silently skipped recordings   ║
# ║  whenever archive_direct / archive_node were missing. This version:        ║
# ║    1. Picks a download URL: archive_direct → archive_node → archive.org    ║
# ║       metadata API (largest mp4) → reconstructed filename candidates.      ║
# ║    2. Skips recordings with NO resolvable source (reports them loudly).    ║
# ║    3. Updates recordings.json in place: telegram_link + telegram_file_id   ║
# ║       + cf_stream (Cloudflare Worker proxy URL built from the file_id).    ║
# ║    4. Honest exit code: 0 = all done, 1 = one or more uploads failed.      ║
# ║                                                                            ║
# ║  Usage: python3 scripts/telegram/mirror_to_telegram.py [--max N]           ║
# ║  Requires: TELEGRAM_API_ID / TELEGRAM_API_HASH / TELEGRAM_SESSION_STRING / ║
# ║            TELEGRAM_CHAT_ID env vars (from secrets).                       ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
RECS = ROOT / "data" / "recordings.json"
CF_WORKER = os.environ.get("CF_STREAM_WORKER", "https://tg-stream.isthatdxture.workers.dev")
MAX_ITEMS = 0  # 0 = all


def log(msg: str) -> None:
    print(msg, flush=True)


def load_recordings() -> list[dict]:
    if not RECS.exists():
        log("❌ data/recordings.json missing")
        sys.exit(1)
    try:
        return json.loads(RECS.read_text())
    except Exception as e:
        log(f"❌ Cannot parse recordings.json: {e}")
        sys.exit(1)


def save_recordings(recs: list[dict]) -> None:
    RECS.write_text(json.dumps(recs, indent=2, ensure_ascii=False) + "\n")


def extract_archive_id(rec: dict) -> str:
    return (
        str(rec.get("archive_id") or "")
        or (re.search(r"/details/([^/?#]+)", str(rec.get("archive_link") or "")).group(1) if re.search(r"/details/([^/?#]+)", str(rec.get("archive_link") or "")) else "")
        or ""
    )


def sanitize_title(title: str) -> str:
    s = re.sub(r'[\\/:*?"<>|#&%$!@^`~]', "", title or "")
    s = re.sub(r"\s{2,}", " ", s).strip(" -")
    return s[:180]


def safe_filename(title: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9._\-]", "_", sanitize_title(title))
    return re.sub(r"_+", "_", s)[:200]


def resolve_download_url(rec: dict) -> str:
    """Best-effort permanent MP4 URL for a recording (archive.org first)."""
    for key in ("archive_direct", "archive_node"):
        u = str(rec.get(key) or "")
        if u.startswith("http"):
            return u.split("?")[0]

    aid = extract_archive_id(rec)
    if not aid:
        return ""

    # Metadata API: pick the largest non-thumbnail video file.
    try:
        with urllib.request.urlopen(
            f"https://archive.org/metadata/{urllib.parse.quote(aid)}", timeout=20
        ) as resp:
            meta = json.loads(resp.read().decode("utf-8", "replace"))
        files = meta.get("files") or []
        vids = [
            f for f in files
            if re.search(r"\.(mp4|m4v|webm|mkv)$", str(f.get("name") or ""), re.I)
            and "_thumb" not in str(f.get("name"))
        ]
        vids.sort(key=lambda f: float(f.get("size") or 0), reverse=True)
        if vids:
            name = vids[0]["name"]
            return f"https://archive.org/download/{aid}/{urllib.parse.quote(name, safe='/')}"
    except Exception as e:
        log(f"    ⚠️  metadata API failed: {e}")

    # Reconstructed filename candidates (pipeline naming rules).
    title = str(rec.get("title") or "")
    date = str(rec.get("date") or "")[:10]
    base = safe_filename(title)
    cands = [f"{base}.mp4"]
    stripped = re.sub(r"\s+\d{4}-\d{2}-\d{2}\s*$", "", title).strip()
    if stripped and stripped != title.strip():
        sb = safe_filename(stripped)
        cands += [f"{sb}.mp4", f"{sb}_{date}.mp4", f"{sb}_-_{date}.mp4"]
    return f"https://archive.org/download/{aid}/{urllib.parse.quote(cands[0])}"


def upload_one(rec: dict, path: str, index: int, total: int) -> tuple[str, str]:
    """Returns (telegram_link, telegram_file_id). Raises on failure."""
    title = str(rec.get("title") or "Recording")
    log(f"\n{'='*60}")
    log(f"📱 [{index}/{total}] {title}")

    out_file = f"/tmp/tg_out_{index}.txt"
    open(out_file, "w").close()
    env = {**os.environ, "GITHUB_OUTPUT": out_file}

    proc = subprocess.run(
        [sys.executable, str(ROOT / "scripts/telegram/upload_to_telegram.py"), path, title],
        env=env,
    )
    if proc.returncode != 0:
        raise RuntimeError("upload_to_telegram.py exited non-zero")

    link, fid = "", ""
    try:
        for line in open(out_file):
            if line.startswith("telegram_link="):
                link = line.strip().split("=", 1)[1]
            elif line.startswith("telegram_file_id="):
                fid = line.strip().split("=", 1)[1]
    except Exception:
        pass
    if not link:
        raise RuntimeError("no telegram_link captured")
    return link, fid


def main() -> int:
    global MAX_ITEMS
    if len(sys.argv) > 1 and sys.argv[1] == "--max":
        MAX_ITEMS = int(sys.argv[2])

    if not all(os.environ.get(k) for k in ("TELEGRAM_API_ID", "TELEGRAM_API_HASH", "TELEGRAM_SESSION_STRING")):
        log("⏭️  Telegram credentials not set — skipping mirror (no-op)")
        return 0

    recs = load_recordings()
    todo = [r for r in recs if not r.get("telegram_link")]
    if not todo:
        log("✅ All recordings already have Telegram links")
        return 0

    if MAX_ITEMS:
        todo = todo[:MAX_ITEMS]

    log(f"📱 Found {len(todo)} recording(s) missing a Telegram link\n")

    ok = 0
    failed: list[str] = []
    skipped: list[str] = []

    for i, rec in enumerate(todo, 1):
        vid = str(rec.get("video_id") or "?")
        url = resolve_download_url(rec)
        if not url:
            log(f"   ⚠️  No resolvable download URL for {vid} — skipping")
            skipped.append(vid)
            continue

        path = f"/tmp/tg_{vid}.mp4"
        try:
            log(f"   📥 Downloading {url[:100]}…")
            dl = subprocess.run(
                ["curl", "-L", "--retry", "3", "--max-time", "7200", "--fail", "-sS", "-o", path, url],
                capture_output=True, text=True,
            )
            if dl.returncode != 0 or not os.path.exists(path) or os.path.getsize(path) < 10000:
                raise RuntimeError(f"download failed ({dl.returncode})")

            size = os.path.getsize(path)
            log(f"   📦 Downloaded: {size/1024/1024:.0f} MB")

            link, fid = upload_one(rec, path, i, len(todo))
            rec["telegram_link"] = link
            if fid:
                rec["telegram_file_id"] = fid
                rec["cf_stream"] = f"{CF_WORKER}/?file_id={urllib.parse.quote(fid, safe='')}"
            save_recordings(recs)
            log(f"   ✅ {vid} → {link}")
            ok += 1
        except Exception as e:
            log(f"   ❌ {vid}: {e}")
            failed.append(vid)
        finally:
            try:
                os.remove(path)
            except OSError:
                pass

    log(f"\n{'='*60}")
    log(f"📊 Result: {ok} uploaded · {len(failed)} failed · {len(skipped)} skipped (no source)")
    if skipped:
        log(f"   ⏭️  Skipped (no resolvable URL — run repair-archive-data.py in CI to backfill): {skipped}")
    if failed:
        log(f"   ❌ Failed: {failed}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
