#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  🟣 Pixeldrain — Enable Embedded Playback on Accounts                      ║
# ║  Calls PUT /api/user for each account in accounts.csv to enable:           ║
# ║    • hotlinking_enabled  → files can be streamed on other sites (no 403)    ║
# ║    • skip_file_viewer    → direct /api/file links skip the viewer page      ║
# ║    • embed_domains       → your site domains allowed to embed               ║
# ║                                                                            ║
# ║  After this, any file uploaded with the account's API key plays embedded.   ║
# ║                                                                            ║
# ║  Env:  PIXELDRAIN_EMBED_DOMAINS (space separated, default = TML site)       ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import base64
import csv
import os
import sys

import requests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_FILE = os.path.join(SCRIPT_DIR, "accounts.csv")
API = "https://pixeldrain.com/api"
ORIGIN = "https://pixeldrain.com"

DEFAULT_DOMAINS = "muslim-lantern-archive.vercel.app usermuneeb1.github.io"


def auth_header(api_key):
    token = base64.b64encode(f":{api_key}".encode()).decode()
    return {"Authorization": f"Basic {token}", "Origin": ORIGIN, "Referer": f"{ORIGIN}/user"}


def configure(api_key, domains):
    # embed_domains must each contain a period; filter out bad ones (e.g. localhost).
    clean = " ".join(d for d in domains.split() if "." in d)
    data = {
        "hotlinking_enabled": "true",
        "skip_file_viewer": "true",
        "embed_domains": clean,
    }
    r = requests.put(f"{API}/user", headers=auth_header(api_key), data=data, timeout=30)
    try:
        j = r.json()
    except Exception:
        j = {"message": r.text[:120]}
    return r.status_code == 200 and j.get("success", False), j.get("value", j.get("message", ""))


def main():
    domains = os.environ.get("PIXELDRAIN_EMBED_DOMAINS", DEFAULT_DOMAINS).strip() or DEFAULT_DOMAINS

    if not os.path.exists(CSV_FILE):
        print("⚠️ No accounts.csv found")
        return 0

    with open(CSV_FILE, newline="") as f:
        rows = list(csv.DictReader(f))

    if not rows:
        print("⚠️ accounts.csv is empty")
        return 0

    print("═══════════════════════════════════════")
    print(f"🟣 Enabling embedded playback on {len(rows)} account(s)")
    print(f"   embed_domains = {domains}")
    print("═══════════════════════════════════════")

    ok_count = 0
    for i, row in enumerate(rows, 1):
        email = (row.get("Email") or "").strip()
        api_key = (row.get("API Key") or "").strip()
        if not api_key:
            print(f"{i}. {email}: ⏭️ no API key")
            continue
        ok, info = configure(api_key, domains)
        print(f"{i}. {email}: {'✅ embed enabled' if ok else '❌ ' + str(info)}")
        ok_count += 1 if ok else 0

    print("───────────────────────────────────────")
    print(f"✅ Configured {ok_count}/{len(rows)} account(s) for embedded playback")
    return 0 if ok_count > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
