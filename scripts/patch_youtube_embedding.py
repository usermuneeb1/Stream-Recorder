#!/usr/bin/env python3
"""Delete and re-upload every ghost-host video with embedding enabled.

WHY: The 'video has been removed because it was too long' error in the
dashboard player is YouTube's way of saying 'this video isn't embeddable
on third-party sites'. Existing ghost-host videos were uploaded before
upload_to_youtube.py set status.embeddable=True.

Editing the existing videos via videos.update would require the broader
'youtube' OAuth scope, but our token only has 'youtube.upload'. So we
delete the affected videos (one API call each) and the next ghost-host
workflow run will re-upload them with embedding enabled.

This script:
  1. Lists every youtube_id from data/recordings.json
  2. For each, deletes the YouTube video (videos.delete needs only youtube.upload)
  3. Removes youtube_id, youtube_unlisted from data/recordings.json
  4. Commits the cleaned recordings.json so the next ghost-host workflow
     picks them up as 'needs upload'.

After this runs, manually trigger '👻 YouTube Ghost-Host' workflow to
re-upload everything with embeddable=True.
"""
import json
import os
import sys
import pathlib

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

ROOT = pathlib.Path(__file__).resolve().parent.parent
RECS = ROOT / "data" / "recordings.json"


def auth():
    return Credentials(
        token=None,
        refresh_token=os.environ["YOUTUBE_REFRESH_TOKEN"].strip(),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.environ["YOUTUBE_CLIENT_ID"].strip(),
        client_secret=os.environ["YOUTUBE_CLIENT_SECRET"].strip(),
        scopes=["https://www.googleapis.com/auth/youtube.upload"],
    )


def main():
    yt = build("youtube", "v3", credentials=auth())

    data = json.loads(RECS.read_text())
    ids_to_clear = {r["youtube_id"] for r in data if r.get("youtube_id")}
    print(f"Found {len(ids_to_clear)} YouTube IDs to delete + reset")

    deleted = []
    for vid in sorted(ids_to_clear):
        try:
            yt.videos().delete(id=vid).execute()
            print(f"  🗑️  deleted {vid}")
            deleted.append(vid)
        except HttpError as e:
            # 404 = already gone, count it as deleted so we still clear the field
            if e.resp.status == 404:
                print(f"  ⏭️  {vid}: already gone")
                deleted.append(vid)
            else:
                print(f"  ❌ {vid}: {e}")

    if not deleted:
        print("\nNothing to clear. Exiting.")
        return 0

    # Strip the deleted IDs from recordings.json so ghost-host workflow re-uploads
    cleaned = 0
    for r in data:
        if r.get("youtube_id") in deleted:
            r.pop("youtube_id", None)
            r.pop("youtube_unlisted", None)
            cleaned += 1
    RECS.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print(f"\nCleared youtube_id/youtube_unlisted from {cleaned} entries in recordings.json")
    print("Next: trigger the '👻 YouTube Ghost-Host' workflow to re-upload with embedding enabled.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
