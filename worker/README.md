# ⚡ Pixeldrain Fast Proxy — Your Own Speed-Boost Worker

This is your **own** version of `pixeldrain-bypass.gamedrive.org`. It bypasses
Pixeldrain's speed limit + hotlink/rate-limit block and caches every video on
Cloudflare's global edge so playback is **fast and bulletproof**. Unlike
GameDrive, **you control it**, so it won't randomly go down.

It's **100% free** on Cloudflare's Free plan (100,000 requests/day, and cached
plays are basically free).

---

## What it does
- Fetches your Pixeldrain file **server-side** (no "hotlinking from your site").
- Tries the GameDrive CDN first, then official Pixeldrain — returns whichever
  actually serves video.
- **Caches** the file on Cloudflare edge → second viewer onward gets it
  instantly, and Pixeldrain's per-file rate limit stops mattering.
- Supports **seeking** (HTTP Range) and **CORS**, so it embeds in any player.

---

## 🚀 Deploy in 5 minutes (no credit card)

### Option A — Dashboard (easiest, no install)
1. Go to **https://dash.cloudflare.com** → sign up / log in (free).
2. Left sidebar → **Workers & Pages** → **Create** → **Create Worker**.
3. Give it a name, e.g. `pixeldrain-fast`. Click **Deploy**.
4. Click **Edit code**. Delete everything in the editor.
5. Open `pixeldrain-fast-worker.js` from this folder, copy ALL of it, paste it in.
6. Click **Deploy** (top right).
7. Your URL appears, like:
   `https://pixeldrain-fast.YOUR-NAME.workers.dev`

### Option B — Command line (wrangler)
```bash
cd worker
npm install -g wrangler
wrangler login
wrangler deploy
```

---

## ✅ Test it
Open in a browser (replace with YOUR worker URL + a real file id):
```
https://pixeldrain-fast.YOUR-NAME.workers.dev/sgkcZTh9
```
If a video plays / downloads, it works! 🎉

---

## 🔌 Connect it to the dashboard
1. Copy your Worker URL (e.g. `https://pixeldrain-fast.YOUR-NAME.workers.dev`).
2. Open `dashboard/src/pages/Watch.tsx`.
3. Near the top find:
   ```ts
   const PIXELDRAIN_WORKER_HOST = '';
   ```
4. Put your Worker host (no https://, no trailing slash):
   ```ts
   const PIXELDRAIN_WORKER_HOST = 'pixeldrain-fast.YOUR-NAME.workers.dev';
   ```
5. Commit + push. Done — the **Fast** server now streams through YOUR proxy,
   and the gallery's "Fast" playback is cached + speed-boosted for everyone.

> If you leave `PIXELDRAIN_WORKER_HOST` empty, the site automatically falls back
> to the public GameDrive CDN, then official Pixeldrain. So it works either way —
> the Worker just makes it faster and fully under your control.
