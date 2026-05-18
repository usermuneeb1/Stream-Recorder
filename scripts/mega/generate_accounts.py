#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  🔴 MEGA Account Generator — Multi-Provider Edition                        ║
# ║  Generates MEGA.nz accounts using multiple temp email services.            ║
# ║  Based on: github.com/f-o/MEGA-Account-Generator (MIT License)            ║
# ║  Adapted for Stream Recorder with multi-provider fallback:                 ║
# ║    1. 1secmail  — 7 domains, simple API, most reliable                    ║
# ║    2. Mail.tm   — Original provider, pymailtm library                      ║
# ║    3. Mail.gw   — Mail.tm alternative, different domains                   ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import subprocess
import os
import time
import random
import string
import csv
import threading
import argparse
from faker import Faker

# Import our multi-provider email system
from email_providers import get_temp_email, wait_for_verification, find_url

fake = Faker()

# CSV file path — relative to this script's directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_FILE = os.path.join(SCRIPT_DIR, "accounts.csv")


def get_random_string(length):
    """Generate a random alphanumeric string."""
    letters = string.ascii_lowercase + string.ascii_uppercase + string.digits
    return "".join(random.choice(letters) for _ in range(length))


class MegaAccount:
    def __init__(self, name, password):
        self.name = name
        self.password = password
        self.email = None
        self.provider = None
        self.verify_command = None

    def register(self):
        """Register a new MEGA account using a temp email from any provider."""
        # Get temp email from best available provider
        self.provider, self.email = get_temp_email()

        if not self.email:
            print("❌ Could not get temp email from any provider")
            return None

        print(f"\r> [{self.email}]: Registering MEGA account...", end="\033[K", flush=True)

        # Register with MEGA using megatools
        registration = subprocess.run(
            [
                "megatools", "reg", "--scripted", "--register",
                "--email", self.email,
                "--name", self.name,
                "--password", self.password,
            ],
            universal_newlines=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        if registration.returncode != 0:
            print(f"\r> [{self.email}]: megatools reg failed: {registration.stderr.strip()[:100]}", end="\033[K\n", flush=True)
            return None

        self.verify_command = registration.stdout
        return self.email

    def verify(self):
        """Verify the MEGA account via email confirmation link."""
        print(f"\r> [{self.email}]: Waiting for verification email via {self.provider.name}...", end="\033[K", flush=True)

        # Wait for email using the provider that created it
        email_body = wait_for_verification(
            self.provider,
            subject_contains="verification",
            timeout=90
        )

        if not email_body:
            print(f"\r> [{self.email}]: No verification email received via {self.provider.name}", end="\033[K\n", flush=True)
            return False

        # Extract verification link
        links = find_url(email_body)
        if not links:
            print(f"\r> [{self.email}]: No verification link found in email", end="\033[K\n", flush=True)
            return False

        # Find the MEGA verification link
        mega_link = None
        for link in links:
            if 'mega' in link.lower():
                mega_link = link
                break
        if not mega_link:
            mega_link = links[0]  # fallback to first link

        self.verify_command = str(self.verify_command).replace("@LINK@", mega_link)

        # Run verification command
        try:
            verification = subprocess.run(
                self.verify_command,
                shell=True,
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True,
            )

            if "registered successfully!" in str(verification.stdout):
                print(f"\r> [{self.email}] ✅ Successfully registered and verified via {self.provider.name}", end="\033[K", flush=True)
                print(f"\n{self.email} - {self.password}")

                # Save to CSV
                with open(CSV_FILE, "a", newline='') as csvfile:
                    csvwriter = csv.writer(csvfile)
                    csvwriter.writerow([
                        self.email,
                        self.password,
                        "-",           # Usage
                        "-",           # Mail password (not applicable for all providers)
                        "-",           # Mail ID
                        self.provider.name  # Provider used
                    ])
                return True
            else:
                print(f"\r> [{self.email}]: Verification command didn't confirm success", end="\033[K\n", flush=True)
                return False

        except subprocess.CalledProcessError as e:
            print(f"\r> [{self.email}]: Verification command failed: {e}", end="\033[K\n", flush=True)
            return False


def new_account(password=None):
    """Create and verify a single new MEGA account."""
    if password is None:
        password = get_random_string(random.randint(8, 14))

    acc = MegaAccount(fake.name(), password)
    email = acc.register()

    if email:
        acc.verify()
    else:
        print("⚠️ Skipping verification — registration failed")


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════════════════

parser = argparse.ArgumentParser(description="Create New MEGA Accounts (Multi-Provider)")
parser.add_argument(
    "-n", "--number",
    type=int, default=3,
    help="Number of accounts to create (default: 3)",
)
parser.add_argument(
    "-p", "--password",
    type=str, default=None,
    help="Password to use for all accounts (default: random per account)",
)
args = parser.parse_args()


if __name__ == "__main__":
    # Ensure CSV file exists with correct headers
    if not os.path.exists(CSV_FILE):
        with open(CSV_FILE, "w", newline='') as csvfile:
            csvwriter = csv.writer(csvfile)
            csvwriter.writerow(["Email", "MEGA Password", "Usage", "Mail.tm Password", "Mail.tm ID", "Purpose"])

    # Validate CSV format
    with open(CSV_FILE) as csvfile:
        csvreader = csv.reader(csvfile)
        header = next(csvreader)
        if header != ["Email", "MEGA Password", "Usage", "Mail.tm Password", "Mail.tm ID", "Purpose"]:
            print("CSV file is not in the correct format. Please use convert_csv.py to convert it.")
            exit(1)

    print(f"═══════════════════════════════════════")
    print(f"🔴 MEGA Account Generator — Multi-Provider")
    print(f"═══════════════════════════════════════")
    print(f"📊 Generating {args.number} accounts...")
    print(f"📧 Email providers: 1secmail → Mail.tm → Mail.gw")
    print(f"═══════════════════════════════════════")

    for i in range(args.number):
        print(f"\n{'─'*40}")
        print(f"📦 Account {i+1}/{args.number}")
        print(f"{'─'*40}")
        new_account(password=args.password)
        if i < args.number - 1:
            delay = random.randint(3, 8)
            print(f"\n⏳ Waiting {delay}s before next account...")
            time.sleep(delay)

    print(f"\n{'═'*40}")
    total = 0
    if os.path.exists(CSV_FILE):
        with open(CSV_FILE) as f:
            total = sum(1 for _ in f) - 1  # minus header
    print(f"✅ Done! {total} total accounts in {CSV_FILE}")
