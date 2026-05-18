#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  📧 Multi-Provider Temp Email System                                       ║
# ║  Supports multiple temp email services with automatic fallback:            ║
# ║                                                                            ║
# ║    1. Gmailnator  — REAL Gmail addresses (@gmail.com) via RapidAPI        ║
# ║    2. Mail.tm     — 1 domain, REST API, pymailtm library                  ║
# ║    3. Mail.gw     — Multiple domains, same API as Mail.tm                  ║
# ║    4. 1secmail    — 7 domains, simple REST API (MEGA may block)            ║
# ║                                                                            ║
# ║  Gmailnator is #1 because MEGA NEVER blocks @gmail.com addresses.         ║
# ║  The system tries each provider in order with automatic fallback.          ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import requests
import time
import random
import re
import json
import os
import html


def find_url(text):
    """Extract URLs from text (works with both plain text and HTML)."""
    # First try to decode HTML entities
    text = html.unescape(text)
    regex = r"(?i)\b((?:https?://|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}/)(?:[^\s()<>\"]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'\".,<>?«»""'']))"
    url = re.findall(regex, text)
    return [x[0] for x in url]


# ═══════════════════════════════════════════════════════════════════════════════
#  PROVIDER 1: Gmailnator — REAL Gmail addresses (BEST for MEGA)
#  Uses RapidAPI Gmailnator endpoint. Requires RAPIDAPI_KEY secret.
#  Gmail addresses are NEVER blocked by MEGA.
# ═══════════════════════════════════════════════════════════════════════════════

class GmailnatorProvider:
    """Gmailnator — Real @gmail.com addresses via RapidAPI. MEGA trusts Gmail."""
    name = "Gmailnator"
    BASE_URL = "https://gmailnator.p.rapidapi.com/api"

    def __init__(self):
        self.email = None
        self.api_key = os.environ.get("RAPIDAPI_KEY", "")

    def create_email(self):
        """Generate a Gmail address using Gmailnator API."""
        if not self.api_key:
            print(f"  [{self.name}] RAPIDAPI_KEY not set — skipping")
            return None

        headers = {
            "Content-Type": "application/json",
            "x-rapidapi-host": "gmailnator.p.rapidapi.com",
            "x-rapidapi-key": self.api_key,
        }

        # Use gmail plus and dot tricks — these look like real Gmail accounts
        # Priority: private types first (more reliable), then public
        email_types = [
            ["private_gmail_plus", "private_gmail_dot"],
            ["public_gmail_plus", "public_gmail_dot"],
            ["private_googlemail", "public_googlemail"],
        ]

        for types in email_types:
            try:
                resp = requests.post(
                    f"{self.BASE_URL}/emails/generate",
                    headers=headers,
                    json={"type": types},
                    timeout=15,
                )

                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("status") == "success" and data.get("email"):
                        self.email = data["email"]
                        email_type = data.get("type", "unknown")
                        print(f"  [{self.name}] ✅ Created: {self.email} ({email_type})")
                        return self.email
                elif resp.status_code == 429:
                    print(f"  [{self.name}] Rate limited — waiting 5s...")
                    time.sleep(5)
                else:
                    print(f"  [{self.name}] HTTP {resp.status_code}: {resp.text[:100]}")

            except Exception as e:
                print(f"  [{self.name}] Error: {e}")

        print(f"  [{self.name}] All email types exhausted")
        return None

    def wait_for_email(self, subject_contains="verify", timeout=120):
        """Poll Gmailnator inbox for verification email."""
        if not self.email or not self.api_key:
            return None

        headers = {
            "Content-Type": "application/json",
            "x-rapidapi-host": "gmailnator.p.rapidapi.com",
            "x-rapidapi-key": self.api_key,
        }

        start = time.time()
        while time.time() - start < timeout:
            try:
                # List inbox messages
                resp = requests.post(
                    f"{self.BASE_URL}/inbox/",
                    headers=headers,
                    json={"email": self.email, "limit": 5},
                    timeout=15,
                )

                if resp.status_code == 200:
                    data = resp.json()
                    messages = data.get("messages", [])

                    if messages:
                        # Find the verification email
                        target_msg = None
                        for msg in messages:
                            subj = msg.get("subject", "").lower()
                            if "mega" in subj or "verify" in subj or "confirm" in subj:
                                target_msg = msg
                                break
                        if not target_msg:
                            target_msg = messages[0]  # fallback to first message

                        # Read full message content
                        msg_id = target_msg["id"]
                        msg_resp = requests.get(
                            f"{self.BASE_URL}/inbox/{msg_id}",
                            headers={
                                "x-rapidapi-host": "gmailnator.p.rapidapi.com",
                                "x-rapidapi-key": self.api_key,
                            },
                            timeout=15,
                        )

                        if msg_resp.status_code == 200:
                            msg_data = msg_resp.json()
                            content = msg_data.get("content", "")
                            if content:
                                return content

            except Exception as e:
                print(f"  [{self.name}] Inbox check error: {e}")

            time.sleep(5)

        return None


