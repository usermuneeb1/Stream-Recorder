#!/usr/bin/env python3
"""Upload recordings to Telegram using Pyrogram (up to 2GB per file, no chunks)."""

import json
import os
import sys
import time

API_ID = os.environ.get("TELEGRAM_API_ID", "")
API_HASH = os.environ.get("TELEGRAM_API_HASH", "")
SESSION = os.environ.get("TELEGRAM_SESSION_STRING", "")
CHAT_ID = int(os.environ.get("TELEGRAM_CHAT_ID", "0"))


def log(e, m):
    print(f"  {e} Telegram: {m}", flush=True)


def fmt(b):
    if b < 1024**2: return f"{b/1024:.0f} KB"
    if b < 1024**3: return f"{b/1024**2:.1f} MB"
    return f"{b/1024**3:.2f} GB"


def progress(current, total):
    pct = current * 100 / total
    if int(pct) % 10 == 0:
        print(f"     {pct:.0f}% ({fmt(current)} / {fmt(total)})", end="\r", flush=True)


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 upload_to_telegram.py <file> [title]")
        sys.exit(1)

    path = sys.argv[1]
    title = sys.argv[2] if len(sys.argv) > 2 else os.path.basename(path)

    if not os.path.exists(path):
        log("❌", f"File not found: {path}")
        sys.exit(1)

    if not all([API_ID, API_HASH, SESSION, CHAT_ID]):
        log("⏭️", "Telegram credentials not set — skipping")
        sys.exit(0)

    fsize = os.path.getsize(path)
    log("🚀", f"Uploading: {title} ({fmt(fsize)})")

    from pyrogram import Client

    app = Client(
        "stream_archive",
        api_id=int(API_ID),
        api_hash=API_HASH,
        session_string=SESSION,
        in_memory=True,
    )

    app.start()

    try:
        caption = f"📡 **{title}**\n💾 {fmt(fsize)}\n☪️ Stream Archive"
        start = time.time()

        msg = app.send_document(
            chat_id=CHAT_ID,
            document=path,
            caption=caption,
            file_name=os.path.basename(path),
            progress=progress,
        )

        elapsed = time.time() - start
        speed = fsize / elapsed if elapsed > 0 else 0
        log("✅", f"Uploaded in {elapsed:.0f}s ({fmt(speed)}/s)")
        log("📎", f"Message ID: {msg.id}")

        # Write output for workflow
        gh_out = os.environ.get("GITHUB_OUTPUT", "")
        if gh_out:
            # Build link — for private channels use c/ format
            chat_str = str(CHAT_ID)
            if chat_str.startswith("-100"):
                cid = chat_str[4:]
            else:
                cid = chat_str
            link = f"https://t.me/c/{cid}/{msg.id}"
            with open(gh_out, "a") as f:
                f.write(f"telegram_link={link}\n")
            log("🔗", f"Link: {link}")

    except Exception as e:
        log("❌", f"Upload failed: {e}")
        sys.exit(1)
    finally:
        app.stop()


if __name__ == "__main__":
    main()
