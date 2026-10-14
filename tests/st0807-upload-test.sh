#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: scripts/upload-clouds.sh upload_to_st0807                  ║
# ║                                                                              ║
# ║  Production evidence (2026-10-14): of 18 recordings only the two smallest    ║
# ║  files (8 MB, 92 MB) ever reached 0807.st; all 16 files ≥ 255 MB failed on   ║
# ║  every recorder and repair run since 2026-09-02, and the failure reason was  ║
# ║  invisible (empty "attempt N failed," lines). This locks:                    ║
# ║    1. the simple-POST success path still works;                              ║
# ║    2. a size rejection on the simple POST escalates to the chunked           ║
# ║       endpoints instead of retrying the same rejected request;               ║
# ║    3. every failure is reported with HTTP code + body excerpt in the log     ║
# ║       AND in the step summary (so the reason is readable without logs);      ║
# ║    4. an honest User-Agent is sent on every 0807.st call;                    ║
# ║    5. ST0807_TOKEN, when present, is sent as a Bearer header.                ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAILURES=$((FAILURES+1)); }

WORKDIR="$(mktemp -d)"; trap 'rm -rf "$WORKDIR"' EXIT
STUBBIN="$WORKDIR/bin"; mkdir -p "$STUBBIN"
MODE="$WORKDIR/mode"; CALLS="$WORKDIR/calls.log"
dd if=/dev/zero of="$WORKDIR/video.mp4" bs=1024 count=512 status=none   # 512 KB fixture

# curl double: logs every call (URL, UA, auth), answers per $MODE.
cat > "$STUBBIN/curl" <<STUB
#!/usr/bin/env bash
url=""; ua=""; auth=""; wfmt=""; data=""
while (( \$# )); do
  case "\$1" in
    -A) ua="\$2"; shift 2;;
    -H) [[ "\$2" == Authorization:* ]] && auth="\$2"; shift 2;;
    -w) wfmt="\$2"; shift 2;;
    -d|--data-binary) data="\$2"; shift 2;;
    -F|--max-time|-o|-X|--range) shift 2;;
    http*) url="\$1"; shift;;
    *) shift;;
  esac
done
echo "\$url | ua=\$ua | auth=\${auth:0:22}" >> "$CALLS"
mode=\$(cat "$MODE")
reply() { printf '%s' "\$2"; [[ -n "\$wfmt" ]] && printf '\n%s' "\$1"; exit 0; }
case "\$url" in
  https://0807.st/upload)
    case "\$mode" in
      ok)        reply 200 '{"url":"https://0807.st/SimpleOk.mp4"}';;
      toolarge)  reply 413 '{"error":"File too large for anonymous upload (max 100 MB)"}';;
      forbidden) reply 403 '<html><title>403 Forbidden</title></html>';;
      empty)     reply 000 '';;
    esac;;
  https://0807.st/upload/init)   reply 200 '{"uploadId":"u123"}';;
  https://0807.st/upload/chunk*) reply 200 '{"ok":true}';;
  https://0807.st/upload/finish) reply 200 '{"url":"https://0807.st/ChunkedOk.mp4"}';;
  *) reply 200 '';;
esac
STUB
chmod +x "$STUBBIN/curl"

run_upload() {  # $1 mode, rest = extra env
  echo "$1" > "$MODE"; : > "$CALLS"; : > "$WORKDIR/summary.md"; shift
  (cd "$WORKDIR" && env PATH="$STUBBIN:$PATH" GITHUB_STEP_SUMMARY="$WORKDIR/summary.md" ST0807_RETRY_SLEEP=0 "$@" bash -c '
     source "$1/scripts/upload-clouds.sh" >/dev/null 2>&1
     _st0807_pow_json() { echo "{\"pow_id\":\"p\",\"pow_ts\":\"1\",\"pow_bits\":\"1\",\"pow_sig\":\"s\",\"pow_nonce\":\"7\"}"; }
     ST0807_LINKS=()
     upload_to_st0807 "'"$WORKDIR"'/video.mp4" HD; rc=$?
     echo "RC=$rc LINKS=${ST0807_LINKS[*]:-}"' _ "$ROOT" 2>&1)
}

echo "── 1: simple POST accepted → link recorded ──"
OUT=$(run_upload ok)
grep -q 'RC=0 LINKS=HD|https://0807.st/SimpleOk.mp4' <<<"$OUT" && ok "link captured from the simple POST" || bad "simple path broken: $(grep RC= <<<"$OUT")"
grep -q 'ua=Mozilla/5.0' "$CALLS" && ok "honest User-Agent sent" || bad "no User-Agent on the upload call: $(head -1 "$CALLS")"

echo "── 2: size rejection (HTTP 413) → escalates to chunked, succeeds, reason logged ──"
OUT=$(run_upload toolarge)
grep -q 'RC=0 LINKS=HD|https://0807.st/ChunkedOk.mp4' <<<"$OUT" && ok "chunked upload produced the link" || bad "no chunked escalation: $(grep RC= <<<"$OUT")"
grep -q 'switching to chunked' <<<"$OUT" && ok "escalation announced" || bad "escalation not announced"
grep -q 'HTTP 413' <<<"$OUT" && ok "failure reason has the HTTP code" || bad "HTTP code missing from the failure line"
grep -q 'File too large' "$WORKDIR/summary.md" && ok "reason surfaced in the step summary" || bad "step summary has no 0807 line: $(cat "$WORKDIR/summary.md")"
n=$(grep -c 'https://0807.st/upload |' "$CALLS"); [[ "$n" -eq 1 ]] && ok "rejected simple POST not retried blindly ($n call)" || bad "simple POST sent $n times after a size rejection"
grep -q 'upload/init' "$CALLS" && grep -q 'upload/chunk' "$CALLS" && grep -q 'upload/finish' "$CALLS" && ok "init → chunk → finish sequence used" || bad "chunked sequence incomplete"

echo "── 3: hard failure (403 HTML) → 3 attempts, no chunked escalation, rc=1, reason visible ──"
OUT=$(ST0807_MAX_RETRIES=3 run_upload forbidden)
grep -q 'RC=1 LINKS=$' <<<"$OUT" && ok "rc=1, no link" || bad "unexpected: $(grep RC= <<<"$OUT")"
n=$(grep -c 'https://0807.st/upload |' "$CALLS"); [[ "$n" -eq 3 ]] && ok "3 simple attempts" || bad "$n attempts"
grep -q 'upload/init' "$CALLS" && bad "escalated to chunked on a non-size error" || ok "no chunked escalation on 403"
grep -q 'HTTP 403' "$WORKDIR/summary.md" && ok "step summary shows HTTP 403" || bad "summary missing: $(cat "$WORKDIR/summary.md")"

echo "── 4: empty response (connection filtered) → reported as HTTP 000 / <empty>, not a blank line ──"
OUT=$(run_upload empty)
grep -q 'HTTP 000' <<<"$OUT" && grep -q '<empty>' <<<"$OUT" && ok "empty body reported explicitly" || bad "empty failure is still invisible: $(grep -m1 'failed' <<<"$OUT")"

echo "── 5: ST0807_TOKEN → Bearer header, no PoW fields ──"
OUT=$(ST0807_TOKEN=tok-not-real run_upload ok)
grep -q 'auth=Authorization: Bearer' "$CALLS" && ok "Bearer token sent" || bad "token not sent: $(head -1 "$CALLS")"

echo ""
if (( FAILURES > 0 )); then echo "RESULT: RED — $FAILURES assertion(s) failed"; exit 1; fi
echo "RESULT: GREEN — 0807.st uploads explain themselves and escalate on size rejections"; exit 0
