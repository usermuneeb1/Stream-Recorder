#!/usr/bin/env python3
"""Public-data validation boundaries, exercised on disposable files only."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class DataValidationEdges(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        # The aggregate runner redirects generated feeds elsewhere. This test
        # must inspect its own disposable checkout, not that external output.
        self.env = os.environ.copy()
        self.env.pop('FEEDS_OUT', None)
        (self.root / 'scripts').mkdir()
        (self.root / 'data').mkdir()
        for name in ('data-gate.sh', 'gen-status.py', 'generate-feeds.py'):
            shutil.copy2(ROOT / 'scripts' / name, self.root / 'scripts' / name)
        self.rec = {'video_id': 'abcdefghijk', 'title': 'Valid recording',
                    'channel': 'The Muslim Lantern', 'date': '2026-10-31',
                    'video_url': 'https://www.youtube.com/watch?v=abcdefghijk',
                    'duration_sec': 60, 'size_bytes': 1024}
        self.write('data/recordings.json', [self.rec])
        self.write('stats.json', {'total_streams': 1, 'total_hours': 0.02})
        self.write('data/mirror-health.json', {'summary': {'total': 1}})

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, name, value):
        (self.root / name).write_text(json.dumps(value))

    def gate(self):
        return subprocess.run(['bash', 'scripts/data-gate.sh'], cwd=self.root,
                              capture_output=True, text=True)

    def test_gate_rejects_non_numeric_duration(self):
        self.write('data/recordings.json', [{**self.rec, 'duration_sec': 'not-a-number'}])
        result = self.gate()
        self.assertNotEqual(result.returncode, 0, 'invalid duration passed the public-data gate')

    def test_gate_rejects_negative_size(self):
        self.write('data/recordings.json', [{**self.rec, 'size_bytes': -100}])
        result = self.gate()
        self.assertNotEqual(result.returncode, 0, 'negative byte count passed the public-data gate')

    def test_gate_rejects_non_string_required_fields(self):
        self.write('data/recordings.json', [{**self.rec, 'title': 123, 'channel': {}}])
        result = self.gate()
        self.assertNotEqual(result.returncode, 0, 'non-string display fields passed the gate')

    def test_gate_accepts_valid_record(self):
        self.assertEqual(self.gate().returncode, 0)

    def test_gate_accepts_archive_only_identity(self):
        self.write('data/recordings.json', [{**self.rec,
                   'video_id': 'archive-personal-backup-001', 'video_url': '',
                   'archive_link': 'https://archive.org/details/personal-backup-001'}])
        result = self.gate()
        self.assertEqual(result.returncode, 0,
                         'the importer supports archive-only ids but the public gate rejects them')

    def test_both_feed_generators_keep_archive_only_recordings(self):
        row = {**self.rec, 'video_id': 'archive-personal-backup-001', 'video_url': '',
               'archive_direct': 'https://archive.org/download/personal-backup-001/video.mp4'}
        self.write('data/recordings.json', [row])
        node_dir = self.root / 'dashboard/scripts'
        node_dir.mkdir(parents=True)
        shutil.copy2(ROOT / 'dashboard/scripts/generate-feeds.mjs', node_dir)
        for cmd in (['python3', 'scripts/generate-feeds.py'], ['node', 'dashboard/scripts/generate-feeds.mjs']):
            with self.subTest(generator=cmd[0]):
                result = subprocess.run(cmd, cwd=self.root, capture_output=True, text=True, env=self.env)
                self.assertEqual(result.returncode, 0, result.stderr)
                feed = json.loads((self.root / 'dashboard/public/feed.json').read_text())
                self.assertEqual([r['id'] for r in feed['items']], [row['video_id']],
                                 'a preserved archive-only recording vanished from public feeds')

    def test_status_tolerates_wrong_shape_optional_stats(self):
        self.write('stats.json', [])
        self.write('data/youtube-stats.json', [])
        result = subprocess.run(['python3', 'scripts/gen-status.py'], cwd=self.root,
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0,
                         'malformed optional stats crashed status for a valid canonical archive')
        status = json.loads((self.root / 'data/system-status.json').read_text())
        self.assertEqual(status['recordings_total'], 1)
        self.assertIsNone(status['total_hours'])


if __name__ == '__main__':
    unittest.main()
