#!/usr/bin/env python3
"""Enable embedding on every already-uploaded ghost-host video.

Fixes the dashboard error: 'Video has been removed because it was too long'
(YouTube's wording for 'this video is not embeddable on third-party sites').

Reads every youtube_id from data/recordings.json, calls
videos.update with status.embeddable=True for each.

Requires the same env vars as upload_to_youtube.py:
  YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN
"""
import json
import os
import sys
import pathlib

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

ROOT = pathlib.Path(__file__).resolve().parent.parent


def auth():
    cid = os.environ["YOUTUBE_CLIENT_ID"].strip()
    cs = os.environ["YOUTUBE_CLIENT_SECRET"].strip()
    rt = os.environ["YOUTUBE_REFRESH_TOKEN"].strip()
    return Credentials(
        token=None,
        refresh_token=rt,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=cid,
        client_secret=cs,
        scopes=["https://www.googleapis.com/auth/youtube"],
    )


def patch_one(yt, vid):
    """Fetch the video's existing snippet, then update status to allow embedding."""
    try:
        existing = yt.videos().list(part="snippet,status", id=vid).execute()
        items = existing.get("items", [])
        if not items:
            print(f"  ⏭️  {vid}: not found (deleted?)")
            return False
        item = items[0]
        snippet = item["snippet"]
        status = item.get("status", {})
        if status.get("embeddable") is True:
            print(f"  ✓  {vid}: already embeddable")
            return True
        body = {
            "id": vid,
            "snippet": {
                "categoryId": snippet.get("categoryId", "22"),
                "title": snippet["title"],
                "description": snippet.get("description", ""),
                "tags": snippet.get("tags", []),
            },
            "status": {
                "privacyStatus": status.get("privacyStatus", "unlisted"),
                "embeddable": True,
                "publicStatsViewable": False,
                "license": "youtube",
                "selfDeclaredMadeForKids": False,
            },
        }
        yt.videos().update(part="snippet,status", body=body).execute()
        print(f"  ✅ {vid}: embedding ENABLED")
        return True
    except HttpError as e:
        print(f"  ❌ {vid}: {e}")
        return False


def main():
    creds = auth()
    yt = build("youtube", "v3", credentials=creds)

    data = json.loads((ROOT / "data" / "recordings.json").read_text())
    ids = {r["youtube_id"] for r in data if r.get("youtube_id")}
    print(f"Found {len(ids)} unique YouTube IDs to check")

    ok = 0
    for vid in sorted(ids):
        if patch_one(yt, vid):
            ok += 1

    print(f"\n{ok}/{len(ids)} videos now embeddable.")
    return 0 if ok == len(ids) else 1


if __name__ == "__main__":
    sys.exit(main())
