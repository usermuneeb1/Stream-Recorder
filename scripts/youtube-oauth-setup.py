#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  🔑 YOUTUBE GHOST-HOST — OAuth Token Setup Helper                          ║
# ║                                                                             ║
# ║  Run this ONCE locally to get your refresh token:                           ║
# ║    python youtube-oauth-setup.py                                            ║
# ║                                                                             ║
# ║  It will open a browser for you to authorize. After you grant access,       ║
# ║  it saves youtube_token.json and prints the values for GitHub secrets.      ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import json
import os
import sys

# These are installed by the user: pip install google-auth-oauthlib
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]

# Accept both filenames — user might name it either way
CLIENT_SECRETS_FILE = None
for name in ["client_secrets.json", "client_secret.json"]:
    if os.path.exists(name):
        CLIENT_SECRETS_FILE = name
        break


def main():
    print("╔═══════════════════════════════════════════════════════════════╗")
    print("║  🔑 YouTube OAuth Setup Helper                              ║")
    print("╚═══════════════════════════════════════════════════════════════╝")
    print()

    if not CLIENT_SECRETS_FILE:
        print("❌ Client secrets file not found!")
        print()
        print("Make sure one of these files exists in the SAME folder as this script:")
        print("  - client_secrets.json")
        print("  - client_secret.json")
        print()
        print("To get one:")
        print("  1. Go to https://console.cloud.google.com/apis/credentials")
        print("  2. Create OAuth 2.0 Client ID → 'Desktop application'")
        print("  3. Download the JSON and save it here")
        print("  4. Ensure YouTube Data API v3 is enabled for your project")
        print()
        input("Press Enter to exit...")
        sys.exit(1)

    print(f"📖 Loading {CLIENT_SECRETS_FILE}...")
    flow = InstalledAppFlow.from_client_secrets_file(
        CLIENT_SECRETS_FILE, SCOPES
    )

    print("🌐 Opening browser for authorization...")
    print("   A browser tab will open.")
    print("   Sign in with the YouTube account you want to upload to.")
    print("   Click 'Advanced' → 'Go to Stream Recorder (unsafe)' → Allow all.")
    print()

    credentials = flow.run_local_server(
        port=8080,
        prompt="consent",
    )

    # Save token to file
    token_data = {
        "token": credentials.token,
        "refresh_token": credentials.refresh_token,
        "token_uri": credentials.token_uri,
        "client_id": credentials.client_id,
        "client_secret": credentials.client_secret,
        "scopes": credentials.scopes,
    }
    with open("youtube_token.json", "w") as f:
        json.dump(token_data, f, indent=2)

    print()
    print("╔═══════════════════════════════════════════════════════════════╗")
    print("║  ✅ SUCCESS! Token saved to youtube_token.json              ║")
    print("╚═══════════════════════════════════════════════════════════════╝")
    print()
    print("Now add these as GitHub Secrets:")
    print()
    print("1. Open client_secrets.json with Notepad → copy ALL text")
    print("   Secret name: YOUTUBE_CLIENT_SECRETS")
    print()
    print("2. Open youtube_token.json with Notepad → copy ALL text")
    print("   Secret name: YOUTUBE_TOKEN")
    print()
    print(f"  Refresh Token: {credentials.refresh_token}")
    print()
    print("⚠️  The refresh token does NOT expire unless you revoke access.")
    print()
    input("Press Enter to exit...")


if __name__ == "__main__":
    main()
