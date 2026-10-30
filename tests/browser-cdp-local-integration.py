#!/usr/bin/env python3
"""Real Chrome + real ffmpeg end-to-end test against a local muxed-MP4 fixture.

This does NOT contact YouTube and must never be reported as a live YouTube pass.
It proves the production CDP -> player extraction -> Method K -> ffmpeg path,
with a browser that has a first-party fixture cookie, while asserting that no
cookie file is exported and no Cookie header reaches the media server.

Run with a dedicated anonymous Chrome already listening on BROWSER_CDP_PORT,
or let SeleniumBase launch the system Chrome when that variable is unset.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VIDEO_ID = "LOCALTEST01"


class FixtureHandler(http.server.SimpleHTTPRequestHandler):
    media_cookie_headers: list[str] = []

    def log_message(self, *_args):
        pass

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path.endswith((".mp4", ".m3u8", ".ts")):
            cookie = self.headers.get("Cookie")
            if cookie:
                self.media_cookie_headers.append(cookie)
        if path == "/watch":
            base = f"http://127.0.0.1:{self.server.server_address[1]}"
            player = {
                "playabilityStatus": {"status": "OK", "reason": ""},
                "videoDetails": {"videoId": VIDEO_ID, "title": "Local CDP fixture",
                                 "author": "Offline test", "isLive": True},
                "streamingData": {"adaptiveFormats": [], "formats": [
                    {"itag": 18, "mimeType": "video/mp4", "height": 180,
                     "audioQuality": "AUDIO_QUALITY_LOW", "url": base + "/fixture.mp4"}
                ]},
            }
            html = """<!doctype html><html><head><title>Local CDP fixture</title></head>
<body><h1>Live now</h1><script>
document.cookie = 'fixture=anonymous; path=/';
window.ytInitialPlayerResponse = PLAYER;
window.ytcfg = {get: function(k) { return k === 'VISITOR_DATA' ? 'local-visitor' : ''; }};
</script></body></html>""".replace("PLAYER", json.dumps(player))
            data = html.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()


def run(cmd, **kwargs):
    return subprocess.run(cmd, check=True, text=True, capture_output=True, **kwargs)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", default="")
    ap.add_argument("--workdir", default="")
    args = ap.parse_args()
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        print("FAIL: ffmpeg and ffprobe must be on PATH", file=sys.stderr)
        return 2
    work_ctx = tempfile.TemporaryDirectory(prefix="cdp-local-") if not args.workdir else None
    work = Path(args.workdir) if args.workdir else Path(work_ctx.name)
    work.mkdir(parents=True, exist_ok=True)
    media = work / "media"
    media.mkdir(exist_ok=True)
    try:
        run([ffmpeg, "-y", "-loglevel", "error",
             "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=15",
             "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
             "-t", "8", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac",
             "-movflags", "+faststart", str(media / "fixture.mp4")])
        FixtureHandler.media_cookie_headers = []
        handler = functools.partial(FixtureHandler, directory=str(media))
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        port = server.server_address[1]
        url = f"http://127.0.0.1:{port}/watch?v={VIDEO_ID}"
        out = work / "recording.mp4"
        env = os.environ.copy()
        env.update({
            "PATH": str(Path(sys.executable).parent) + os.pathsep + env.get("PATH", ""),
            "BROWSER_PYTHON": sys.executable,
            "BROWSER_MODE": "cdp", "BROWSER_ASSIST": "first",
            "PUBLIC_STREAM_ONLY": "true", "BROWSER_ALLOW_LOCAL": "true",
            "RECORD_DIR": str(work / "record"),
            "BROWSER_SESSION_DIR": str(work / "capture"),
            "BROWSER_SESSION_TIMEOUT": "90", "BROWSER_MAX_WAIT": "15", "BROWSER_SESSION_MAX_AGE": "0",
            "CUSTOM_DURATION_MODE": "true", "RECORD_CAPTURE_SECONDS": "6",
            "MAX_RECORD_DURATION": "45", "METHOD_RETRY_DELAY": "0",
            # A deliberately valid-looking operator jar: the CDP path must not use it.
            "COOKIES_FILE": str(work / "operator-cookies.txt"),
            "COOKIE_STATUS": "valid",
        })
        (work / "operator-cookies.txt").write_text("# operator fixture\n.youtube.com\tTRUE\t/\tTRUE\t1900000000\tSECRET\t1\n")
        script = f'''set -uo pipefail
source "{ROOT}/scripts/record-stream.sh"
record_method_k "{url}" "{out}"
'''
        try:
            proc = subprocess.run(["bash", "-c", script], env=env, text=True,
                                  capture_output=True, timeout=150)
            (work / "method-k.log").write_text(proc.stdout + proc.stderr)
            if proc.returncode != 0:
                print(proc.stdout + proc.stderr, file=sys.stderr)
                raise RuntimeError(f"Method K exited {proc.returncode}")
            probe = json.loads(run([ffprobe, "-v", "error", "-show_streams", "-show_format",
                                    "-of", "json", str(out)]).stdout)
            streams = probe.get("streams", [])
            video = next((s for s in streams if s.get("codec_type") == "video"), None)
            audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
            duration = float(probe.get("format", {}).get("duration", 0))
            capture = json.loads((work / "capture/stream.json").read_text())
            assert video and int(video.get("height", 0)) > 0, "no video stream"
            assert audio, "no audio stream"
            assert duration >= 5, f"recording too short: {duration}"
            assert capture["mode"] == "cdp" and capture["ok"], "capture is not a successful CDP capture"
            assert capture["cookie_count"] == 0 and capture["cookies_file"] == "", "CDP exported cookies"
            assert not (work / "capture/cookies.txt").exists(), "CDP created a cookie jar"
            assert not FixtureHandler.media_cookie_headers, "media requests carried a Cookie header"
            assert (work / "operator-cookies.txt").exists(), "operator jar was deleted"
            report = {
                "test": "local CDP -> Method K -> ffmpeg end-to-end (muxed MP4 fixture)",
                "live_youtube_verified": False,
                "result": "PASS",
                "video_id": VIDEO_ID,
                "browser_mode": "cdp",
                "cookie_files_exported": 0,
                "cookie_headers_on_media_requests": 0,
                "operator_cookie_file_used": False,
                "height": int(video["height"]),
                "audio_codec": audio.get("codec_name"),
                "duration_seconds": duration,
                "bytes": out.stat().st_size,
                "recording": str(out),
                "log": str(work / "method-k.log"),
            }
            if args.report:
                Path(args.report).write_text(json.dumps(report, indent=2) + "\n")
            print(json.dumps(report, indent=2))
            return 0
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
    except Exception as exc:
        print(f"FAIL: {type(exc).__name__}: {exc}", file=sys.stderr)
        log = work / "method-k.log"
        if log.exists():
            print(log.read_text()[-4000:], file=sys.stderr)
        return 1
    finally:
        if work_ctx is not None:
            work_ctx.cleanup()


if __name__ == "__main__":
    sys.exit(main())
