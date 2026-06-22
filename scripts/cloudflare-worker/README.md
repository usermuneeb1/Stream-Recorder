# ☁️ Cloudflare Worker — Telegram Video Streaming Proxy

## What it does
Streams your Telegram videos through Cloudflare's global CDN.
- First request: fetches from Telegram, caches for 1 year
- All subsequent requests: served from nearest Cloudflare edge (blazing fast)
- Free tier: 100,000 requests/day, unlimited bandwidth

## Setup (5 minutes)

### 1. Create a Cloudflare account
Go to https://dash.cloudflare.com — sign up (free)

### 2. Create a Worker
- Dashboard → Workers & Pages → Create → Create Worker
- Name it: `tg-stream` (or anything)
- Click Deploy (ignore the default code)
- Click "Edit Code"
- Delete everything, paste the contents of `worker.js`
- Click "Deploy"

### 3. Get your Worker URL
After deploy, you'll see: `https://tg-stream.YOUR_SUBDOMAIN.workers.dev`

### 4. Test it
Open in browser:
```
https://tg-stream.YOUR_SUBDOMAIN.workers.dev/?url=https://api.telegram.org/file/bot<YOUR_BOT_TOKEN>/<file_path>
```

### 5. Use in your dashboard
Add the Worker URL as a playback source in your website.
Videos will stream through Cloudflare's CDN — first load caches it,
subsequent loads are instant from the nearest edge server worldwide.

## How to get Telegram file URLs

After uploading with Pyrogram, the file_id is saved.
To get a streamable URL:
```
https://api.telegram.org/bot<TOKEN>/getFile?file_id=<FILE_ID>
```
This returns a temporary URL. The Worker caches it permanently.

## Optional: Custom domain
Workers → Your worker → Triggers → Custom Domains
Add your own domain (e.g., stream.yourdomain.com)
