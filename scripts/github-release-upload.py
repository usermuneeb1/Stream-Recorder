#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  🎁 GitHub Releases video host — fast, free, permanent, no account farming    ║
# ║                                                                              ║
# ║  For each recording missing a github_release URL:                            ║
# ║    1. Stream the .mp4 from its permanent Archive.org copy                     ║
# ║    2. Create (or reuse) a GitHub Release tagged by the Archive identifier     ║
# ║    3. Upload the .mp4 as a release asset (≤2 GiB/file, no total/bandwidth cap)║
# ║    4. Save the permanent fast CDN URL into data/recordings.json               ║
# ║                                                                              ║
# ║  Idempotent: skips recordings that already have github_release.               ║
# ║  Safe: never deletes existing data; only adds github_release / github_direct. ║
# ║                                                                              ║
# ║  Env:  GITHUB_TOKEN (required)  REPO (owner/name)  GH_MAX_ITEMS (default 5)   ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RECORDINGS = os.path.join(ROOT, "data", "recordings.json")

TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()
REPO = os.environ.get("REPO", "usermuneeb1/Stream-Recorder").strip()
MAX_ITEMS = int(os.environ.get("GH_MAX_ITEMS", "5"))

API = "https://api.github.com"
UPLOADS = "https://uploads.github.com"


def log(m):
    print(m, flush=True)


def gh(method, url, *, data=None, headers=None, raw=False):
    import requests
    h = {"Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github+json",
         "X-GitHub-Api-Version": "2022-11-28"}
    if headers:
        h.update(headers)
    r = requests.request(method, url, headers=h, data=data, timeout=600)
    if raw:
        return r
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, {}


def archive_mp4_url(rec):
    """Best direct .mp4 URL for streaming the source from Archive."""
    return rec.get("archive_node") or rec.get("archive_direct") or ""


def identifier(rec):
    return (rec.get("archive_link") or "").split("/details/")[-1]


def safe_filename(rec):
    url = archive_mp4_url(rec)
    name = url.split("/")[-1].split("?")[0] or f"{identifier(rec)}.mp4"
    if not name.lower().endswith(".mp4"):
        name += ".mp4"
    return name


def ensure_release(tag, title):
    """Return (release_id, upload_url_base) — create the release if absent."""
    code, body = gh("GET", f"{API}/repos/{REPO}/releases/tags/{tag}")
    if code == 200 and body.get("id"):
        return body["id"], body.get("assets", [])
    # Create it
    payload = json.dumps({
        "tag_name": tag,
        "name": title[:120],
        "body": "Automated video mirror for The Muslim Lantern Archive. "
                "Hosted as a GitHub Release asset for fast, permanent playback.",
        "draft": False, "prerelease": False,
    })
    code, body = gh("POST", f"{API}/repos/{REPO}/releases",
                    data=payload, headers={"Content-Type": "application/json"})
    if code in (200, 201) and body.get("id"):
        return body["id"], []
    log(f"   ❌ could not create release ({code}): {str(body)[:200]}")
    return None, []


def download(url, dest):
    """Stream the source mp4 to disk via curl (handles Archive's redirects)."""
    try:
        subprocess.run(
            ["curl", "-sL", "--fail", "--max-time", "1800", "-o", dest, url],
            check=True,
        )
        return os.path.getsize(dest) > 0
    except Exception as e:
        log(f"   ❌ download failed: {e}")
        return False


def upload_asset(release_id, filepath, name):
    import requests
    size = os.path.getsize(filepath)
    url = f"{UPLOADS}/repos/{REPO}/releases/{release_id}/assets?name={name}"
    with open(filepath, "rb") as f:
        h = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/octet-stream",
             "Accept": "application/vnd.github+json", "Content-Length": str(size)}
        r = requests.post(url, headers=h, data=f, timeout=1800)
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, {}


def main():
    if not TOKEN:
        log("ℹ️ GITHUB_TOKEN not set — GitHub Releases upload skipped (no-op).")
        return 0
    if not os.path.exists(RECORDINGS):
        log("❌ recordings.json not found")
        return 1

    with open(RECORDINGS) as f:
        recs = json.load(f)

    todo = [r for r in recs if archive_mp4_url(r) and not r.get("github_release")][:MAX_ITEMS]
    if not todo:
        log("✅ All recordings already mirrored to GitHub Releases.")
        return 0

    log(f"🎁 Uploading {len(todo)} video(s) to GitHub Releases...")
    for rec in todo:
        ident = identifier(rec)
        tag = f"v-{ident}"
        log(f"\n──── {ident} ────")
        rid, assets = ensure_release(tag, rec.get("title", ident))
        if not rid:
            continue

        name = safe_filename(rec)

        # Reuse an already-uploaded asset if the release already has it.
        existing = next((a for a in assets if a.get("name") == name and a.get("state") == "uploaded"), None)
        if existing:
            dl = existing.get("browser_download_url")
            log(f"   ♻️ asset already uploaded → {dl}")
        else:
            with tempfile.TemporaryDirectory() as tmp:
                dest = os.path.join(tmp, name)
                log(f"   ⬇️ downloading source ({rec.get('size_human','?')})...")
                if not download(archive_mp4_url(rec), dest):
                    continue
                fsize = os.path.getsize(dest)
                # GitHub Releases hard limit is 2 GiB per file. If a (very long)
                # recording exceeds it, skip gracefully — Archive (B3ING) still
                # serves it, so playback is never broken.
                if fsize > 2 * 1024 * 1024 * 1024 - (5 * 1024 * 1024):
                    log(f"   ⏭️ {fsize//(1024*1024)} MB exceeds GitHub's 2 GiB limit — skipping (Archive will serve it).")
                    continue
                log(f"   ⬆️ uploading {name} ({fsize//(1024*1024)} MB) to release...")
                code, body = upload_asset(rid, dest, name)
                if code not in (200, 201) or not body.get("browser_download_url"):
                    log(f"   ❌ upload failed ({code}): {str(body)[:200]}")
                    continue
                dl = body["browser_download_url"]
                log(f"   ✅ uploaded → {dl}")

        # browser_download_url 302-redirects to the fast Azure CDN. Store it as
        # both the human link and the direct stream URL (the player follows the
        # redirect automatically).
        rec["github_release"] = dl
        rec["github_direct"] = dl

        with open(RECORDINGS, "w") as f:
            json.dump(recs, f, indent=2)
            f.write("\n")

    log("\n✅ GitHub Releases mirroring complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
