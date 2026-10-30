# Cookie-free CDP recorder verification

Date: 2026-10-30 (UTC)

## Result

**Local end-to-end CDP recording: PASS.**
**Live YouTube recording from this sandbox: NOT VERIFIED — outbound YouTube access is blocked.**

The recorder now defaults to SeleniumBase **Pure CDP Mode** for public streams:

- `BROWSER_MODE=cdp`
- `BROWSER_ASSIST=first` in CI/config
- `PUBLIC_STREAM_ONLY=true` in the recording workflow
- Method K reads anonymous player URLs and records them with ffmpeg
- no `cookies.txt` export, no `--cookies` handoff, no account profile
- account cookies are only an explicit last resort for restricted streams
  (`PUBLIC_STREAM_ONLY=false` + valid `YOUTUBE_COOKIES`)

## What was run

| Check | Result |
|---|---|
| `bash scripts/setup-browser.sh --check-only` | PASS |
| `bash scripts/setup-browser.sh --verify-launch` | PASS |
| `python3 scripts/browser_session.py --selftest` | PASS (21 checks) |
| `python3 tests/test_browser_cdp.py` | PASS (7 tests) |
| `bash tests/browser-cdp-test.sh` | PASS (17 checks) |
| `bash tests/browser-session-test.sh` (legacy UC contract) | PASS (37 checks) |
| `bash tests/record-cascade-test.sh` | PASS (10 checks) |
| `bash tests/record-cookie-gating-test.sh` | PASS (40 checks) |
| `bash tests/cookieless-smoke-test.sh` | PASS |
| Workflow YAML parse | PASS |
| Real Chrome + real ffmpeg local fixture | PASS |

Local fixture recording:

- mode: `cdp`
- duration: `6.013991` seconds
- video height: `180`
- audio codec: `aac`
- bytes: `378828`
- cookie files exported: `0`
- `Cookie` headers on media requests: `0`
- operator cookie file used: `false`

The fixture deliberately set a browser first-party cookie and placed a valid-looking
operator cookie file in the environment. The CDP path still exported no jar and
sent no cookie header to the media server.

## Live YouTube attempt

Command:

```bash
BROWSER_MODE=cdp BROWSER_ASSIST=first PUBLIC_STREAM_ONLY=true \
SMOKE_REQUIRE_K=true MIN_PASS=1 \
bash scripts/cookieless-smoke-test.sh --video-id dQw4w9WgXcQ --only K
```

Result: **FAIL / at risk**, because the sandbox could not establish a TLS
connection to YouTube. The required-CDP gate correctly refused to report success.

Evidence:

```text
curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to www.youtube.com:443
Chrome: handshake failed; returned -1, SSL error code 1, net_error -100
```

This is an environment egress failure, not proof that the target video is
unrecordable. Run the **Cookieless smoke test** workflow on the production
GitHub runner to verify current live YouTube behavior.

## Do you still need cookies?

For **public streams**, the new default path is designed to need **no supplied or
exported cookies**. You should not need to keep rotating `YOUTUBE_COOKIES` just to
record public broadcasts.

Cookies remain a **very last option** for restricted/members-only/age-gated
streams, or if YouTube presents a challenge that anonymous CDP cannot clear.
They are not used by the CDP path itself.
