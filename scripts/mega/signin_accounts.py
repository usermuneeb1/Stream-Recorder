#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  🔴 MEGA Account Keep-Alive — Sign In to All Accounts                      ║
# ║  Prevents MEGA from deleting inactive accounts (90-day limit).             ║
# ║  Based on: github.com/f-o/MEGA-Account-Generator (MIT License)            ║
# ║  Adapted for Stream Recorder pipeline — outputs JSON status for Discord.  ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import csv
import subprocess
import time
import os
import json
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_FILE = os.path.join(SCRIPT_DIR, "accounts.csv")


def main():
    if not os.path.exists(CSV_FILE):
        print("❌ No accounts.csv found — run generate_accounts.py first")
        sys.exit(1)

    results = {"success": 0, "failed": 0, "total": 0, "accounts": []}

    with open(CSV_FILE) as csvfile:
        csvreader = csv.reader(csvfile)
        for row in csvreader:
            if not row or row[0] == "Email":
                continue

            time.sleep(1)
            results["total"] += 1

            email = row[0].strip()
            password = row[1].strip()

            # Login via megatools ls — this counts as activity
            login = subprocess.run(
                ["megatools", "ls", "-u", email, "-p", password],
                universal_newlines=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )

            if "/Root" in login.stdout:
                print(f"✅ [{email}]: Successfully logged in")
                results["success"] += 1
                results["accounts"].append({"email": email, "status": "ok"})
            else:
                print(f"❌ [{email}]: Login FAILED — {login.stderr.strip()[:100]}")
                results["failed"] += 1
                results["accounts"].append({"email": email, "status": "failed", "error": login.stderr.strip()[:100]})

    # Write results JSON for the workflow to pick up
    results_file = os.path.join(SCRIPT_DIR, "signin_results.json")
    with open(results_file, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n{'='*50}")
    print(f"📊 Results: {results['success']}/{results['total']} accounts active")

    if results["failed"] > 0:
        print(f"⚠️  {results['failed']} accounts failed — may need regeneration")
        sys.exit(1)

    print("✅ All accounts alive!")
    return 0


if __name__ == "__main__":
    main()
