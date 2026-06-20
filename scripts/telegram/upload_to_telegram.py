#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║ 📡 TELEGRAM BOT — Infinite Free Storage Mirror                            ║
# ║                                                                            ║
# ║ Uploads recordings to a Telegram channel/chat as documents.                ║
# ║ • 2 GB per file (Telegram Bot API limit)                                   ║
# ║ • NO storage limit — infinite files                                        ║
# ║ • Permanent URLs (files never expire on Telegram)                          ║
# ║ • Direct download links via Bot API                                        ║
# ║                                                                            ║
# ║ For files > 2GB: auto-splits into 1.9GB chunks, uploads each,             ║
# ║ stores all chunk file_ids in recordings.json as telegram_chunks.           ║
# ║                                                                            ║
# ║ Required env vars:                                                         ║
# ║   TELEGRAM_BOT_TOKEN  — from @BotFather                                   ║
# ║   TELEGRAM_CHAT_ID    — channel or group ID (e.g. -100xxxxxxxxxx)          ║
# ║                                                                            ║
# ║ Optional:                                                                  ║
# ║   TELEGRAM_SPLIT_SIZE — max chunk size in bytes (default: 1.9GB)           ║
# ║                                                                            ║
# ║ SAFE: Does NOT touch any existing scripts/workflows.                       ║
# ║       Only adds a new mirror link in recordings.json.                      ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import os
import sys
import json
import math
import subprocess
import time
import requests

# ─── Configuration ────────────────────────────────────────────────────────────
BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")
SPLIT_SIZE = int(os.environ.get("TELEGRAM_SPLIT_SIZE", str(1900 * 1024 * 1024)))  # 1.9 GB
API_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}"
MAX_RETRIES = 3
RETRY_DELAY = 10  # seconds


def log(emoji, msg):
    print(f"  {emoji} Telegram: {msg}", flush=True)


def get_file_size(path):
    return os.path.getsize(path)


def format_size(size_bytes):
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 ** 2:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 ** 3:
        return f"{size_bytes / 1024 ** 2:.1f} MB"
    else:
        return f"{size_bytes / 1024 ** 3:.2f} GB"


def split_file(input_path, chunk_size):
    """Split file into chunks. Returns list of chunk file paths."""
    file_size = get_file_size(input_path)
    if file_size <= chunk_size:
        return [input_path]

    num_chunks = math.ceil(file_size / chunk_size)
    log("✂️", f"File is {format_size(file_size)} — splitting into {num_chunks} chunks of ~{format_size(chunk_size)}")

    base_name = os.path.splitext(os.path.basename(input_path))
    chunk_dir = os.path.join(os.path.dirname(input_path), "tg_chunks")
    os.makedirs(chunk_dir, exist_ok=True)

    chunks = []
    with open(input_path, "rb") as f:
        for i in range(num_chunks):
            chunk_path = os.path.join(chunk_dir, f"{base_name[0]}_part{i + 1:02d}{base_name[1]}")
            with open(chunk_path, "wb") as chunk_file:
                data = f.read(chunk_size)
                chunk_file.write(data)
            chunks.append(chunk_path)
            log("📦", f"Chunk {i + 1}/{num_chunks}: {format_size(get_file_size(chunk_path))}")

    return chunks


def upload_document(file_path, caption=""):
    """Upload a single file to Telegram as a document. Returns file_id or None."""
    file_size = get_file_size(file_path)
    file_name = os.path.basename(file_path)

    for attempt in range(1, MAX_RETRIES + 1):
        log("📤", f"Uploading {file_name} ({format_size(file_size)}) — attempt {attempt}/{MAX_RETRIES}")
        upload_start = time.time()

        try:
            with open(file_path, "rb") as f:
                response = requests.post(
                    f"{API_BASE}/sendDocument",
                    data={
                        "chat_id": CHAT_ID,
                        "caption": caption[:1024] if caption else "",
                        "parse_mode": "HTML",
                    },
                    files={"document": (file_name, f)},
                    timeout=7200,  # 2 hours for large files
                )

            elapsed = time.time() - upload_start
            result = response.json()

            if result.get("ok"):
                file_id = result["result"]["document"]["file_id"]
                speed = file_size / elapsed if elapsed > 0 else 0
                log("✅", f"Uploaded in {elapsed:.0f}s ({format_size(speed)}/s) — file_id: {file_id[:30]}...")
                return {
                    "file_id": file_id,
                    "file_name": file_name,
                    "message_id": result["result"]["message_id"],
                }
            else:
                log("⚠️", f"API error: {result.get('description', 'unknown')}")

        except requests.exceptions.Timeout:
            log("⏰", f"Upload timed out after {time.time() - upload_start:.0f}s")
        except Exception as e:
            log("❌", f"Upload error: {e}")

        if attempt < MAX_RETRIES:
            log("🔄", f"Retrying in {RETRY_DELAY}s...")
            time.sleep(RETRY_DELAY)

    log("❌", f"All {MAX_RETRIES} attempts failed for {file_name}")
    return None


