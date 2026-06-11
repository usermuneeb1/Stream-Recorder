#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  🔴 MEGA Account Generator — Multi-Provider Edition                        ║
# ║  Generates MEGA.nz accounts using multiple temp email services.            ║
# ║  Provider priority: Gmailnator → Mail.tm → Mail.gw → 1secmail            ║
# ║                                                                            ║
# ║  If Gmailnator email creation works but verification fails, it            ║
# ║  automatically retries the FULL cycle with the next provider.             ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import subprocess
import os
import time
import random
import string
import csv
import argparse
from faker import Faker

from email_providers import (
    get_temp_email, wait_for_verification, find_url,
    GmailnatorProvider, MailTmProvider, MailGwProvider, OneSecMailProvider,
    PROVIDERS
)

fake = Faker()

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_FILE = os.path.join(SCRIPT_DIR, "accounts.csv")

# Track providers that fail verification (skip them for remaining accounts)
failed_providers = set()


def get_random_string(length):
    letters = string.ascii_lowercase + string.ascii_uppercase + string.digits
    return "".join(random.choice(letters) for _ in range(length))


def try_create_account(name, password, provider_classes=None):
    """
    Try the FULL cycle: create email → register MEGA → verify email.
    If verification fails, returns False so caller can retry with next provider.
    """
    if provider_classes is None:
        # Filter out providers that already failed verification
        provider_classes = [p for p in PROVIDERS if p.name not in failed_providers]
        if not provider_classes:
            provider_classes = PROVIDERS  # reset if all failed

    for ProviderClass in provider_classes:
        if ProviderClass.name in failed_providers:
            print(f"⏭️ Skipping {ProviderClass.name} (verification failed earlier)")
            continue

        provider = ProviderClass()
        print(f"📧 Trying {provider.name}...")

        # Step 1: Create email
        email = provider.create_email()
        if not email:
            print(f"❌ {provider.name} — could not create email, trying next...")
            continue

        print(f"✅ Got email: {email} ({provider.name})")

        # Step 2: Register with MEGA
        print(f"> [{email}]: Registering MEGA account...")
        registration = subprocess.run(
            [
                "megatools", "reg", "--scripted", "--register",
                "--email", email,
                "--name", name,
                "--password", password,
            ],
            universal_newlines=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=90,
        )

        if registration.returncode != 0:
            err = registration.stderr.strip()[:150]
            print(f"> [{email}]: megatools reg failed: {err}")
            continue

        verify_command = registration.stdout
        print(f"> [{email}]: Registered. Waiting for verification email...")

        # Step 3: Wait for verification email
        # Use generous timeout and match ANY email (not just "verification")
        timeout = 180 if provider.name == "Gmailnator" else 120
        email_body = wait_for_verification(
            provider,
            subject_contains="",  # match ANY email — don't filter by subject
            timeout=timeout
        )

        if not email_body:
            print(f"> [{email}]: ❌ No verification email via {provider.name} — marking as unreliable")
            failed_providers.add(provider.name)
            print(f"🔄 Retrying this account with next provider...")
            continue

        # Step 4: Extract verification link
        links = find_url(email_body)
        if not links:
            print(f"> [{email}]: No verification link found in email body")
            print(f"  Email body preview: {email_body[:200]}")
            failed_providers.add(provider.name)
            continue

        mega_link = None
        for link in links:
            if 'mega' in link.lower():
                mega_link = link
                break
        if not mega_link:
            mega_link = links[0]

        verify_command = str(verify_command).replace("@LINK@", mega_link)

        # Step 5: Run verification
        try:
            verification = subprocess.run(
                verify_command,
                shell=True,
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True,
                timeout=90,
            )

            if "registered successfully!" in str(verification.stdout):
                print(f"> [{email}] ✅ Successfully registered and verified via {provider.name}")
                print(f"  {email} — {password}")

                with open(CSV_FILE, "a", newline='') as csvfile:
                    csvwriter = csv.writer(csvfile)
                    csvwriter.writerow([
                        email, password, "-", "-", "-", provider.name
                    ])
                return True
            else:
                print(f"> [{email}]: Verification command didn't confirm success")
                print(f"  stdout: {verification.stdout[:200]}")
                return False

        except subprocess.CalledProcessError as e:
            print(f"> [{email}]: Verification command failed: {e}")
            return False

    print("❌ All providers exhausted for this account")
    return False


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════════════════

parser = argparse.ArgumentParser(description="Create New MEGA Accounts (Multi-Provider)")
parser.add_argument("-n", "--number", type=int, default=3, help="Number of accounts to create")
parser.add_argument("-p", "--password", type=str, default=None, help="Password for all accounts")
args = parser.parse_args()

if __name__ == "__main__":
    if not os.path.exists(CSV_FILE):
        with open(CSV_FILE, "w", newline='') as csvfile:
            csvwriter = csv.writer(csvfile)
            csvwriter.writerow(["Email", "MEGA Password", "Usage", "Mail.tm Password", "Mail.tm ID", "Purpose"])

    # Validate CSV
    with open(CSV_FILE) as csvfile:
        csvreader = csv.reader(csvfile)
        header = next(csvreader)
        if header != ["Email", "MEGA Password", "Usage", "Mail.tm Password", "Mail.tm ID", "Purpose"]:
            print("CSV file is not in the correct format. Please use convert_csv.py to convert it.")
            exit(1)

    provider_names = " → ".join([p.name for p in PROVIDERS])

    print(f"═══════════════════════════════════════")
    print(f"🔴 MEGA Account Generator — Multi-Provider")
    print(f"═══════════════════════════════════════")
    print(f"📊 Generating {args.number} accounts...")
    print(f"📧 Providers: {provider_names}")
    print(f"🔄 Auto-fallback: if verification fails, retries with next provider")
    print(f"═══════════════════════════════════════")

    success_count = 0
    for i in range(args.number):
        print(f"\n{'─'*40}")
        print(f"📦 Account {i+1}/{args.number}")
        print(f"{'─'*40}")

        password = args.password or get_random_string(random.randint(8, 14))
        name = fake.name()

        if try_create_account(name, password):
            success_count += 1

        if i < args.number - 1:
            delay = random.randint(3, 8)
            print(f"\n⏳ Waiting {delay}s before next account...")
            time.sleep(delay)

    print(f"\n{'═'*40}")
    total = 0
    if os.path.exists(CSV_FILE):
        with open(CSV_FILE) as f:
            total = sum(1 for _ in f) - 1
    print(f"✅ Done! {success_count}/{args.number} new accounts created")
    print(f"📊 Total accounts in CSV: {total}")
    print(f"✅ Accounts saved to {CSV_FILE}")
    if success_count == 0:
        print("❌ No new MEGA accounts were created — failing workflow so you get a real signal")
        exit(1)
