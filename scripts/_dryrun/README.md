# 🧪 Dry-Run Verification Harness

These scripts exercise the **recording pipeline without touching the network** and
without the real tools (`ffmpeg`, `yt-dlp`, `streamlink`, etc.), which are not
installed in the audit sandbox. They prove the **control flow, hand-offs between
steps, and resilience logic** are correct — i.e. the system does not crash on
broken `set -u` references, missing files, or failed recordings.

> ⚠️ **What this is NOT:** a proof that a *live* YouTube stream gets recorded.
> That requires a real stream, valid cookies, and the real tools — none available
> here. The mocks only simulate tool *behavior* (exit codes, file creation,
> API response shapes).

## Layout

```
_dryrun/
├── bin/            # working mocks: bc, ffprobe, ffmpeg, yt-dlp, streamlink,
│                   #   ytarchive, chat_downloader, gh, curl
├── bin_fail/       # ONLY the recording tools (yt-dlp, streamlink, ytarchive)
│                   #   replaced with failing versions (exit 1, no output)
├── run.sh          # HAPPY-PATH: full pipeline runs to a successful recording
└── failure-path.sh # FAILURE-PATH: every method fails → graceful degradation
```

## Run the happy path (successful recording)

```bash
bash scripts/_dryrun/run.sh
```

Exercises: `check-cookies → detect-stream → record-stream → post-process →
upload-clouds`, then sources `discord-notify.sh` and calls
`notify_recording_complete`. Expects **all steps exit 0**, `RECORDING_SUCCESS=true`,
and upload links for Gofile / Pixeldrain / Archive.org.

## Run the failure path (every method fails)

```bash
bash scripts/_dryrun/failure-path.sh
```

Proves graceful degradation:
- `validate_recorded_file()` rejects a ~1 KB file and accepts a playable 20 MB file.
- `record_stream()` with all 10 live methods **and** 6 VOD-rescue methods failing
  sets `RECORDING_SUCCESS=false`, dumps a diagnostic summary, and returns non-zero
  **without crashing**.
- `notify_recording_failed()` fires cleanly (exit 0).

The failure harness overrides `is_stream_still_live()` to always report "still
live" so the 30-iteration × 60s VOD wait loop exits immediately; the 6 VOD
methods still run (with their 5s inter-attempt sleep) to confirm nothing blows up.

## How the mocks behave

| Mock     | Happy path                          | Failure path              |
|----------|-------------------------------------|---------------------------|
| yt-dlp   | creates output file, returns 0      | exits 1, no output        |
| streamlink | creates output file, returns 0    | exits 1, no output        |
| ytarchive | creates `<base>.mp4`, returns 0     | exits 1, no output        |
| ffprobe  | reports video+audio, 600s duration  | (shared) same             |
| ffmpeg   | creates output file, returns 0      | (shared) same             |
| curl     | returns success-shaped API bodies   | (shared) same             |
| bc / gh / chat_downloader | no-ops / parse helpers | (shared) same             |

`MEGA_SKIP=true` is set because real `megatools` + an account are required and
cannot be faked safely.
