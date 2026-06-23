#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║ 🤖 DISCORD COMMAND BOT — Remote Control Panel                             ║
# ║                                                                            ║
# ║ Control your entire Stream Recorder system from Discord.                   ║
# ║ Uses Discord Interactions (slash commands) via webhook — NO gateway        ║
# ║ connection needed. Runs as a Cloudflare Worker or Vercel Edge Function.    ║
# ║                                                                            ║
# ║ Commands:                                                                  ║
# ║   /status     — System health (accounts, storage, last recording)         ║
# ║   /record     — Trigger a recording via GitHub Actions workflow_dispatch   ║
# ║   /accounts   — Show MEGA/GDrive/Pixeldrain account status                ║
# ║   /refresh    — Trigger mirror repair workflow                             ║
# ║   /latest     — Show the latest recording with links                      ║
# ║                                                                            ║
# ║ Deploy options:                                                            ║
# ║   1. Cloudflare Worker (free, recommended)                                ║
# ║   2. Vercel Edge Function (free, you already have Vercel)                 ║
# ║   3. GitHub Actions on schedule (poll-based, no server needed)            ║
# ║                                                                            ║
# ║ This file implements Option 3: a GitHub Actions workflow that reads       ║
# ║ commands from a Discord channel and responds. No server needed.           ║
# ║                                                                            ║
# ║ SAFE: Does NOT touch any existing scripts/workflows.                      ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import os
import sys
import requests
from datetime import datetime, timezone

# ─── Configuration ────────────────────────────────────────────────────────────
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPO = os.environ.get("GITHUB_REPOSITORY", "usermuneeb1/Stream-Recorder")
DISCORD_WEBHOOK_URL = os.environ.get("DISCORD_WEBHOOK_URL", "")
DASHBOARD_URL = "https://muslim-lantern-archive.vercel.app"
RECORDINGS_URL = f"https://raw.githubusercontent.com/{GITHUB_REPO}/main/data/recordings.json"
STATUS_URL = f"https://raw.githubusercontent.com/{GITHUB_REPO}/main/data/system-status.json"


def send_discord_embed(title, description, color, fields=None, footer=None):
    """Send a rich embed to Discord."""
    embed = {
        "title": title,
        "description": description,
        "color": color,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if fields:
        embed["fields"] = fields
    if footer:
        embed["footer"] = {"text": footer}

    payload = {"embeds": [embed]}
    try:
        resp = requests.post(DISCORD_WEBHOOK_URL, json=payload, timeout=10)
        return resp.status_code == 204
    except Exception as e:
        print(f"Discord send failed: {e}")
        return False


def get_latest_recording():
    """Fetch the latest recording from recordings.json."""
    try:
        resp = requests.get(RECORDINGS_URL, timeout=10)
        recordings = resp.json()
        if recordings:
            return recordings[0]
    except Exception:
        pass
    return None


def get_system_status():
    """Fetch system status."""
    try:
        resp = requests.get(STATUS_URL, timeout=10)
        return resp.json()
    except Exception:
        return None


def trigger_workflow(workflow_name):
    """Trigger a GitHub Actions workflow via workflow_dispatch."""
    url = f"https://api.github.com/repos/{GITHUB_REPO}/actions/workflows/{workflow_name}/dispatches"
    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json",
    }
    payload = {"ref": "main"}
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=10)
        return resp.status_code == 204
    except Exception:
        return False


def cmd_status():
    """Show system health."""
    status = get_system_status()
    latest = get_latest_recording()

    fields = []
    if status:
        fields.append({"name": "📊 Total Recordings", "value": str(status.get("total_recordings", "?")), "inline": True})
        fields.append({"name": "⏱️ Total Hours", "value": f"{status.get('total_hours', 0):.1f}h", "inline": True})
        fields.append({"name": "💾 Total Size", "value": f"{status.get('total_gb', 0):.2f} GB", "inline": True})

    if latest:
        fields.append({
            "name": "🎬 Latest Recording",
            "value": f"**{latest.get('title', 'Unknown')}**\n📅 {latest.get('date', '?')}\n⏱️ {latest.get('duration_fmt', '?')}",
            "inline": False,
        })

    send_discord_embed(
        "📡 Stream Recorder — System Status",
        f"[🌐 Dashboard]({DASHBOARD_URL})",
        5763757,  # Green
        fields=fields,
        footer="Stream Recorder Bot",
    )


