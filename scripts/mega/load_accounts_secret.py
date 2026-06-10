#!/usr/bin/env python3
"""Load MEGA account credentials from MEGA_ACCOUNTS_JSON into accounts.csv.

Expected secret formats:
  1) JSON array: [{"email":"a@example.com","password":"..."}]
  2) JSON object: {"accounts":[...]}

This avoids committing MEGA account passwords to the public repository.
"""

import csv
import json
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
OUT = SCRIPT_DIR / "accounts.csv"


def main() -> int:
    raw = os.environ.get("MEGA_ACCOUNTS_JSON", "").strip()
    if not raw:
        print("ℹ️ MEGA_ACCOUNTS_JSON not set — using repo/local accounts.csv if present")
        return 0

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"❌ MEGA_ACCOUNTS_JSON is not valid JSON: {exc}")
        return 1

    accounts = data.get("accounts", data) if isinstance(data, dict) else data
    if not isinstance(accounts, list):
        print("❌ MEGA_ACCOUNTS_JSON must be a JSON array or an object with accounts[]")
        return 1

    rows = []
    for item in accounts:
        if not isinstance(item, dict):
            continue
        email = str(item.get("email") or item.get("Email") or "").strip()
        password = str(item.get("password") or item.get("mega_password") or item.get("MEGA Password") or "").strip()
        if email and password:
            rows.append([email, password, item.get("usage", "-"), "-", "-", "Secret"])

    if not rows:
        print("❌ MEGA_ACCOUNTS_JSON contained no valid email/password entries")
        return 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["Email", "MEGA Password", "Usage", "Mail.tm Password", "Mail.tm ID", "Purpose"])
        writer.writerows(rows)

    os.chmod(OUT, 0o600)
    print(f"✅ Loaded {len(rows)} MEGA account(s) from MEGA_ACCOUNTS_JSON into {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
