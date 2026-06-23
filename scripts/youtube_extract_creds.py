#!/usr/bin/env python3
"""Extract YouTube OAuth credentials from JSON secrets."""
import json
import os
import sys

cs = os.environ.get("YT_CLIENT_SECRETS", "").strip()
tk = os.environ.get("YT_TOKEN", "").strip()

client_id = client_secret = refresh_token = ""

if cs:
    try:
        d = json.loads(cs)
        for key in ["installed", "web"]:
            if key in d:
                client_id = d[key].get("client_id", "")
                client_secret = d[key].get("client_secret", "")
                break
        if not client_id:
            client_id = d.get("client_id", "")
            client_secret = d.get("client_secret", "")
    except Exception as e:
        print(f"❌ YOUTUBE_CLIENT_SECRETS parse error: {e}")

if tk:
    try:
        t = json.loads(tk)
        refresh_token = t.get("refresh_token", "")
    except Exception as e:
        print(f"❌ YOUTUBE_TOKEN parse error: {e}")

if not all([client_id, client_secret, refresh_token]):
    print("❌ Missing credentials")
    if not cs: print("   YOUTUBE_CLIENT_SECRETS secret is empty")
    if not tk: print("   YOUTUBE_TOKEN secret is empty")
    if cs and not client_id: print("   Could not find client_id in YOUTUBE_CLIENT_SECRETS")
    if tk and not refresh_token: print("   Could not find refresh_token in YOUTUBE_TOKEN")
    sys.exit(1)

out = os.environ.get("GITHUB_OUTPUT", "")
if out:
    with open(out, "a") as f:
        f.write(f"client_id={client_id}\n")
        f.write(f"client_secret={client_secret}\n")
        f.write(f"refresh_token={refresh_token}\n")

print(f"✅ client_id: {client_id[:15]}...")
print(f"✅ refresh_token: {refresh_token[:15]}...")