# ═══════════════════════════════════════════════════════════════════════════════
#  PROVIDER 2: Mail.tm (via pymailtm library)
# ═══════════════════════════════════════════════════════════════════════════════

class MailTmProvider:
    """Mail.tm — Uses pymailtm library. Proven to work with MEGA."""
    name = "Mail.tm"

    def __init__(self):
        self.email = None
        self.email_id = None
        self.email_password = None

    def create_email(self):
        """Create a new temp email address."""
        try:
            import pymailtm
            from pymailtm.pymailtm import CouldNotGetAccountException
        except ImportError:
            print(f"  [{self.name}] pymailtm not installed")
            return None

        for i in range(3):
            try:
                mail = pymailtm.MailTm()
                acc = mail.get_account()
                self.email = acc.address
                self.email_id = acc.id_
                self.email_password = acc.password
                return self.email
            except (CouldNotGetAccountException, Exception) as e:
                print(f"  [{self.name}] Attempt {i+1}/3 failed: {e}")
                time.sleep(random.randint(5, 10))
        return None

    def wait_for_email(self, subject_contains="verify", timeout=60):
        """Wait for verification email and return its body text."""
        try:
            import pymailtm
            from pymailtm.pymailtm import CouldNotGetAccountException, CouldNotGetMessagesException
        except ImportError:
            return None

        start = time.time()
        while time.time() - start < timeout:
            try:
                mail = pymailtm.Account(self.email_id, self.email, self.email_password)
                messages = mail.get_messages()
                if messages:
                    for msg in messages:
                        if subject_contains.lower() in msg.subject.lower():
                            return msg.text
                    if messages:
                        return messages[0].text
            except (CouldNotGetAccountException, CouldNotGetMessagesException):
                pass
            except Exception:
                pass
            time.sleep(5)
        return None


# ═══════════════════════════════════════════════════════════════════════════════
#  PROVIDER 3: Mail.gw (same API structure as Mail.tm, different domains)
# ═══════════════════════════════════════════════════════════════════════════════

class MailGwProvider:
    """Mail.gw — Multiple domains, REST API compatible with Mail.tm."""
    name = "Mail.gw"
    BASE_URL = "https://api.mail.gw"

    def __init__(self):
        self.email = None
        self.password = None
        self.token = None
        self.account_id = None

    def create_email(self):
        """Create a new temp email address."""
        try:
            domains_resp = requests.get(f"{self.BASE_URL}/domains", timeout=10)
            domains_data = domains_resp.json()
            domains = [d['domain'] for d in domains_data.get('hydra:member', [])]

            if not domains:
                print(f"  [{self.name}] No domains available")
                return None

            domain = random.choice(domains)
            login = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=12))
            self.password = ''.join(random.choices('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', k=16))
            self.email = f"{login}@{domain}"

            create_resp = requests.post(
                f"{self.BASE_URL}/accounts",
                json={"address": self.email, "password": self.password},
                headers={"Content-Type": "application/json"},
                timeout=10
            )

            if create_resp.status_code in (200, 201):
                data = create_resp.json()
                self.account_id = data.get('id', '')

                token_resp = requests.post(
                    f"{self.BASE_URL}/token",
                    json={"address": self.email, "password": self.password},
                    headers={"Content-Type": "application/json"},
                    timeout=10
                )
                if token_resp.status_code == 200:
                    self.token = token_resp.json().get('token', '')
                    print(f"  [{self.name}] Created: {self.email}")
                    return self.email

        except Exception as e:
            print(f"  [{self.name}] Failed to create email: {e}")
        return None

    def wait_for_email(self, subject_contains="verify", timeout=90):
        """Wait for verification email and return its body text."""
        if not self.token:
            return None

        headers = {"Authorization": f"Bearer {self.token}"}
        start = time.time()

        while time.time() - start < timeout:
            try:
                resp = requests.get(
                    f"{self.BASE_URL}/messages",
                    headers=headers,
                    timeout=10
                )
                if resp.status_code == 200:
                    messages = resp.json().get('hydra:member', [])
                    if messages:
                        msg_id = messages[0]['id']
                        msg_resp = requests.get(
                            f"{self.BASE_URL}/messages/{msg_id}",
                            headers=headers,
                            timeout=10
                        )
                        if msg_resp.status_code == 200:
                            msg = msg_resp.json()
                            return msg.get('text', '') or msg.get('html', [''])[0]
            except Exception:
                pass
            time.sleep(5)
        return None


