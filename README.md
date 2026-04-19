# ☪️ Automating The Muslim Lantern
**High-Resilience Stream Recording & Cloud Archiving Pipeline v3.0**

This repository runs an entirely automated, serverless recording engine using GitHub Actions. It endlessly checks if "The Muslim Lantern" is live on YouTube, records the broadcast dynamically, remuxes it, and synchronizes the files across three highly redundant cloud storage platforms (Gofile, Pixeldrain, Archive.org).

## 🚀 Core Features
- **24/7 Serverless Checking**: Runs passively. Thursday—Monday trigger schedule.
- **Micro-Drops Resistant**: Will wait up to 10 extra minutes for YouTube network blips before finalizing the recording to prevent creating chopped clips.
- **Triple-Cloud Redundancy**: 
   - ⏩️ **Gofile**: High-speed premium mirror (expires in 10 days of inactivity).
   - 💧 **Pixeldrain**: Long-term premium mirror (expires 60 days of inactivity).
   - 🏛️ **Archive.org**: Permanent institutional archive.
- **Smart Discord Mutators**: Notifies specific Discord channels when tasks finish, and dynamically **Edits** past Discord Messages to prevent channel clutter when updating links.

---

## ⚙️ Configuration & Secrets

In your GitHub repository, navigate to **Settings > Secrets and variables > Actions**. You must create the following Repository Secrets for the system to function.

### Cloud Storage Secrets
* `PIXELDRAIN_API_KEY`: API token from Pixeldrain.
* `GOFILE_API_KEY`: API token from Gofile.
* `ARCHIVE_ACCESS_KEY` & `ARCHIVE_SECRET_KEY`: Inter-Archive API keys for Internet Archive.
* `WARP_LICENSE_KEY`: Cloudflare WARP license for proxy routing.
* `YOUTUBE_COOKIES`: The contents of your `cookies.txt` to bypass age-gate or bot-protection on Google.
* `GH_PAT`: A classic Personal Access Token with `repo` and `workflow` permissions (required for saving logs back to the repository without JSON parsing errors).

### 💬 Strict Discord Webhook Setup

You must create webhooks in your Discord Server and paste their URLs into these specific secrets:

1. **`DISCORD_WEBHOOK_ALERTS`**
   - **Purpose:** Receives "🔴 RECORDING STARTED" notifications.
   - **Recommended Channel:** `#announcements` or `#live-alerts`

2. **`DISCORD_WEBHOOK_RECORDINGS`**
   - **Purpose:** Receives the massive, final "✅ Complete Recording" payload with all your download mirrors.
   - **Recommended Channel:** `#archives` or `#recordings`

3. **`DISCORD_WEBHOOK_LINKS`**
   - **Purpose:** Receives silent technical data like "🔄 LINKS REFRESHED", System Health checks, and Weekly Performance Reports.
   - **Recommended Channel:** `#bot-logs` or `#reports`

*(If you only set `DISCORD_WEBHOOK_URL`, it will dump everything into that one webhook, which creates extreme clutter. Please use the separated ones above.)*

---

## 🧪 How To Test The System
You can test the entire pipeline without waiting for the weekend stream.

1. Go to the **Actions** tab.
2. Select **🧪 Test Pipeline & Features** from the left panel.
3. Click **Run workflow** directly. 
4. Provide any current YouTube Live stream URL (e.g., Al Jazeera 24/7).
5. The bot will literally treat that URL as if it were a Muslim Lantern broadcast, download it for exactly **10 Minutes**, and execute all Post-Processing and Discord alerting channels flawlessly.

---

## 🛠️ Bot Mechanics & Maintenance

**How Links Are Tracked (`links.txt`)**
The bot maintains an immutable database in `links.txt`. Your Discord Message ID is cached beside the links so that the automated cron job can execute `PATCH` requests against Discord’s API dynamically.

**If the JSON API Fails?**
The codebase strictly pipes variables through STDIN using `-d @-` against curl binaries. Windows `\r\n` corruptions will safely be disregarded, making your bot virtually crash-proof during variable passing.
