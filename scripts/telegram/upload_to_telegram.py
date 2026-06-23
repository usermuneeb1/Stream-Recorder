#!/usr/bin/env python3
"""Upload recordings to Telegram using Pyrogram (up to 2GB, no chunks)."""

import os
import sys
import time

API_ID = os.environ.get("TELEGRAM_API_ID", "")
API_HASH = os.environ.get("TELEGRAM_API_HASH", "")
SESSION = os.environ.get("TELEGRAM_SESSION_STRING", "")
CHAT_ID_RAW = os.environ.get("TELEGRAM_CHAT_ID", "0")


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


def resolve_chat(app):
    """Try multiple formats to resolve the channel."""
    raw = CHAT_ID_RAW.strip()

    # Try formats in order
    candidates = []
    if raw.startswith("-100"):
        candidates.append(int(raw))
    elif raw.lstrip("-").isdigit():
        candidates.append(int(f"-100{raw}"))
        candidates.append(int(raw))
        candidates.append(int(f"-{raw}"))

    for cid in candidates:
        try:
            chat = app.get_chat(cid)
            log("✅", f"Resolved channel: {chat.title} (ID: {cid})")
            return cid
        except Exception as e:
            log("⚠️", f"ID {cid} failed: {e}")

    # Last resort: try to find it by listing dialogs
    log("🔍", "Searching dialogs for the channel...")
    try:
        for dialog in app.get_dialogs():
            chat = dialog.chat
            chat_id_str = str(chat.id).replace("-100", "")
            if chat_id_str == raw or str(chat.id) == raw:
                log("✅", f"Found via dialogs: {chat.title} (ID: {chat.id})")
                return chat.id
            if hasattr(chat, 'title') and chat.title and "archive" in chat.title.lower():
                log("✅", f"Found by name: {chat.title} (ID: {chat.id})")
                return chat.id
    except Exception as e:
        log("⚠️", f"Dialog search failed: {e}")

    return None


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 upload_to_telegram.py <file> [title]")
        sys.exit(1)

    path = sys.argv[1]
    title = sys.argv[2] if len(sys.argv) > 2 else os.path.basename(path)

    if not os.path.exists(path):
        log("❌", f"File not found: {path}")
        sys.exit(1)

    if not all([API_ID, API_HASH, SESSION]):
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
        # Resolve the channel ID
        chat_id = resolve_chat(app)
        if not chat_id:
            log("❌", f"Could not resolve channel ID: {CHAT_ID_RAW}")
            log("💡", "Make sure the bot/account is a member of the channel")
            sys.exit(1)

        caption = f"📡 **{title}**\n💾 {fmt(fsize)}\n☪️ Stream Archive"
        start = time.time()

        msg = app.send_document(
            chat_id=chat_id,
            document=path,
            caption=caption,
            file_name=os.path.basename(path),
            progress=progress,
        )

        elapsed = time.time() - start
        speed = fsize / elapsed if elapsed > 0 else 0
        print()
        log("✅", f"Uploaded in {elapsed:.0f}s ({fmt(speed)}/s)")

        # Build link
        gh_out = os.environ.get("GITHUB_OUTPUT", "")
        if gh_out:
            cid = str(chat_id).replace("-100", "")
            link = f"https://t.me/c/{cid}/{msg.id}"
            with open(gh_out, "a") as f:
                f.write(f"telegram_link={link}\n")
                # Save file_id for Cloudflare Worker proxy
                try:
                    fid = (
                        getattr(getattr(msg, "document", None), "file_id", None)
                        or getattr(getattr(msg, "video", None), "file_id", None)
                        or getattr(getattr(msg, "audio", None), "file_id", None)
                        or getattr(getattr(msg, "animation", None), "file_id", None)
                    )
                    if fid:
                        f.write(f"telegram_file_id={fid}\n")
                        log("🆔", f"file_id captured: {fid[:16]}…")
                    else:
                        log("⚠️", f"Could not extract file_id from {type(msg).__name__}")
                except Exception as e:
                    log("⚠️", f"file_id capture failed: {e}")
            log("🔗", f"Link: {link}")

    except Exception as e:
        log("❌", f"Upload failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        app.stop()


if __name__ == "__main__":
    main()
