#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  📤 YOUTUBE GHOST-HOST — Unlisted Upload with OAuth                        ║
# ║                                                                             ║
# ║  Uploads a video to YouTube as UNLISTED (not private, not public) so it     ║
# ║  can be embedded via Invidious proxy for playback.                          ║
# ║                                                                             ║
# ║  Prerequisites:                                                             ║
# ║    1. Google Cloud project with YouTube Data API v3 enabled                 ║
# ║    2. OAuth 2.0 Desktop credentials (client_id + client_secret)             ║
# ║    3. A refresh_token from a one-time OAuth consent flow                    ║
# ║    4. Store as secrets: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET,           ║
# ║       YOUTUBE_REFRESH_TOKEN                                                 ║
# ║                                                                             ║
# ║  Usage:  python3 scripts/upload_to_youtube.py <video.mp4>                  ║
# ║  Env:    YOUTUBE_REFRESH_TOKEN (required)                                   ║
# ║          YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET                           ║
# ║          YOUTUBE_UPLOAD_TITLE  (optional, default "Backup - <filename>")   ║
# ║          YOUTUBE_UPLOAD_DESC   (optional)                                   ║
# ║          YOUTUBE_MORPHED=true  (optional label in title)                    ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import json
import os
import sys

# ── Google API imports ─────────────────────────────────────────────────────────
# These are pip-installed in the workflow step before running this script.
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from googleapiclient.errors import HttpError

# ═══════════════════════════════════════════════════════════════════════════════
#  CONFIG
# ═══════════════════════════════════════════════════════════════════════════════

CLIENT_ID = os.environ.get("YOUTUBE_CLIENT_ID", "").strip()
CLIENT_SECRET = os.environ.get("YOUTUBE_CLIENT_SECRET", "").strip()
REFRESH_TOKEN = os.environ.get("YOUTUBE_REFRESH_TOKEN", "").strip()

CUSTOM_TITLE = os.environ.get("YOUTUBE_UPLOAD_TITLE", "").strip()
CUSTOM_DESC = os.environ.get("YOUTUBE_UPLOAD_DESC", "").strip()
IS_MORPHED = os.environ.get("YOUTUBE_MORPHED", "false").lower() in ("true", "1")


def log(msg):
    print(msg, flush=True)


def get_credentials():
    """Build OAuth2 Credentials from the stored refresh token."""
    if not REFRESH_TOKEN:
        log("❌ YOUTUBE_REFRESH_TOKEN not set — cannot upload.")
        log("   To obtain one:")
        log("   1. Go to https://console.cloud.google.com/apis/credentials")
        log("   2. Create OAuth 2.0 Client ID (Desktop app)")
        log("   3. Run the 'youtube-oauth-setup.py' script or use google_auth_oauthlib")
        log("   4. Save the refresh_token as a GitHub secret")
        return None

    creds = Credentials(
        token=None,  # Will be refreshed from the refresh token
        refresh_token=REFRESH_TOKEN,
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        token_uri="https://oauth2.googleapis.com/token",
        scopes=["https://www.googleapis.com/auth/youtube.upload"],
    )
    return creds


def upload_video(file_path: str) -> str:
    """Upload a video to YouTube (unlisted) and return the video ID."""

    creds = get_credentials()
    if not creds:
        return ""

    file_size = os.path.getsize(file_path)
    file_name = os.path.basename(file_path)

    # Build the title
    if CUSTOM_TITLE:
        title = CUSTOM_TITLE
    else:
        prefix = "👻 " if IS_MORPHED else ""
        title = f"{prefix}Backup — {file_name}"

    description = CUSTOM_DESC or (
        "Automated backup via Stream-Recorder Ghost-Host.\n"
        "This is an unlisted mirror for personal archival access.\n"
    )

    body = {
        "snippet": {
            "title": title[:100],  # YouTube max 100 chars
            "description": description[:5000],
            "tags": ["backup", "archive", "the-muslim-lantern"],
        },
        "status": {
            "privacyStatus": "unlisted",
            "selfDeclaredMadeForKids": False,
            "embeddable": True,
            "publicStatsViewable": False,
            "license": "youtube",
        },
    }

    log(f"   📤 Uploading to YouTube (unlisted): {file_name} ({file_size / 1024 / 1024:.1f} MB)")
    log(f"   📝 Title: {title[:80]}")

    try:
        youtube = build("youtube", "v3", credentials=creds)

        media = MediaFileUpload(file_path, chunksize=256 * 1024, resumable=True)

        request = youtube.videos().insert(
            part="snippet,status",
            body=body,
            media_body=media,
        )

        # ── Resumable upload with progress ──
        response = None
        last_progress = -1

        while response is None:
            status, response = request.next_chunk()

            if status:
                progress = int(status.progress() * 100)
                if progress != last_progress and progress % 10 == 0:
                    log(f"      Upload progress: {progress}%")
                    last_progress = progress

        video_id = response.get("id", "")
        log("   ✅ Upload complete!")
        log(f"   🆔 YouTube Video ID: {video_id}")
        log(f"   🔗 URL: https://youtu.be/{video_id}")

        return video_id

    except HttpError as e:
        error_detail = json.loads(e.content) if e.content else {}
        reason = error_detail.get("error", {}).get("errors", [{}])[0].get("reason", str(e))
        log(f"   ❌ YouTube API error: {reason}")

        if reason == "quotaExceeded":
            log("   💡 Daily upload quota exceeded (default is 6/day for verified accounts).")
            log("      Wait until your quota resets (midnight PT) or request more.")
        elif reason == "uploadLimit":
            log("   💡 Upload limit reached. Wait and retry later.")
        elif reason == "insufficientPermissions":
            log("   💡 Your OAuth token doesn't have youtube.upload scope.")
            log("      Delete and re-authorize with the correct scopes.")
        elif reason in ("videoNotEligibleForUpload", "uploadLimitExceeded",
                        "tooLong", "videoTooLong"):
            # YouTube returns one of these when the file exceeds the 15-min
            # cap on unverified accounts. The actual message is usually
            # 'Account must be verified to upload videos longer than 15 minutes.'
            log("   🔒 This account is NOT verified by phone.")
            log("      Unverified accounts can only upload videos up to 15 minutes.")
            log("      Verify at: https://www.youtube.com/verify")
            log("      After verifying, set repo Variable YOUTUBE_VERIFIED=true.")
        return ""

    except Exception as e:
        log(f"   ❌ Upload failed: {e}")
        return ""


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/upload_to_youtube.py <video.mp4>")
        sys.exit(1)

    file_path = sys.argv[1]
    if not os.path.exists(file_path):
        print(f"❌ File not found: {file_path}")
        sys.exit(1)

    video_id = upload_video(file_path)

    if video_id:
        # Print just the video ID on the last line for the workflow to capture
        print(f"\nVIDEO_ID={video_id}", flush=True)
        sys.exit(0)
    else:
        sys.exit(1)