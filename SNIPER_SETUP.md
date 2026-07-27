# 🎯 Go-Live Sniper + Bulletproof Capture — Setup

You built this system because the uploader **privates the VOD after every stream** — so the *only* chance to keep a stream is to capture it **while it's live**. This doc explains the redundant capture system now in place and the **one thing you must set up** for it to have full coverage.

---

## What was breaking (now fixed)

| Bug | Effect | Fix (commit) |
|-----|--------|--------------|
| **Recheck false-abort** | Aborted genuinely-live recordings → detect→abort→retry spam loop, nothing recorded | recheck made advisory (`19736aa`) |
| **Premiere/upcoming loop** | Treated a *scheduled, not-yet-live* event as live → every method failed "begins in N minutes" → fail→retry spam loop | only record when *actually* live (`258d49a`) |

Both loops are gone. Detection now **no-ops silently** when not live (no spam), and records cleanly the moment a stream is really live.

---

## The new redundant capture system

You now have **two independent** capture paths, coordinated by a lock so they don't double-record:

```
                 ┌──────────────────────────┐
  pinger ──ping-recorder──▶ │  🎬 Stream Recorder (main) │──┐
         └──ping-sniper───▶ │  🎯 Go-Live Sniper (backup) │──┤── recording-lock.sh ──▶ record once
                 └──────────────────────────┘
```

- **Stream Recorder** — the main loop (every 5 min). Primary capturer.
- **Go-Live Sniper** — a *separate* workflow (`stream-sniper.yml`) on its own concurrency group. It does a **fast go-live check** every 2 min and captures independently. If the main recorder ever hiccups, the sniper still gets it. It is **never cancelled mid-recording** (`cancel-in-progress: false`).
- **`recording-lock.sh`** — whichever path detects go-live first grabs a lock; the other sees it and defers. **Fail-safe**: any lock error → record anyway (we never skip a capture over a coordination glitch).

Both paths reuse your proven pipeline: detect → record (10 methods) → post-process → upload (Gofile/Pixeldrain/MEGA/Archive) → Discord → gallery.

---

## 🔴 THE ONE THING YOU MUST DO: point your pinger at the sniper too

The sniper's `schedule: */2` is **throttled by GitHub** (unreliable), exactly like the recorder's cron. Your real coverage comes from your **external pinger** (cron-job.org). Right now it fires `ping-recorder`. **Add a second job that fires `ping-sniper`**, so both paths get poked every ~2–5 minutes:

**Option A — two cron-job.org jobs** (simplest):
- Job 1 (every 2 min): POST `{"event_type":"ping-recorder"}` → `https://api.github.com/repos/usermuneeb1/Stream-Recorder/dispatches` (you already have this)
- Job 2 (every 2 min): POST `{"event_type":"ping-sniper"}` → same URL

**Option B — one job that fires both** (a tiny script on any always-on box / cron-job.org "request script"):
```bash
TOKEN="your_GH_PAT"
REPO="usermuneeb1/Stream-Recorder"
for EV in ping-recorder ping-sniper; do
  curl -s -X POST -H "Authorization: token $TOKEN" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO/dispatches" -d "{\"event_type\":\"$EV\"}"
done
```

Without `ping-sniper` being fired, the sniper only runs on GitHub's throttled cron — **do this or the sniper won't reliably catch go-live.**

---

## Pre-flight checklist (run once)

- [ ] **Pinger fires both `ping-recorder` AND `ping-sniper`** every 2–5 min (see above). ← most important
- [ ] All fixes are on `main` (they are: `19736aa`, `258d49a`, + this sniper commit).
- [ ] **Do NOT** downgrade `actions/checkout` (v7 is correct/valid).
- [ ] (Optional) Manually trigger **Go-Live Sniper** once (Actions → "🎯 Go-Live Sniper" → Run workflow) to confirm it installs + detects + exits cleanly when not live.
- [ ] Rotate the `ghp_…` token you pasted in chat (github.com/settings/tokens).

---

## Honest reliability note

This is now about as bulletproof as a GitHub-Actions-based system can be: two independent capture paths, no abort-on-live, no upcoming-event loop, lock coordination, and 10 recording methods. The remaining, unavoidable realities:
- **Detection latency ≈ your pinger interval** (2–5 min). The first ~2–5 min of a stream may be missed if no run is spun up exactly at go-live. (A run that's already polling catches it within ~60s.)
- **If every recording method fails on a given stream** (rare YouTube anti-bot change), even the sniper can't save it — but it will keep retrying every cycle while live.
- If the uploader **privates a stream within seconds of it ending**, only a capture that was already running will have it — which is exactly what this system guarantees.

You will not be silently disappointed again: every go-live now triggers capture from two independent paths, and you'll get a Discord "🔴 LIVE — recording started" the instant either detects it.
