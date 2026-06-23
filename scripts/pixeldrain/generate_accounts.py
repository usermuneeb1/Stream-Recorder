#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  🟣 Pixeldrain Account Generator — Multi-Provider Edition                  ║
# ║  Creates Pixeldrain accounts via the official API using temporary emails.   ║
# ║  Flow per account:                                                          ║
# ║    1. Create a temp email (Gmailnator → Mail.tm → Mail.gw → 1secmail)      ║
# ║    2. POST /api/user/register  (username, email, password)                 ║
# ║    3. Wait for the "login link" email, open it to verify the account       ║
# ║    4. POST /api/user/login to obtain a permanent API key (auth_key)        ║
# ║    5. Append the account + API key to accounts.csv                          ║
# ║                                                                            ║
# ║  The API key is what the uploader/rotation uses for uploads. Each account   ║
# ║  gives free storage + its own download/transfer budget, so rotating across  ║
# ║  many accounts avoids the per-file rate limit you hit with a single one.    ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import argparse
import csv
import os
import random
import re
import string
import time

import requests
from faker import Faker

from email_providers import PROVIDERS, find_url

fake = Faker()

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_FILE = os.path.join(SCRIPT_DIR, "accounts.csv")
CSV_HEADER = ["Email", "API Key", "Password", "Usage", "Mail Password", "Mail ID", "Created"]

API = "https://pixeldrain.com/api"
ORIGIN = "https://pixeldrain.com"
HEADERS = {
    "Origin": ORIGIN,
    "Referer": f"{ORIGIN}/register",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
}

failed_providers = set()


def rand_str(length, charset=None):
    charset = charset or (string.ascii_lowercase + string.digits)
    return "".join(random.choice(charset) for _ in range(length))


def make_username():
    return (fake.user_name()[:14] + rand_str(4)).lower()


def make_password():
    # 5-50 chars per Pixeldrain rules; keep it strong and simple.
    return rand_str(16, string.ascii_letters + string.digits)


def ensure_csv():
    if not os.path.exists(CSV_FILE) or os.path.getsize(CSV_FILE) == 0:
        with open(CSV_FILE, "w", newline="") as f:
            csv.writer(f).writerow(CSV_HEADER)


def append_account(row):
    ensure_csv()
    with open(CSV_FILE, "a", newline="") as f:
        csv.writer(f).writerow(row)


def register(session, username, email, password):
    """POST /user/register. Returns True on success/login_link_sent."""
    try:
        r = session.post(
            f"{API}/user/register",
            data={"username": username, "email": email, "password": password},
            headers=HEADERS,
            timeout=30,
        )
        data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        value = data.get("value", "")
        if data.get("success") or value == "login_link_sent" or r.status_code in (200, 201, 202):
            print(f"   ✅ register: {value or 'ok'}")
            return True
        print(f"   ❌ register failed [{r.status_code}]: {value} — {data.get('message', r.text[:120])}")
        return False
    except Exception as e:
        print(f"   ❌ register error: {e}")
        return False


def extract_login_params(body):
    """Find link_login_user_id and link_login_id in the verification email."""
    if not body:
        return None, None
    # Try direct query-param extraction first.
    uid = re.search(r"link_login_user_id=([0-9a-fA-F-]{36})", body)
    lid = re.search(r"link_login_id=([0-9a-fA-F-]{36})", body)
    if uid and lid:
        return uid.group(1), lid.group(1)
    # Otherwise scan any URLs in the email.
    for url in find_url(body):
        u = re.search(r"link_login_user_id=([0-9a-fA-F-]{36})", url)
        l = re.search(r"link_login_id=([0-9a-fA-F-]{36})", url)
        if u and l:
            return u.group(1), l.group(1)
    return None, None


def login_with_link(session, email, uid, lid):
    """Complete email login → returns auth_key (API key) or None."""
    try:
        r = session.post(
            f"{API}/user/login",
            data={
                "username": email,
                "link_login_user_id": uid,
                "link_login_id": lid,
                "app_name": "tml-stream-archive",
            },
            headers=HEADERS,
            timeout=30,
        )
        data = r.json()
        key = data.get("auth_key")
        if key:
            print("   ✅ verified + API key obtained")
            return key
        print(f"   ❌ link login failed: {data.get('value')} — {data.get('message', '')[:120]}")
        return None
    except Exception as e:
        print(f"   ❌ link login error: {e}")
        return None