# ═══════════════════════════════════════════════════════════════════════════════
#  PROVIDER 4: 1secmail (direct REST API — fallback only)
# ═══════════════════════════════════════════════════════════════════════════════

class OneSecMailProvider:
    """1secmail.com — 7 domains, simple API. MEGA may block these domains."""
    name = "1secmail"
    BASE_URL = "https://www.1secmail.com/api/v1/"

    def __init__(self):
        self.email = None
        self.login = None
        self.domain = None

    def create_email(self):
        """Create a new temp email address."""
        try:
            domains_resp = requests.get(
                f"{self.BASE_URL}?action=getDomainList",
                timeout=10
            )
            domains = domains_resp.json()

            if not domains:
                print(f"  [{self.name}] No domains available")
                return None

            self.domain = random.choice(domains)
            login = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=12))
            self.login = login
            self.email = f"{login}@{self.domain}"

            check = requests.get(
                f"{self.BASE_URL}?action=getMessages&login={self.login}&domain={self.domain}",
                timeout=10
            )
            if check.status_code == 200:
                print(f"  [{self.name}] Created: {self.email}")
                return self.email

        except Exception as e:
            print(f"  [{self.name}] Failed to create email: {e}")
        return None

    def wait_for_email(self, subject_contains="verify", timeout=90):
        """Wait for verification email and return its body text."""
        start = time.time()
        while time.time() - start < timeout:
            try:
                resp = requests.get(
                    f"{self.BASE_URL}?action=getMessages&login={self.login}&domain={self.domain}",
                    timeout=10
                )
                messages = resp.json()
                if messages:
                    msg_id = messages[0]['id']
                    msg_resp = requests.get(
                        f"{self.BASE_URL}?action=readMessage&login={self.login}&domain={self.domain}&id={msg_id}",
                        timeout=10
                    )
                    msg = msg_resp.json()
                    body = msg.get('textBody', '') or msg.get('body', '') or msg.get('htmlBody', '')
                    if body:
                        return body
            except Exception:
                pass
            time.sleep(5)
        return None


# ═══════════════════════════════════════════════════════════════════════════════
#  MULTI-PROVIDER MANAGER — Tries each provider with automatic fallback
# ═══════════════════════════════════════════════════════════════════════════════

# Provider order:
#   1. Gmailnator — BEST: real @gmail.com, MEGA never blocks Gmail
#   2. Mail.tm    — GOOD: proven to work, but temp domains could get blocked
#   3. Mail.gw    — OK: alternative to Mail.tm
#   4. 1secmail   — LAST RESORT: MEGA usually blocks these domains
PROVIDERS = [
    GmailnatorProvider,   # Real Gmail addresses — MEGA trusts these 100%
    MailTmProvider,        # Mail.tm fallback (proven, but detectable)
    MailGwProvider,        # Mail.gw fallback (different domains)
    OneSecMailProvider,    # 1secmail last resort (usually blocked by MEGA)
]


def get_temp_email(provider_classes=None):
    """
    Try to create a temp email using available providers.
    Returns (provider_instance, email_address) or (None, None).
    """
    if provider_classes is None:
        provider_classes = PROVIDERS

    for ProviderClass in provider_classes:
        provider = ProviderClass()
        print(f"📧 Trying {provider.name}...")

        email = provider.create_email()
        if email:
            print(f"✅ Got email from {provider.name}: {email}")
            return provider, email
        else:
            print(f"❌ {provider.name} failed — trying next provider...")

    print("❌ All email providers failed!")
    return None, None


def wait_for_verification(provider, subject_contains="verify", timeout=120):
    """
    Wait for a verification email using the provider instance.
    Returns email body text or None.
    """
    print(f"📨 Waiting for email via {provider.name} (timeout: {timeout}s)...")
    body = provider.wait_for_email(subject_contains=subject_contains, timeout=timeout)

    if body:
        print(f"✅ Email received via {provider.name}")
        return body
    else:
        print(f"❌ No email received via {provider.name} within {timeout}s")
        return None


# Test if run directly
if __name__ == "__main__":
    print("═══════════════════════════════════════")
    print("📧 Multi-Provider Temp Email Test")
    print("═══════════════════════════════════════")

    provider, email = get_temp_email()
    if email:
        print(f"\n✅ Success! Email: {email}")
        print(f"   Provider: {provider.name}")
        print(f"\n⏳ Waiting 30s for any incoming email...")
        body = wait_for_verification(provider, subject_contains="", timeout=30)
        if body:
            print(f"\n📨 Email body:\n{body[:500]}")
        else:
            print("\n📭 No emails received (expected for a test)")
    else:
        print("\n❌ Could not create temp email from any provider")
