# 🛎️ External Pinger Setup

## Why this exists

GitHub Actions silently throttles `schedule:` cron triggers on inactive repos.
The recorder's `*/5 * * * *` cron actually fired only **2 times in 24 hours**
on 2026-06-27 instead of the expected ~288 — a live stream was missed because
of it.

The fix is to call GitHub's `repository_dispatch` API from an **external
scheduler** (anything that hits a URL on a timer). That endpoint is NOT
throttled.

## Setup (one-time, ~3 minutes)

### Option A: cron-job.org (recommended — free, no signup card)

1. Go to <https://cron-job.org/en/signup/> and sign up (email only, free).
2. Click **Create cronjob**.
3. Fill in:

   | Field | Value |
   |---|---|
   | **Title** | `Stream Recorder Ping` |
   | **Address (URL)** | `https://api.github.com/repos/usermuneeb1/Stream-Recorder/dispatches` |
   | **Schedule** | Every 5 minutes |
   | **Request method** | `POST` |
   | **Request body type** | `Raw / application/json` |
   | **Request body** | `{"event_type":"ping-recorder"}` |

4. Click **Advanced → Custom headers** and add:

   | Header | Value |
   |---|---|
   | `Accept` | `application/vnd.github+json` |
   | `Authorization` | `Bearer <YOUR_GITHUB_TOKEN>` |
   | `X-GitHub-Api-Version` | `2022-11-28` |
   | `User-Agent` | `stream-recorder-pinger` |

5. **Save** → toggle the job **ON**.

That's it. From this moment on, the recorder is pinged every 5 minutes from
an external source GitHub can't throttle.

### Option B: UptimeRobot (alternative — also free)

Same idea, but UptimeRobot's free tier sends `GET` requests only. Not ideal
for `repository_dispatch` (needs POST + body). Use cron-job.org instead.

### Option C: GitHub Actions on a different repo

Create a tiny separate repo with this workflow that pings the recorder:

```yaml
name: Recorder Pinger
on:
  schedule:
    - cron: "*/5 * * * *"
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.RECORDER_TOKEN }}" \
            -H "Accept: application/vnd.github+json" \
            https://api.github.com/repos/usermuneeb1/Stream-Recorder/dispatches \
            -d '{"event_type":"ping-recorder"}'
```

(This one *also* gets cron-throttled — Option A is better.)

## Belt-and-suspenders: in-workflow polling

Even if the pinger misses a few ticks, each recorder run now **automatically
waits up to 1 hour** for the stream to go live (when triggered by anything
other than `workflow_dispatch`). So between:

- External pinger every 5 min (uncron-throttle-able)
- Each run polls for 60 min
- GitHub's own (throttled) cron as backup

Coverage is effectively continuous. You'd have to miss BOTH the pinger AND
the cron AND your stream would have to start and end within minutes for the
recorder to miss it.

## Verifying it works

Once cron-job.org is set up, watch the Actions tab:
<https://github.com/usermuneeb1/Stream-Recorder/actions/workflows/stream-recorder.yml>

You should see runs labelled with `event=repository_dispatch` appearing every
5 minutes reliably (instead of the ~6-hour gaps the cron currently produces).
