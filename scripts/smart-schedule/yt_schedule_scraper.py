#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║ 📅 YOUTUBE SCHEDULE SCRAPER — Detect Scheduled/Upcoming Streams            ║
# ║                                                                            ║
# ║ YouTube shows "Scheduled for <date>" on upcoming streams.                  ║
# ║ This scrapes that info so you can:                                         ║
# ║ 1. Know EXACTLY when the next stream is (no guessing)                      ║
# ║ 2. Set a precise alarm to start polling 5min before                        ║
# ║ 3. Send a Discord alert: "Next stream in 2 hours!"                        ║
# ║ 4. Skip all polling until the scheduled time (massive savings)             ║
# ║                                                                            ║
# ║ SAFE: Does NOT modify any existing scripts. Writes to data/ only.          ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUTPUT = os.path.join(ROOT, "data", "upcoming-streams.json")


def log(msg):
    print(f"  📅 Schedule: {msg}", flush=True)


def get_upcoming_streams(channel_handle):
    """Use yt-dlp to check for scheduled/upcoming streams."""
    streams_url = f"https://www.youtube.com/{channel_handle}/streams"
    
    try:
        result = subprocess.run(
            ["yt-dlp", "--flat-playlist", "--playlist-end", "5",
             "--print", "%(id)s|%(title)s|%(live_status)s|%(release_timestamp)s|%(timestamp)s",
             streams_url],
            capture_output=True, text=True, timeout=30,
        )
        
        upcoming = []
        for line in result.stdout.strip().split("\n"):
            if not line.strip():
                continue
            parts = line.split("|")
            if len(parts) >= 3:
                video_id = parts[0]
                title = parts[1] if len(parts) > 1 else ""
                live_status = parts[2] if len(parts) > 2 else ""
                release_ts = parts[3] if len(parts) > 3 else ""
                timestamp = parts[4] if len(parts) > 4 else ""
                
                if live_status in ("is_upcoming", "is_live"):
                    entry = {
                        "video_id": video_id,
                        "title": title,
                        "status": live_status,
                        "url": f"https://www.youtube.com/watch?v={video_id}",
                    }
                    
                    # Parse scheduled time
                    for ts in (release_ts, timestamp):
                        if ts and ts not in ("NA", "None", ""):
                            try:
                                ts_int = int(ts)
                                entry["scheduled_utc"] = datetime.fromtimestamp(
                                    ts_int, tz=timezone.utc).isoformat()
                                entry["scheduled_epoch"] = ts_int
                            except (ValueError, TypeError):
                                pass
                    
                    upcoming.append(entry)
        
        return upcoming
    except Exception as e:
        log(f"Error checking streams: {e}")
        return []


def check_page_for_schedule(channel_handle):
    """Fallback: scrape the /live page for scheduled stream info."""
    try:
        result = subprocess.run(
            ["curl", "-s", "--max-time", "15",
             "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0",
             "-H", "Cookie: CONSENT=YES+cb.20230101-00-p0.en+FX+414; SOCS=CAI",
             f"https://www.youtube.com/{channel_handle}/live"],
            capture_output=True, text=True, timeout=20,
        )
        
        page = result.stdout
        
        # Look for scheduledStartTime in the page JSON
        match = re.search(r'"scheduledStartTime"\s*:\s*"(\d+)"', page)
        if match:
            ts = int(match.group(1))
            return {
                "scheduled_epoch": ts,
                "scheduled_utc": datetime.fromtimestamp(ts, tz=timezone.utc).isoformat(),
                "source": "page_scrape",
            }
        
        # Look for "Scheduled for" text
        match = re.search(r'Scheduled for\s+([^<"]+)', page)
        if match:
            return {
                "scheduled_text": match.group(1).strip(),
                "source": "page_text",
            }
    except Exception:
        pass
    
    return None


def main():
    channel = os.environ.get("YOUTUBE_CHANNEL_ID", "@TheMuslimLantern")
    
    log(f"Checking {channel} for upcoming/scheduled streams...")
    
    # Method 1: yt-dlp flat playlist
    upcoming = get_upcoming_streams(channel)
    
    # Method 2: Page scrape fallback
    page_schedule = check_page_for_schedule(channel)
    
    output = {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "channel": channel,
        "upcoming": upcoming,
        "page_schedule": page_schedule,
        "has_upcoming": len(upcoming) > 0 or page_schedule is not None,
    }
    
    if upcoming:
        for stream in upcoming:
            status = "🔴 LIVE NOW" if stream["status"] == "is_live" else "📅 Scheduled"
            scheduled = stream.get("scheduled_utc", "unknown")
            log(f"  {status}: {stream['title']}")
            if scheduled != "unknown":
                log(f"    Time: {scheduled}")
    elif page_schedule:
        log(f"  📅 Found schedule info: {page_schedule}")
    else:
        log("  No upcoming streams found")
    
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, "w") as f:
        json.dump(output, f, indent=2)
    
    log(f"Written to {OUTPUT}")
    
    # Write to GITHUB_OUTPUT if available
    github_output = os.environ.get("GITHUB_OUTPUT", "")
    if github_output:
        with open(github_output, "a") as f:
            f.write(f"has_upcoming={'true' if output['has_upcoming'] else 'false'}\n")
            if upcoming and upcoming[0].get("scheduled_epoch"):
                f.write(f"next_stream_epoch={upcoming[0]['scheduled_epoch']}\n")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
