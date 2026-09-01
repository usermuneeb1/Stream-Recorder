#!/usr/bin/env python3
"""
Contract test: scripts/discord_bot.py (consumer) vs data/system-status.json
(producer schema, as written by scripts/gen-status.py).

Bug 2026-09-01: the Discord `/status` bot rendered "Total Recordings: ?" and
"Total Size: 0.00 GB" because discord_bot.py read `total_recordings`/`total_gb`
while gen-status.py writes `recordings_total`/`total_size_gb`. Only
`total_hours` matched by accident, which is why it was the one correct field.

The test feeds cmd_status() the REAL artifacts from the repo (system-status.json
and recordings.json as they exist on disk) and asserts the rendered Discord
embed carries the real numbers. If either side of the contract drifts again,
this goes red.

Run:  python3 tests/test_status_contract.py         (needs: requests)
"""

import importlib.util
import json
import os
import sys
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = importlib.util.spec_from_file_location(
    "discord_bot", os.path.join(ROOT, "scripts", "discord_bot.py")
)
discord_bot = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(discord_bot)

STATUS_PATH = os.path.join(ROOT, "data", "system-status.json")
RECORDINGS_PATH = os.path.join(ROOT, "data", "recordings.json")


class _FakeResp:
    def __init__(self, payload):
        self._payload = payload

    def json(self):
        return self._payload


def _local_fetch_factory():
    """Serve requests.get from the repo's real data files instead of the network."""
    real_requests_get = discord_bot.requests.get

    def fake_get(url, timeout=10):
        if "system-status.json" in url:
            with open(STATUS_PATH) as f:
                return _FakeResp(json.load(f))
        if "recordings.json" in url:
            with open(RECORDINGS_PATH) as f:
                return _FakeResp(json.load(f))
        return real_requests_get(url, timeout=timeout)

    return fake_get


@unittest.skipUnless(
    os.path.exists(STATUS_PATH) and os.path.exists(RECORDINGS_PATH),
    "repo data files missing",
)
class TestStatusCommandContract(unittest.TestCase):
    def setUp(self):
        with open(STATUS_PATH) as f:
            self.status = json.load(f)
        with open(RECORDINGS_PATH) as f:
            self.recordings = json.load(f)
        self.captured = {}

    def _run_cmd_status(self):
        def capture(title, description, color, fields=None, footer=None):
            self.captured = {"title": title, "fields": fields or []}
            return True

        with mock.patch.object(discord_bot.requests, "get", _local_fetch_factory()), \
             mock.patch.object(discord_bot, "send_discord_embed", capture):
            discord_bot.cmd_status()

        return {f["name"]: f["value"] for f in self.captured["fields"]}

    def test_total_recordings_matches_actual_count(self):
        fields = self._run_cmd_status()
        expected = str(self.status.get("recordings_total", len(self.recordings)))
        self.assertEqual(
            fields.get("Total Recordings"), expected,
            f"/status shows Total Recordings={fields.get('Total Recordings')!r} "
            f"but system-status.json says recordings_total={expected!r} "
            f"(actual recordings.json entries: {len(self.recordings)})",
        )

    def test_total_size_is_real_not_zeroed(self):
        fields = self._run_cmd_status()
        expected_gb = float(self.status.get("total_size_gb", 0))
        shown = fields.get("Total Size", "")
        self.assertTrue(shown.endswith(" GB"), f"unexpected size format: {shown!r}")
        shown_gb = float(shown[:-3])
        if expected_gb > 0:
            self.assertGreater(
                shown_gb, 0,
                f"/status shows {shown!r} but system-status.json total_size_gb={expected_gb}",
            )

    def test_total_hours_matches(self):
        fields = self._run_cmd_status()
        hours = self.status.get("total_hours")
        if hours is not None:
            self.assertEqual(fields.get("Total Hours"), f"{float(hours):.1f}h")

    def test_latest_recording_shown(self):
        fields = self._run_cmd_status()
        latest = self.recordings[0]
        self.assertIn(latest["title"], fields.get("Latest Recording", ""))


if __name__ == "__main__":
    unittest.main(verbosity=2)
