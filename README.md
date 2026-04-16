# 📡 Automated Stream Recorder

[![Stream Recorder](https://img.shields.io/badge/Stream_Recorder-v2.0.0-blue?style=for-the-badge&logo=github-actions&logoColor=white)](https://github.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![YouTube](https://img.shields.io/badge/YouTube-Live_Recording-red?style=for-the-badge&logo=youtube&logoColor=white)](https://youtube.com)
[![Discord](https://img.shields.io/badge/Discord-Notifications-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.com)

> **Zero-touch automated YouTube live stream recording system** powered by GitHub Actions. Detects, records, processes, uploads, and archives live streams — completely free, completely automated.

---

## 🏆 What This System Does

| Feature | Description |
|---------|-------------|
| 🔍 **Auto-Detection** | Checks every 5 minutes if your target channel is live (3 independent methods) |
| 🎬 **Bulletproof Recording** | 6 recording methods × 5 attempts = 30 chances per stream |
| ⚙️ **Smart Processing** | Auto-repair, optimize, and split into 30-min parts |
| ☁️ **Triple Cloud Backup** | Gofile + Pixeldrain + Archive.org (permanent) |
| 📢 **Discord Notifications** | Premium rich embeds with clickable download links |
| 📊 **Statistics Tracking** | Lifetime stats updated after every recording |
| 🔗 **Link Preservation** | Auto-refreshes cloud links every 3 days |
| 📈 **Weekly Reports** | Beautiful analytics every Monday at 3 PM PKT |
| 🌐 **IP Masking** | Cloudflare WARP hides GitHub's datacenter IP |
| 🔄 **Self-Healing** | Auto-retries on failure, never gives up |
| 💰 **Zero Cost** | Everything runs on free services |

---

## 📁 Repository Structure

```
stream-recorder/
├── .github/
│   └── workflows/
│       ├── stream-recorder.yml     ← Main recorder (every 5 min, Thu-Sun)
│       ├── cloud-refresh.yml       ← Link preservation (every 3 days)
│       └── weekly-summary.yml      ← Weekly analytics (Monday 3PM PKT)
├── scripts/
│   ├── utils.sh                    ← Shared utilities & helpers
│   ├── config.env                  ← All configuration settings
│   ├── setup-warp.sh               ← Cloudflare WARP IP masking
│   ├── detect-stream.sh            ← Triple-layer live detection
│   ├── record-stream.sh            ← 6-method bulletproof recorder
│   ├── post-process.sh             ← Repair, optimize, split
│   ├── upload-clouds.sh            ← Triple cloud upload
│   ├── discord-notify.sh           ← Premium Discord embeds
│   ├── update-stats.sh             ← Statistics engine
│   ├── update-links.sh             ← Links archive manager
│   ├── refresh-links.sh            ← Link preservation engine
│   └── weekly-report.sh            ← Weekly analytics generator
├── stats.json                      ← Lifetime statistics database
├── links.txt                       ← Recording links archive
└── README.md                       ← This file
```

---

## 🚀 Quick Setup Guide

### Step 1: Create Your Repository

1. Create a **new public repository** on GitHub
2. Copy all files from this project into your repository
3. Push to the `main` branch

### Step 2: Configure Secrets

Go to **Settings → Secrets and variables → Actions** and add:

| Secret | Required | Description | How to Get It |
|--------|----------|-------------|---------------|
| `DISCORD_WEBHOOK_URL` | ✅ Yes | Discord channel webhook | Server Settings → Integrations → Webhooks → New |
| `YOUTUBE_CHANNEL_ID` | ✅ Yes | Channel handle, e.g. `@ChannelName` | From the channel's YouTube URL |
| `YOUTUBE_COOKIES` | ✅ Yes | Base64-encoded cookies.txt | See [Cookie Export Guide](#cookie-export) below |
| `GH_PAT` | ✅ Yes | GitHub Personal Access Token (repo scope) | Settings → Developer Settings → PATs → Fine-grained |
| `ARCHIVE_ACCESS_KEY` | ✅ Yes | Archive.org S3 access key | [archive.org/account/s3.php](https://archive.org/account/s3.php) |
| `ARCHIVE_SECRET_KEY` | ✅ Yes | Archive.org S3 secret key | Same as above |
| `PIXELDRAIN_API_KEY` | 🟡 Optional | Pixeldrain API key (higher limits) | [pixeldrain.com/user/api_keys](https://pixeldrain.com/user/api_keys) |
| `WARP_LICENSE_KEY` | 🟡 Optional | Cloudflare WARP+ license (faster speeds) | WARP app → Account → Key |
| `AVATAR_URL` | 🟡 Optional | Your avatar URL for Discord embeds | Any direct image URL |

### Step 3: Export Cookies

<a name="cookie-export"></a>

1. Install [cookies.txt extension](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/) for Firefox
2. Log into YouTube in Firefox
3. Go to youtube.com and click the extension → "Export"
4. Save the file as `cookies.txt`
5. In your terminal, encode it:
   ```bash
   base64 -w 0 cookies.txt > cookies_encoded.txt
   ```
6. Copy the contents of `cookies_encoded.txt` and paste as the `YOUTUBE_COOKIES` secret

### Step 4: Enable GitHub Actions

1. Go to **Actions** tab in your repository
2. Click "I understand my workflows, go ahead and enable them"
3. The recorder will start checking every 5 minutes (Thu-Sun)
4. You can also trigger it manually: **Actions → Stream Recorder → Run workflow**

---

## ⚙️ How It Works

### Full Recording Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│  EVERY 5 MINUTES (Thursday — Sunday)                    │
│                                                         │
│  1. 🖥️  GitHub spins up a fresh Ubuntu server            │
│  2. 🌐  Cloudflare WARP connects (masks datacenter IP)  │
│  3. 💾  Disk space check (need 3+ GB)                   │
│  4. 🍪  Cookies decoded from secret                     │
│  5. 🔍  Triple-layer live detection (3 methods)         │
│  6. 🔴  Discord: "LIVE DETECTED" notification           │
│  7. 🎬  Record with 6 methods × 5 attempts             │
│  8. ⚙️  Repair → optimize → split into 30-min parts     │
│  9. ☁️  Upload to Gofile + Pixeldrain + Archive.org     │
│  10. ✅  Discord: "RECORDING COMPLETE" with all links   │
│  11. 📊  Update lifetime statistics                     │
│  12. 🔗  Archive all download links                     │
│  13. 🧹  Clean up all temp files                        │
│  14. 🔄  If failed → auto-retry in 2 minutes           │
└─────────────────────────────────────────────────────────┘
```

### Detection Methods

| # | Method | Speed | How |
|---|--------|-------|-----|
| 1 | `/live` Redirect | ⚡ 1-2s | Checks if channel's /live URL redirects to a video |
| 2 | yt-dlp JSON Dump | 🔄 5-10s | Uses yt-dlp to check `is_live` field |
| 3 | `/streams` Tab Scan | 🔍 10-20s | Scans all videos on Streams tab for live status |

### Recording Methods

| # | Method | Requires | Best For |
|---|--------|----------|----------|
| A | web_creator + cookies | Cookies | Authenticated, highest quality |
| B | tv + cookies | Cookies | Bypasses some bot detection |
| C | iOS player | Nothing | Public streams |
| D | Android player | Nothing | Mobile format fallback |
| E | Mobile web | Nothing | Simplest client |
| F | Streamlink | Nothing | Completely different tool (HLS) |

### Cloud Services

| Service | Speed | Expiry | Free | Link Format |
|---------|-------|--------|------|-------------|
| 🟢 Gofile | Fast | 60 days* | ✅ Unlimited | `gofile.io/d/CODE` |
| 🔵 Pixeldrain | Fast | 60 days* | ✅ 20GB | `pixeldrain.com/u/ID` |
| 🏛️ Archive.org | Slow | **Never** | ✅ Unlimited | `archive.org/details/ID` |

*\* The auto-refresh workflow resets the timer every 3 days, so links effectively never expire.*

---

## 🔔 Discord Notifications

The system sends **6 types** of premium Discord notifications:

| Type | When | Color |
|------|------|-------|
| 🔴 **Live Detected** | Stream found, recording starts | Red |
| ✅ **Recording Complete** | Done with all download links | Green/Yellow/Red |
| ❌ **Recording Failed** | All methods failed, auto-retrying | Red |
| 📊 **Weekly Summary** | Every Monday 3 PM PKT | Blue |
| 🔄 **Links Refreshed** | Every 3 days | Green |
| 🟢 **System Health** | On demand | Purple |

All notifications include:
- 👤 Author with your avatar
- 🖼️ Stream thumbnail
- 📊 Inline data fields
- 🔗 Clickable download links
- ⏰ Timestamps
- 🏷️ Branded footer

---

## 💾 Disk Space Guard

The system checks disk space **before every recording**:

- **Minimum required**: 3 GB
- **Why**: A 30-min stream ≈ 500MB-2GB, plus processing headroom
- **If too low**: Silently skips (no Discord spam)
- **Reported in**: Run logs, weekly summary

GitHub Actions runners provide **~14 GB** of free space, which is more than enough for most streams.

---

## 🌐 Why YouTube Won't Detect This

1. **Cloudflare WARP** — Traffic exits through Cloudflare's global network, not GitHub's datacenter
2. **User-Agent Rotation** — Rotates between 12+ modern browser signatures
3. **Rate Limiting** — Random 2-8 second delays between requests
4. **Cookie Authentication** — Appears as a logged-in browser session
5. **Multiple Player Clients** — Uses web, TV, iOS, Android, and mobile web clients
6. **Not Hammering** — Only checks every 5 minutes, exits in <10s when not live

---

## 🔧 Configuration

Edit `scripts/config.env` to customize:

```bash
# Channel to monitor
DEFAULT_CHANNEL_HANDLE="@ChannelName"

# Recording settings
MIN_DISK_SPACE_GB=3          # Minimum free space
MAX_RECORD_ATTEMPTS=5        # Retry attempts
SEGMENT_DURATION_MIN=30      # Split threshold (minutes)

# Video quality
REENCODE_CRF=18              # Quality (lower = better, 18 = near-lossless)

# Schedule (configured in workflow YAML)
# Thu-Sun, every 5 minutes

# Debug mode
DEBUG=false
```

---

## ❓ Troubleshooting

| Problem | Solution |
|---------|----------|
| "Not live" but channel IS live | Update cookies, or wait for next 5-min check |
| Recording produces empty file | Cookies may be expired — re-export and update secret |
| WARP fails to connect | System falls back to raw IP — recording still works |
| Upload fails | Individual service failure doesn't affect others |
| Discord notification missing | Check `DISCORD_WEBHOOK_URL` secret |
| Links expired | Run the cloud-refresh workflow manually |
| Stats not updating | Check `GH_PAT` has `repo` scope |

---

## 📊 GitHub Actions Usage

**Public repos get unlimited GitHub Actions minutes.** Here's expected usage:

| Activity | Frequency | Duration | Monthly |
|----------|-----------|----------|---------|
| Live checks (not live) | ~1,152/month | ~10 sec each | ~3.2 hours |
| Actual recordings | Varies | 1-5 hours each | Depends on streams |
| Link refresh | ~10/month | ~5 min each | ~50 min |
| Weekly summary | ~4/month | ~1 min each | ~4 min |

---

## 📜 License

MIT License — use freely, modify as needed.

---

## 👤 Author

**Muneeb Ahmad** — Automated Stream Recording System v2.0.0

---

*Set it up once → it runs forever → you just check Discord! 🔥*
