#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  🔴 MEGA Account Generator                                                 ║
# ║  Generates MEGA.nz accounts using temporary Mail.tm emails.                ║
# ║  Based on: github.com/f-o/MEGA-Account-Generator (MIT License)            ║
# ║  Adapted for Stream Recorder pipeline automation.                          ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import requests
import subprocess
import os
import time
import re
import random
import string
import csv
import threading
import argparse
import pymailtm
from pymailtm.pymailtm import CouldNotGetAccountException, CouldNotGetMessagesException
from faker import Faker
fake = Faker()

# CSV file path — relative to this script's directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_FILE = os.path.join(SCRIPT_DIR, "accounts.csv")


def check_limit(value):
    """Validate thread count is ≤ 8 to avoid Mail.tm rate limits."""
    ivalue = int(value)
    if ivalue <= 8:
        return ivalue
    else:
        raise argparse.ArgumentTypeError("You cannot use more than 8 threads.")


parser = argparse.ArgumentParser(description="Create New MEGA Accounts")
parser.add_argument(
    "-n", "--number",
    type=int, default=3,
    help="Number of accounts to create (default: 3)",
)
parser.add_argument(
    "-t", "--threads",
    type=check_limit, default=None,
    help="Number of threads for concurrent creation (max 8)",
)
parser.add_argument(
    "-p", "--password",
    type=str, default=None,
    help="Password to use for all accounts (default: random per account)",
)
args = parser.parse_args()


def find_url(text):
    """Extract URLs from text."""
    regex = r"(?i)\b((?:https?://|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'\".,<>?«»""'']))"
    url = re.findall(regex, text)
    return [x[0] for x in url]


def get_random_string(length):
    """Generate a random alphanumeric string."""
    letters = string.ascii_lowercase + string.ascii_uppercase + string.digits
    return "".join(random.choice(letters) for _ in range(length))


class MegaAccount:
    def __init__(self, name, password):
        self.name = name
        self.password = password
        self.email = None
        self.email_id = None
        self.email_password = None
        self.verify_command = None

    def generate_mail(self):
        """Generate a temporary Mail.tm account for verification."""
        for i in range(5):
            try:
                mail = pymailtm.MailTm()
                acc = mail.get_account()
            except CouldNotGetAccountException:
                print(f"\r> Could not get new Mail.tm account. Retrying ({i+1} of 5)...", end="\n")
                sleep_output = ""
                for j in range(random.randint(8, 15)):
                    sleep_output += ". "
                    print("\r" + sleep_output, end="\033[K", flush=True)
                    time.sleep(1)
            else:
                break
        else:
            print("\nCould not get account. You are most likely blocked from Mail.tm.")
            print("Please wait 5 minutes and try again with fewer accounts/threads.")
            exit(1)

        self.email = acc.address
        self.email_id = acc.id_
        self.email_password = acc.password

    def get_mail(self):
        """Fetch the latest email from the Mail.tm account."""
        while True:
            try:
                mail = pymailtm.Account(self.email_id, self.email, self.email_password)
                messages = mail.get_messages()
                break
            except (CouldNotGetAccountException, CouldNotGetMessagesException):
                print("> Could not get latest email. Retrying...")
                time.sleep(random.randint(5, 15))
        if len(messages) == 0:
            return None
        return messages[0]

    def register(self):
        """Register a new MEGA account using megatools."""
        self.generate_mail()

        print(f"\r> [{self.email}]: Registering account...", end="\033[K", flush=True)

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

        self.verify_command = registration.stdout
        return self.email

    def verify(self):
        """Verify the MEGA account via email confirmation link."""
        confirm_message = None
        for i in range(5):
            confirm_message = self.get_mail()
            if confirm_message is not None and "verification required".lower() in confirm_message.subject.lower():
                confirm_message = self.get_mail()
                break
            print(f"\r> [{self.email}]: Waiting for verification email... ({i+1} of 5)", end="\033[K", flush=True)
            time.sleep(5)

        if confirm_message is None:
            print(f"\r> [{self.email}]: Failed to verify account. No verification email received.", end="\033[K", flush=True)
            return False

        links = find_url(confirm_message.text)
        if not links:
            print(f"\r> [{self.email}]: No verification link found in email.", end="\033[K", flush=True)
            return False

        self.verify_command = str(self.verify_command).replace("@LINK@", links[0])

        verification = subprocess.run(
            self.verify_command,
            shell=True,
            check=True,
            stdout=subprocess.PIPE,
            universal_newlines=True,
        )

        if "registered successfully!" in str(verification.stdout):
            print(f"\r> [{self.email}] Successfully registered and verified.", end="\033[K", flush=True)
            print(f"\n{self.email} - {self.password}")

            # Save to CSV
            with open(CSV_FILE, "a", newline='') as csvfile:
                csvwriter = csv.writer(csvfile)
                csvwriter.writerow([self.email, self.password, "-", self.email_password, self.email_id, "-"])
            return True
        else:
            print("Failed to verify account.")
            return False


def new_account():
    """Create and verify a single new MEGA account."""
    if args.password is None:
        password = get_random_string(random.randint(8, 14))
    else:
        password = args.password
    acc = MegaAccount(fake.name(), password)
    email = acc.register()
    print(f"\r> [{email}]: Registered. Waiting for verification email...", end="\033[K", flush=True)
    acc.verify()


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

    # Generate accounts
    if args.threads:
        print(f"Generating {args.number} accounts using {args.threads} threads.")
        threads = []
        for i in range(args.number):
            t = threading.Thread(target=new_account)
            threads.append(t)
            t.start()
        for t in threads:
            t.join()
    else:
        print(f"Generating {args.number} accounts.")
        for _ in range(args.number):
            new_account()

    print(f"\n✅ Done! Accounts saved to {CSV_FILE}")