def enable_embedding(session, api_key):
    """Enable hotlinking + skip viewer + embed domains so uploaded files stream
    embedded without the hotlink 403. Returns True on success."""
    domains = os.environ.get(
        "PIXELDRAIN_EMBED_DOMAINS",
        "muslim-lantern-archive.vercel.app usermuneeb1.github.io",
    ).strip()
    clean = " ".join(d for d in domains.split() if "." in d)
    token = (
        __import__("base64").b64encode(f":{api_key}".encode()).decode()
    )
    try:
        r = session.put(
            f"{API}/user",
            headers={**HEADERS, "Authorization": f"Basic {token}"},
            data={
                "hotlinking_enabled": "true",
                "skip_file_viewer": "true",
                "embed_domains": clean,
            },
            timeout=30,
        )
        ok = r.status_code == 200 and r.json().get("success", False)
        print(f"   {'✅ embedded playback enabled' if ok else '⚠️ embed config skipped'}")
        return ok
    except Exception as e:
        print(f"   ⚠️ embed config error: {e}")
        return False


def login_with_password(session, email, password):
    """Fallback: password login → returns auth_key or None."""
    try:
        r = session.post(
            f"{API}/user/login",
            data={"username": email, "password": password, "app_name": "tml-stream-archive"},
            headers=HEADERS,
            timeout=30,
        )
        data = r.json()
        return data.get("auth_key")
    except Exception:
        return None


def try_create_account(password_override=None):
    """Full cycle with provider fallback. Returns account dict or None."""
    providers = [p for p in PROVIDERS if p.name not in failed_providers] or PROVIDERS
    username = make_username()
    password = password_override or make_password()

    for ProviderClass in providers:
        provider = ProviderClass()
        print(f"📧 Provider: {provider.name}")
        email = provider.create_email()
        if not email:
            print(f"   ⏭️ {provider.name} could not create email")
            continue
        print(f"   📨 {email}")

        session = requests.Session()
        if not register(session, username, email, password):
            # username may be taken — refresh and retry same provider once
            username = make_username()
            if not register(session, username, email, password):
                failed_providers.add(provider.name)
                continue

        # Wait for the verification/login-link email.
        print("   ⏳ waiting for login-link email...")
        body = None
        try:
            body = provider.wait_for_email(subject_contains="pixeldrain", timeout=180)
        except TypeError:
            body = provider.wait_for_email()
        if not body:
            print(f"   ⏭️ no email from {provider.name}, trying next provider")
            failed_providers.add(provider.name)
            continue

        uid, lid = extract_login_params(body)
        api_key = None
        if uid and lid:
            api_key = login_with_link(session, email, uid, lid)
        if not api_key:
            # Some accounts allow password login right away.
            api_key = login_with_password(session, email, password)

        if api_key:
            # Immediately enable embedded playback on the new account so any file
            # uploaded with its key streams on the site without the hotlink 403.
            enable_embedding(session, api_key)
            mail_pw = getattr(provider, "password", "") or ""
            mail_id = getattr(provider, "account_id", "") or getattr(provider, "email_id", "") or ""
            return {
                "email": email,
                "api_key": api_key,
                "password": password,
                "mail_pw": mail_pw,
                "mail_id": mail_id,
            }
        print(f"   ⏭️ could not obtain API key via {provider.name}")
        failed_providers.add(provider.name)

    return None


def main():
    parser = argparse.ArgumentParser(description="Generate Pixeldrain accounts")
    parser.add_argument("-n", "--num", type=int, default=3, help="number of accounts")
    parser.add_argument("-p", "--password", default="", help="fixed password (optional)")
    args = parser.parse_args()

    print("═══════════════════════════════════════")
    print(f"🟣 Generating {args.num} Pixeldrain account(s)")
    print("═══════════════════════════════════════")

    created = 0
    for i in range(args.num):
        print(f"\n──── Account {i + 1}/{args.num} ────")
        acc = try_create_account(args.password or None)
        if acc:
            append_account([
                acc["email"], acc["api_key"], acc["password"],
                "-", acc["mail_pw"], acc["mail_id"],
                time.strftime("%Y-%m-%d"),
            ])
            created += 1
            print("   💾 saved to accounts.csv")
        else:
            print("   ❌ account creation failed")
        time.sleep(random.uniform(2, 5))

    print("\n═══════════════════════════════════════")
    print(f"✅ Done — {created}/{args.num} accounts created")
    total = 0
    if os.path.exists(CSV_FILE):
        with open(CSV_FILE) as f:
            total = max(0, sum(1 for _ in f) - 1)
    print(f"📊 Total accounts on file: {total}")
    print("═══════════════════════════════════════")
    # Non-zero exit if nothing was created (so the workflow can flag it).
    raise SystemExit(0 if created > 0 else 1)


if __name__ == "__main__":
    main()
