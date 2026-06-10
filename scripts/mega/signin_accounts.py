#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  🔴 MEGA Account Keep-Alive — Sign In to All Accounts                      ║
# ║  Prevents MEGA accounts from becoming inactive.                            ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import csv
import json
import os
import shutil
import subprocess
import sys
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_FILE = os.path.join(SCRIPT_DIR, "accounts.csv")
RESULTS_FILE = os.path.join(SCRIPT_DIR, "signin_results.json")


def _mega_login(email: str, password: str) -> tuple[bool, str]:
    """Return (ok, diagnostic) after doing a lightweight MEGA account listing."""
    commands = []

    # megatools Debian package exposes megals/megadf/megaput binaries.
    if shutil.which("megals"):
        commands.append(["megals", "-u", email, "-p", password, "/Root"])
        commands.append(["megals", "-u", email, "-p", password])

    # Some custom builds expose a wrapper named `megatools`.
    if shutil.which("megatools"):
        commands.append(["megatools", "ls", "-u", email, "-p", password, "/Root"])
        commands.append(["megatools", "ls", "-u", email, "-p", password])

    if not commands:
        return False, "megatools/megals not installed"

    last_error = ""
    for cmd in commands:
        proc = subprocess.run(
            cmd,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=45,
        )
        combined = (proc.stdout or "") + "\n" + (proc.stderr or "")
        if proc.returncode == 0:
            return True, "login ok"
        last_error = combined.strip()[:180] or f"exit {proc.returncode}"

    return False, last_error


def main() -> int:
    if not os.path.exists(CSV_FILE):
        print("❌ No accounts.csv found — run generate_accounts.py first")
        with open(RESULTS_FILE, "w") as f:
            json.dump({"success": 0, "failed": 0, "total": 0, "accounts": []}, f, indent=2)
        return 1

    results = {"success": 0, "failed": 0, "total": 0, "accounts": []}

    with open(CSV_FILE, newline="") as csvfile:
        csvreader = csv.reader(csvfile)
        for row in csvreader:
            if not row or row[0].strip().lower() == "email":
                continue
            if len(row) < 2:
                continue

            time.sleep(1)
            results["total"] += 1

            email = row[0].strip()
            password = row[1].strip()

            ok, diagnostic = _mega_login(email, password)
            if ok:
                print(f"✅ [{email}]: Successfully logged in")
                results["success"] += 1
                results["accounts"].append({"email": email, "status": "ok"})
            else:
                print(f"❌ [{email}]: Login FAILED — {diagnostic}")
                results["failed"] += 1
                results["accounts"].append({"email": email, "status": "failed", "error": diagnostic})

    with open(RESULTS_FILE, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n{'=' * 50}")
    print(f"📊 Results: {results['success']}/{results['total']} accounts active")

    if results["failed"] > 0:
        print(f"⚠️ {results['failed']} accounts failed — may need regeneration")
        return 1

    print("✅ All accounts alive!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
