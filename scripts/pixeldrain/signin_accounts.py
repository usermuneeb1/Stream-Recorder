#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  🟣 Pixeldrain Account Keep-Alive / Health Check                           ║
# ║  Calls GET /api/user with each account's API key. A successful call counts  ║
# ║  as account activity, which cancels Pixeldrain's 7-day inactivity deletion  ║
# ║  and confirms the key still works. Writes signin_results.json.             ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import base64
import csv
import json
import os
import time

import requests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_FILE = os.path.join(SCRIPT_DIR, "accounts.csv")
RESULTS_FILE = os.path.join(SCRIPT_DIR, "signin_results.json")

API = "https://pixeldrain.com/api"


def auth_header(api_key):
    token = base64.b64encode(f":{api_key}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def check_account(email, api_key):
    """Return (ok, info) after GET /user. Activity resets the deletion timer."""
    try:
        r = requests.get(f"{API}/user", headers=auth_header(api_key), timeout=30)
        if r.status_code == 200:
            data = r.json()
            used = data.get("storage_space_used", 0)
            files = data.get("file_count", 0)
            hot = data.get("hotlinking_enabled", False)
            return True, f"ok (files={files}, used={used}B, hotlink={hot})"
        data = {}
        try:
            data = r.json()
        except Exception:
            pass
        return False, f"HTTP {r.status_code} {data.get('value', '')}".strip()
    except Exception as e:
        return False, f"error: {e}"


def main():
    if not os.path.exists(CSV_FILE):
        print("⚠️ No accounts.csv found")
        json.dump({"total": 0, "success": 0, "failed": 0}, open(RESULTS_FILE, "w"))
        raise SystemExit(0)

    with open(CSV_FILE, newline="") as f:
        rows = list(csv.DictReader(f))

    total = len(rows)
    success = 0
    failed = 0
    print("═══════════════════════════════════════")
    print(f"🟣 Pixeldrain keep-alive — {total} account(s)")
    print("═══════════════════════════════════════")

    for i, row in enumerate(rows, 1):
        email = (row.get("Email") or "").strip()
        api_key = (row.get("API Key") or "").strip()
        if not api_key:
            print(f"{i}. {email}: ⏭️ no API key")
            failed += 1
            continue
        ok, info = check_account(email, api_key)
        print(f"{i}. {email}: {'✅' if ok else '❌'} {info}")
        success += 1 if ok else 0
        failed += 0 if ok else 1
        time.sleep(1)

    print("───────────────────────────────────────")
    print(f"✅ Alive: {success}   ❌ Failed: {failed}   📊 Total: {total}")

    json.dump(
        {"total": total, "success": success, "failed": failed, "checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")},
        open(RESULTS_FILE, "w"),
        indent=2,
    )
    # Partial failure -> exit 1 so the workflow can flag it (but still commit).
    raise SystemExit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