def cmd_latest():
    """Show the latest recording with all links."""
    latest = get_latest_recording()
    if not latest:
        send_discord_embed("❌ No Recordings", "No recordings found in the database.", 15158332)
        return

    links = []
    if latest.get("github_release"):
        links.append(f"[▶️ GitHub CDN]({latest['github_release']})")
    if latest.get("archive_link"):
        links.append(f"[🏛️ Archive.org]({latest['archive_link']})")
    if latest.get("mega_link"):
        links.append(f"[🔴 MEGA]({latest['mega_link']})")
    if latest.get("pixeldrain_link"):
        links.append(f"[📥 Pixeldrain]({latest['pixeldrain_link']})")
    if latest.get("telegram_link"):
        links.append(f"[📱 Telegram]({latest['telegram_link']})")

    fields = [
        {"name": "📅 Date", "value": latest.get("date", "?"), "inline": True},
        {"name": "⏱️ Duration", "value": latest.get("duration_fmt", "?"), "inline": True},
        {"name": "💾 Size", "value": latest.get("size_human", "?"), "inline": True},
        {"name": "🔗 Download Links", "value": "\n".join(links) if links else "No links", "inline": False},
    ]

    send_discord_embed(
        f"🎬 {latest.get('title', 'Latest Recording')}",
        f"[🌐 Watch on Dashboard]({DASHBOARD_URL}/watch/{latest.get('video_id', '')})",
        3447003,  # Blue
        fields=fields,
    )


def cmd_record():
    """Trigger a recording workflow."""
    if trigger_workflow("stream-recorder.yml"):
        send_discord_embed(
            "🔴 Recording Triggered",
            "Stream recorder workflow dispatched. Check GitHub Actions for progress.",
            15736129,  # Red
        )
    else:
        send_discord_embed("❌ Trigger Failed", "Could not dispatch workflow. Check GITHUB_TOKEN.", 15158332)


def cmd_refresh():
    """Trigger mirror repair."""
    if trigger_workflow("repair-mirrors.yml"):
        send_discord_embed(
            "🔄 Mirror Refresh Triggered",
            "Repair-mirrors workflow dispatched.",
            5763757,
        )
    else:
        send_discord_embed("❌ Trigger Failed", "Could not dispatch workflow.", 15158332)


def cmd_accounts():
    """Show account status summary."""
    status = get_system_status()
    fields = []
    if status:
        accounts = status.get("accounts", {})
        for service, info in accounts.items():
            fields.append({
                "name": f"{'🔴' if service == 'mega' else '🟢' if service == 'gdrive' else '🟣'} {service.upper()}",
                "value": f"Active: {info.get('active', '?')} | Total: {info.get('total', '?')}",
                "inline": True,
            })

    if not fields:
        fields.append({"name": "ℹ️ Info", "value": "Account data not available in system-status.json. Add it!", "inline": False})

    send_discord_embed(
        "👥 Account Status",
        "Cloud storage account overview",
        10181046,  # Purple
        fields=fields,
    )


# ─── Main (CLI dispatcher) ───────────────────────────────────────────────────
COMMANDS = {
    "status": cmd_status,
    "latest": cmd_latest,
    "record": cmd_record,
    "refresh": cmd_refresh,
    "accounts": cmd_accounts,
}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 discord_bot.py <command>")
        print(f"Commands: {', '.join(COMMANDS.keys())}")
        sys.exit(1)

    command = sys.argv[1].lower().strip("/")
    if command in COMMANDS:
        COMMANDS[command]()
    else:
        print(f"Unknown command: {command}")
        print(f"Available: {', '.join(COMMANDS.keys())}")
        sys.exit(1)
