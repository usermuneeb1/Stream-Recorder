#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  🔑 YOUTUBE GHOST-HOST — OAuth Token Setup Helper                          ║
# ║                                                                             ║
# ║  Run this ONCE locally to get your refresh token:                           ║
# ║    python3 scripts/youtube-oauth-setup.py                                   ║
# ║                                                                             ║
# ║  It will open a browser for you to authorize. After you grant access,       ║
# ║  it prints the client_id, client_secret, and refresh_token to save as       ║
# ║  GitHub secrets.                                                            ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import json
import os

# These are installed by the user: pip install google-auth-oauthlib
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
CLIENT_SECRETS_FILE = "client_secret.json"  # Download from Google Cloud Console


def main():
    print("╔═══════════════════════════════════════════════════════════════╗")
    print("║  🔑 YouTube OAuth Setup Helper                              ║")
    print("╚═══════════════════════════════════════════════════════════════╝")
    print()

    if not os.path.exists(CLIENT_SECRETS_FILE):
        print(f"❌ '{CLIENT_SECRETS_FILE}' not found in current directory.")
        print()
        print("To get one:")
        print("  1. Go to https://console.cloud.google.com/apis/credentials")
        print("  2. Create OAuth 2.0 Client ID → 'Desktop application'")
        print("  3. Download the JSON and save it as 'client_secret.json'")
        print("  4. Ensure YouTube Data API v3 is enabled for your project")
        print()
        sys.exit(1)

    print("📖 Loading client secrets...")
    flow = InstalledAppFlow.from_client_secrets_file(
        CLIENT_SECRETS_FILE, SCOPES
    )

    print("🌐 Opening browser for authorization...")
    print("   (A browser tab will open. Sign in with your YouTube channel's")
    print("    Google account and grant permission.)")
    print()

    credentials = flow.run_local_server(
        port=8080,
        prompt="consent",  # Forces re-consent so we always get a refresh token
    )

    print()
    print("╔═══════════════════════════════════════════════════════════════╗")
    print("║  ✅ AUTHORIZATION SUCCESSFUL!                               ║")
    print("╚═══════════════════════════════════════════════════════════════╝")
    print()
    print("Save these EXACT values as GitHub secrets (Settings → Secrets → Actions):")
    print()
    print(f"  YOUTUBE_CLIENT_ID:")
    print(f"    {credentials.client_id}")
    print()
    print(f"  YOUTUBE_CLIENT_SECRET:")
    print(f"    {credentials.client_secret}")
    print()
    print(f"  YOUTUBE_REFRESH_TOKEN:")
    print(f"    {credentials.refresh_token}")
    print()
    print("⚠️  The refresh token does NOT expire unless you revoke access.")
    print("   If it stops working, re-run this script to get a new one.")


if __name__ == "__main__":
    main()