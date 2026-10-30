#!/usr/bin/env python3
"""Offline contract tests for the cookie-free SeleniumBase Pure CDP capture."""
import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("browser_session", ROOT / "scripts/browser_session.py")
bs = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = bs
spec.loader.exec_module(bs)

VIDEO_ID = "LOCALTEST01"


def player(status="OK", media=True, video_id=VIDEO_ID):
    streaming = {"adaptiveFormats": [], "formats": []}
    if media:
        streaming["hlsManifestUrl"] = "https://manifest.googlevideo.com/live.m3u8"
    return {
        "playabilityStatus": {"status": status, "reason": "Sign in to confirm you're not a bot" if status == "LOGIN_REQUIRED" else ""},
        "videoDetails": {"videoId": video_id, "title": "Fixture", "author": "Local", "isLive": True},
        "streamingData": streaming,
    }


class FakeSB:
    instances = []

    def __init__(self, response=None, **kwargs):
        self.kwargs = kwargs
        self.response = response if response is not None else player()
        self.visits = []
        self.captcha_calls = 0
        self.quit_calls = 0
        FakeSB.instances.append(self)

    def goto(self, url):
        self.visits.append(url)

    def get_text(self, selector):
        return "Sign in to confirm you're not a bot" if self.response["playabilityStatus"]["status"] != "OK" else "Live now"

    def evaluate(self, expression):
        if "ytInitialPlayerResponse" in expression:
            return json.dumps(self.response)
        if "VISITOR_DATA" in expression:
            return "anonymous-visitor"
        return None

    def get_page_source(self):
        return "<html><body>fixture</body></html>"

    def get_user_agent(self):
        return "Mozilla/5.0 Chrome/153.0.0.0"

    def solve_captcha(self):
        self.captcha_calls += 1

    def quit(self):
        self.quit_calls += 1


class CDPContract(unittest.TestCase):
    def setUp(self):
        FakeSB.instances = []
        self.tmp = tempfile.TemporaryDirectory()
        self.out = Path(self.tmp.name) / "capture"
        self.module = types.SimpleNamespace(sb_cdp=types.SimpleNamespace(Chrome=FakeSB))
        self.patcher = patch.dict(sys.modules, {"seleniumbase": self.module})
        self.patcher.start()

    def tearDown(self):
        self.patcher.stop()
        self.tmp.cleanup()

    def capture(self, response=None, **kwargs):
        FakeSB.instances = []
        # Construct through a factory so each test can supply its player blob.
        self.module.sb_cdp.Chrome = lambda **kw: FakeSB(response=response, **kw)
        options = dict(url="https://www.youtube.com/watch?v=" + VIDEO_ID,
                       outdir=str(self.out), max_wait=1)
        options.update(kwargs)
        rc = bs.capture_cdp_session(**options)
        stream = json.loads((self.out / "stream.json").read_text())
        return rc, stream, FakeSB.instances[-1]

    def test_success_exports_player_not_cookies(self):
        rc, stream, sb = self.capture()
        self.assertEqual(rc, 0)
        self.assertTrue(stream["ok"])
        self.assertEqual(stream["mode"], "cdp")
        self.assertEqual(stream["cookie_count"], 0)
        self.assertEqual(stream["cookies_file"], "")
        self.assertFalse((self.out / "cookies.txt").exists())
        self.assertTrue(sb.kwargs["guest"])
        self.assertFalse(sb.kwargs["ad_block"])
        self.assertEqual(sb.quit_calls, 1)
        self.assertFalse(Path(sb.kwargs["user_data_dir"]).exists())
        env = (self.out / "browser.env").read_text()
        self.assertIn("BROWSER_COOKIES_FILE=''", env)
        self.assertIn("BROWSER_MODE=cdp", env)

    def test_blocked_page_is_not_success(self):
        rc, stream, sb = self.capture(response=player("LOGIN_REQUIRED"))
        self.assertEqual(rc, 2)
        self.assertFalse(stream["ok"])
        self.assertTrue(stream["blocked"])
        self.assertEqual(sb.captcha_calls, 1)
        self.assertFalse((self.out / "cookies.txt").exists())

    def test_player_without_media_is_not_success(self):
        rc, stream, _ = self.capture(response=player(media=False))
        self.assertEqual(rc, 2)
        self.assertFalse(stream["ok"])

    def test_existing_operator_jar_is_never_read_or_adopted(self):
        self.out.mkdir()
        jar = self.out / "cookies.txt"
        jar.write_text("operator-secret\n")
        rc, stream, _ = self.capture()
        self.assertEqual(rc, 0)
        self.assertEqual(jar.read_text(), "operator-secret\n")
        self.assertEqual(stream["cookies_file"], "")
        self.assertEqual(stream["cookie_count"], 0)

    def test_attach_uses_dedicated_endpoint(self):
        rc, _, sb = self.capture(cdp_host="127.0.0.1", cdp_port=9222, binary="/usr/bin/chromium")
        self.assertEqual(rc, 0)
        self.assertEqual(sb.kwargs["host"], "127.0.0.1")
        self.assertEqual(sb.kwargs["port"], 9222)
        self.assertNotIn("user_data_dir", sb.kwargs)

    def test_local_and_unsafe_urls_are_rejected_by_default(self):
        with self.assertRaises(ValueError):
            bs.validate_target_url("http://127.0.0.1:8000/watch?v=" + VIDEO_ID)
        with self.assertRaises(ValueError):
            bs.validate_target_url("file:///etc/passwd")
        self.assertTrue(bs.validate_target_url("http://127.0.0.1:8000/watch?v=" + VIDEO_ID, allow_local=True))
        self.assertFalse(bs.valid_media_url("file:///etc/passwd"))
        self.assertFalse(bs.valid_media_url("http://127.0.0.1/live.m3u8"))
        self.assertTrue(bs.valid_media_url("https://rr1.googlevideo.com/videoplayback"))

    def test_muxed_and_split_media_selection(self):
        p = player(media=False)
        p["streamingData"]["formats"] = [{"itag": 18, "mimeType": "video/mp4", "height": 360,
                                          "audioQuality": "AUDIO_QUALITY_LOW", "url": "https://rr1.googlevideo.com/muxed"}]
        facts = bs.summarize_player(p)
        self.assertTrue(bs.has_playable_media(facts))
        self.assertEqual(facts["muxed_url"], "https://rr1.googlevideo.com/muxed")
        p["streamingData"]["formats"] = []
        p["streamingData"]["adaptiveFormats"] = [{"itag": 137, "mimeType": "video/mp4", "height": 1080,
                                                  "audioQuality": "AUDIO_QUALITY_NONE", "url": "https://rr1.googlevideo.com/video"}]
        facts = bs.summarize_player(p)
        self.assertFalse(bs.has_playable_media(facts))
        self.assertEqual(facts["audio_url"], "")


if __name__ == "__main__":
    unittest.main(verbosity=2)
