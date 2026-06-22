#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║ 📡 TELEGRAM BOT — Large File Upload via Chunks                            ║
# ║                                                                            ║
# ║ Telegram Bot API has a 50MB upload limit. For larger files, this script    ║
# ║ splits the video into 49MB chunks and uploads each as a separate document. ║
# ║ The first message contains the video info, subsequent ones are parts.      ║
# ║                                                                            ║
# ║ Required env vars:                                                         ║
# ║   TELEGRAM_BOT_TOKEN  — from @BotFather                                   ║
# ║   TELEGRAM_CHAT_ID    — channel or group ID                                ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import os
import sys
import json
import math
import time
import requests

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")
API_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}"
MAX_CHUNK = 49 * 1024 * 1024  # 49MB — under Telegram's 50MB limit
MAX_RETRIES = 3


def log(emoji, msg):
    print(f"  {emoji} Telegram: {msg}", flush=True)


def fmt_size(b):
    if b < 1024**2: return f"{b/1024:.0f} KB"
    if b < 1024**3: return f"{b/1024**2:.1f} MB"
    return f"{b/1024**3:.2f} GB"


def split_file(path, chunk_size):
    """Split file into chunks. Returns list of chunk paths."""
    fsize = os.path.getsize(path)
    if fsize <= chunk_size:
        return [path]

    n = math.ceil(fsize / chunk_size)
    log("✂️", f"Splitting {fmt_size(fsize)} into {n} chunks of ~{fmt_size(chunk_size)}")

    base = os.path.splitext(os.path.basename(path))
    chunk_dir = os.path.join(os.path.dirname(path), "tg_chunks")
    os.makedirs(chunk_dir, exist_ok=True)

    chunks = []
    with open(path, "rb") as f:
        for i in range(n):
            cp = os.path.join(chunk_dir, f"{base[0]}_part{i+1:02d}{base[1]}")
            with open(cp, "wb") as cf:
                cf.write(f.read(chunk_size))
            chunks.append(cp)
            log("📦", f"Chunk {i+1}/{n}: {fmt_size(os.path.getsize(cp))}")
    return chunks


def upload_doc(file_path, caption=""):
    """Upload a single file (must be <50MB) to Telegram."""
    fsize = os.path.getsize(file_path)
    fname = os.path.basename(file_path)

    for attempt in range(1, MAX_RETRIES + 1):
        log("📤", f"Uploading {fname} ({fmt_size(fsize)}) — attempt {attempt}/{MAX_RETRIES}")
        start = time.time()
        try:
            with open(file_path, "rb") as f:
                resp = requests.post(
                    f"{API_BASE}/sendDocument",
                    data={"chat_id": CHAT_ID, "caption": caption[:1024], "parse_mode": "HTML"},
                    files={"document": (fname, f)},
                    timeout=600,
                )
            elapsed = time.time() - start
            result = resp.json()
            if result.get("ok"):
                fid = result["result"]["document"]["file_id"]
                mid = result["result"]["message_id"]
                log("✅", f"Uploaded in {elapsed:.0f}s — msg_id: {mid}")
                return {"file_id": fid, "message_id": mid, "file_name": fname}
            else:
                log("⚠️", f"API error: {result.get('description', 'unknown')}")
        except requests.exceptions.Timeout:
            log("⏰", f"Timeout after {time.time()-start:.0f}s")
        except Exception as e:
            log("❌", f"Error: {e}")
        if attempt < MAX_RETRIES:
            time.sleep(10)

    log("❌", f"All {MAX_RETRIES} attempts failed for {fname}")
    return None


def send_text(text):
    """Send a text message."""
    try:
        resp = requests.post(f"{API_BASE}/sendMessage",
            data={"chat_id": CHAT_ID, "text": text, "parse_mode": "HTML"},
            timeout=30)
        return resp.json().get("ok", False)
    except:
        return False


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

    fsize = os.path.getsize(file_path)
    log("🚀", f"Starting: {title} ({fmt_size(fsize)})")

    # Split into chunks if needed
    chunks = split_file(file_path, MAX_CHUNK)
    is_split = len(chunks) > 1

    if is_split:
        # Send info message first
        send_text(f"📡 <b>{title}</b>\n💾 {fmt_size(fsize)} — {len(chunks)} parts")

    results = []
    for i, chunk in enumerate(chunks):
        if is_split:
            caption = f"📡 <b>{title}</b>\n📦 Part {i+1}/{len(chunks)}"
        else:
            caption = f"📡 <b>{title}</b>\n💾 {fmt_size(fsize)}\n☪️ Stream Archive"

        result = upload_doc(chunk, caption)
        if result:
            results.append(result)
        else:
            log("❌", f"Failed chunk {i+1}/{len(chunks)}")

    # Cleanup temp chunks
    if is_split:
        for c in chunks:
            if c != file_path:
                try: os.remove(c)
                except: pass
        try: os.rmdir(os.path.join(os.path.dirname(file_path), "tg_chunks"))
        except: pass

    if not results:
        log("❌", "No chunks uploaded")
        sys.exit(1)

    # Write output
    output = {"success": True, "chunks": len(results), "total": len(chunks)}
    outfile = os.environ.get("TELEGRAM_OUTPUT_FILE", "/tmp/telegram_result.json")
    with open(outfile, "w") as f:
        json.dump(output, f, indent=2)

    # GitHub output
    gh_out = os.environ.get("GITHUB_OUTPUT", "")
    if gh_out and results:
        cid_clean = str(CHAT_ID).replace("-100", "")
        mid = results[0]["message_id"]
        link = f"https://t.me/c/{cid_clean}/{mid}"
        with open(gh_out, "a") as f:
            f.write(f"telegram_link={link}\n")

    log("✅", f"Done: {len(results)}/{len(chunks)} uploaded")
    return 0

if __name__ == "__main__":
    sys.exit(main())
