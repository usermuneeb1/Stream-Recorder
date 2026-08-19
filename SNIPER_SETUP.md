# Go-Live Sniper Setup

The uploader privates the VOD after every stream, so the only way to keep a stream is to capture it while it is live. This doc explains the redundant capture system now in place and the one thing you must set up for it to have full coverage.

---

## What was breaking, now fixed

| Bug | Effect | Fix (commit) |
|-----|--------|--------------|
| Recheck false-abort | Aborted genuinely live recordings. Detect, abort, retry spam loop, nothing recorded. | Recheck made advisory (`19736aa`). |
| Premiere and upcoming loop | Treated a scheduled, not-yet-live event as live. Every method failed with "begins in N minutes", then retried in a loop. | Only record when actually live (`258d49a`). |

Both loops are gone. Detection no-ops silently when not live, and records cleanly the moment a stream is really live.

---

## The redundant capture system

Two independent capture paths, coordinated by a lock so they do not double-record:

```
                 ┌──────────────────────────┐
  pinger ──ping-recorder──▶ │  Stream Recorder (main) │──┐
         └──ping-sniper───▶ │  Go-Live Sniper (backup) │──┤── recording-lock.sh ──▶ record once
                 └──────────────────────────┘
```

- Stream Recorder. The main loop, every 5 minutes. Primary capturer.
- Go-Live Sniper. A separate workflow, `stream-sniper.yml`, on its own concurrency group. It does a fast go-live check every 2 minutes and captures independently. If the main recorder ever hiccups, the sniper still gets the stream. It is never cancelled mid-recording, `cancel-in-progress: false`.
- recording-lock.sh. Whichever path detects go-live first grabs a lock, the other sees it and defers. The fail-safe: any lock error records anyway. A capture is never skipped over a coordination glitch.

Both paths reuse the proven pipeline: detect, record with 10 methods, post-process, upload to Gofile, Pixeldrain, MEGA, and Archive, then Discord and the gallery.

---

## The one thing you must do: point your pinger at the sniper too

The sniper's `schedule: */2` is throttled by GitHub, exactly like the recorder's cron. Real coverage comes from the external pinger on cron-job.org. Right now it fires `ping-recorder`. Add a second job that fires `ping-sniper`, so both paths get poked every 2 to 5 minutes.

Option A, two cron-job.org jobs, the simplest:

- Job 1, every 2 minutes. POST `{"event_type":"ping-recorder"}` to `https://api.github.com/repos/usermuneeb1/Stream-Recorder/dispatches`. You already have this one.
- Job 2, every 2 minutes. POST `{"event_type":"ping-sniper"}` to the same URL.

Option B, one job that fires both, a tiny script on any always-on box or a cron-job.org request script:

```bash
TOKEN="your_GH_PAT"
REPO="usermuneeb1/Stream-Recorder"
for EV in ping-recorder ping-sniper; do
  curl -s -X POST -H "Authorization: token $TOKEN" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO/dispatches" -d "{\"event_type\":\"$EV\"}"
done
```

Without `ping-sniper` being fired, the sniper only runs on GitHub's throttled cron. Do this or the sniper will not reliably catch go-live.

---

## Pre-flight checklist, run once

- [ ] Pinger fires both `ping-recorder` and `ping-sniper` every 2 to 5 minutes. See above. This is the important one.
- [ ] All fixes are on main. They are: `19736aa`, `258d49a`, and this sniper commit.
- [ ] Do not downgrade `actions/checkout`. v7 is correct and valid.
- [ ] Optional. Manually trigger Go-Live Sniper once, Actions, Go-Live Sniper, Run workflow, to confirm it installs, detects, and exits cleanly when not live.
- [ ] Rotate the `ghp_` token you pasted in chat. github.com/settings/tokens.

---

## Reliability, honestly

Two independent capture paths, no abort-on-live, no upcoming-event loop, lock coordination, and 10 recording methods. That is about as far as a GitHub Actions system can go. The remaining realities:

- Detection latency is about your pinger interval, 2 to 5 minutes. The first few minutes of a stream may be missed if no run is spun up exactly at go-live. A run that is already polling catches it within about 60 seconds.
- If every recording method fails on a given stream, which happens rarely on a YouTube anti-bot change, even the sniper cannot save it. It keeps retrying every cycle while the stream is live.
- If the uploader privates a stream within seconds of it ending, only a capture that was already running will have it. That is exactly what this system guarantees.