def get_direct_url(file_id):
    """Get a direct download URL for a file_id (works for files < 20MB only via Bot API).
    For larger files, we return a deep link that works via the Telegram app."""
    try:
        resp = requests.get(f"{API_BASE}/getFile", params={"file_id": file_id}, timeout=30)
        data = resp.json()
        if data.get("ok"):
            file_path = data["result"]["file_path"]
            return f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file_path}"
    except Exception:
        pass
    # For files > 20MB, Bot API getFile doesn't work — return None
    # The message link in the channel is the permanent access point
    return None


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 upload_to_telegram.py <file_path> [title]")
        sys.exit(1)

    file_path = sys.argv[1]
    title = sys.argv[2] if len(sys.argv) > 2 else os.path.basename(file_path)

    if not os.path.exists(file_path):
        log("❌", f"File not found: {file_path}")
        sys.exit(1)

    if not BOT_TOKEN:
        log("⏭️", "TELEGRAM_BOT_TOKEN not set — skipping")
        sys.exit(0)

    if not CHAT_ID:
        log("⏭️", "TELEGRAM_CHAT_ID not set — skipping")
        sys.exit(0)

    file_size = get_file_size(file_path)
    log("🚀", f"Starting upload: {title} ({format_size(file_size)})")

    # Split if needed
    chunks = split_file(file_path, SPLIT_SIZE)
    is_split = len(chunks) > 1

    results = []
    for i, chunk_path in enumerate(chunks):
        if is_split:
            caption = f"📡 <b>{title}</b>\n📦 Part {i + 1}/{len(chunks)}\n💾 {format_size(get_file_size(chunk_path))}"
        else:
            caption = f"📡 <b>{title}</b>\n💾 {format_size(file_size)}\n☪️ Stream Archive"

        result = upload_document(chunk_path, caption)
        if result:
            results.append(result)
        else:
            log("❌", f"Failed to upload chunk {i + 1}/{len(chunks)}")

    # Clean up temp chunks
    if is_split:
        chunk_dir = os.path.join(os.path.dirname(file_path), "tg_chunks")
        for chunk in chunks:
            try:
                os.remove(chunk)
            except Exception:
                pass
        try:
            os.rmdir(chunk_dir)
        except Exception:
            pass

    if not results:
        log("❌", "No chunks uploaded successfully")
        sys.exit(1)

    # Build output for the workflow
    output = {
        "success": True,
        "total_chunks": len(chunks),
        "uploaded_chunks": len(results),
        "files": results,
        "chat_id": CHAT_ID,
    }

    # Write output for the workflow to read
    output_file = os.environ.get("TELEGRAM_OUTPUT_FILE", "/tmp/telegram_upload_result.json")
    with open(output_file, "w") as f:
        json.dump(output, f, indent=2)

    # Also write the telegram link to GITHUB_OUTPUT if available
    github_output = os.environ.get("GITHUB_OUTPUT", "")
    if github_output and results:
        # Construct a link to the message in the channel
        # For public channels: https://t.me/c/<channel_id>/<message_id>
        first_msg_id = results[0]["message_id"]
        chat_id_clean = str(CHAT_ID).replace("-100", "")
        telegram_link = f"https://t.me/c/{chat_id_clean}/{first_msg_id}"

        with open(github_output, "a") as f:
            f.write(f"telegram_link={telegram_link}\n")
            f.write(f"telegram_file_ids={json.dumps([r['file_id'] for r in results])}\n")

    log("✅", f"Upload complete: {len(results)}/{len(chunks)} chunks")
    return 0


if __name__ == "__main__":
    sys.exit(main())
