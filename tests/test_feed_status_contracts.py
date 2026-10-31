#!/usr/bin/env python3
"""Generator/write-boundary contracts, exercised without network or repo writes."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET

import yaml

ROOT = Path(__file__).resolve().parents[1]


class GeneratorContracts(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        # The aggregate audit runner exports FEEDS_OUT for its own disposable
        # output. These tests must exercise each generator's default path inside
        # their private checkout, not inherit that external destination.
        self.env = os.environ.copy()
        self.env.pop('FEEDS_OUT', None)
        (self.root / 'scripts').mkdir()
        (self.root / 'data').mkdir()
        for name in ('generate-feeds.py', 'gen-status.py'):
            shutil.copy2(ROOT / 'scripts' / name, self.root / 'scripts' / name)

    def tearDown(self):
        self.tmp.cleanup()

    def write_recordings(self, rows):
        (self.root / 'data' / 'recordings.json').write_text(json.dumps(rows))

    def recording(self, i):
        vid = f'{i:011d}'
        return {
            'video_id': vid, 'title': f'Recording {i}',
            'channel': 'The Muslim Lantern', 'date': '2026-10-01',
            'video_url': f'https://www.youtube.com/watch?v={vid}',
            'archive_direct': f'https://archive.org/download/item-{vid}/video.mp4',
            'size_bytes': 1024, 'duration_sec': 60,
        }

    def test_feeds_do_not_silently_truncate_the_archive(self):
        self.write_recordings([self.recording(i) for i in range(101)])
        subprocess.run(['python3', str(self.root / 'scripts/generate-feeds.py')],
                       check=True, capture_output=True, text=True, env=self.env)
        out = self.root / 'dashboard' / 'public'
        for name in ('feed.xml', 'podcast.xml'):
            tree = ET.parse(out / name)
            self.assertEqual(len(tree.findall('./channel/item')), 101,
                             f'{name} silently omitted archived recordings')
        feed = json.loads((out / 'feed.json').read_text())
        self.assertEqual(len(feed['items']), 101,
                         'feed.json silently omitted archived recordings')
        sitemap = ET.parse(out / 'sitemap.xml')
        self.assertEqual(len(sitemap.findall('{http://www.sitemaps.org/schemas/sitemap/0.9}url')), 102)
        # The production Vercel build uses the Node twin, so exercise the same
        # boundary there rather than locking only the Python implementation.
        node_dir = self.root / 'dashboard/scripts'
        node_dir.mkdir(parents=True)
        shutil.copy2(ROOT / 'dashboard/scripts/generate-feeds.mjs', node_dir)
        subprocess.run(['node', str(node_dir / 'generate-feeds.mjs')],
                       check=True, capture_output=True, text=True, env=self.env)
        self.assertEqual(len(ET.parse(out / 'feed.xml').findall('./channel/item')), 101,
                         'Node RSS generator silently omitted archived recordings')
        self.assertEqual(len(json.loads((out / 'feed.json').read_text())['items']), 101,
                         'Node JSON Feed generator silently omitted archived recordings')

    def test_malformed_index_never_replaces_good_status_with_zeroes(self):
        self.write_recordings([self.recording(1)])
        script = self.root / 'scripts/gen-status.py'
        subprocess.run(['python3', str(script)], check=True, capture_output=True, env=self.env)
        status_path = self.root / 'data/system-status.json'
        before = status_path.read_bytes()
        (self.root / 'data/recordings.json').write_text('[{"broken":')
        result = subprocess.run(['python3', str(script)], capture_output=True, text=True, env=self.env)
        self.assertNotEqual(result.returncode, 0,
                            'malformed canonical index was accepted as an empty archive')
        self.assertEqual(status_path.read_bytes(), before,
                         'malformed canonical index replaced the last good status')

    def test_empty_index_never_replaces_good_status(self):
        self.write_recordings([self.recording(1)])
        script = self.root / 'scripts/gen-status.py'
        subprocess.run(['python3', str(script)], check=True, capture_output=True, env=self.env)
        before = (self.root / 'data/system-status.json').read_bytes()
        self.write_recordings([])
        result = subprocess.run(['python3', str(script)], capture_output=True, env=self.env)
        self.assertNotEqual(result.returncode, 0, 'empty canonical index was published')
        self.assertEqual((self.root / 'data/system-status.json').read_bytes(), before)

    def test_node_build_fails_on_malformed_index_instead_of_shipping_stale_feeds(self):
        node_dir = self.root / 'dashboard/scripts'
        node_dir.mkdir(parents=True)
        script = node_dir / 'generate-feeds.mjs'
        shutil.copy2(ROOT / 'dashboard/scripts/generate-feeds.mjs', script)
        self.write_recordings([self.recording(1)])
        subprocess.run(['node', str(script)], check=True, capture_output=True, env=self.env)
        before = (self.root / 'dashboard/public/feed.xml').read_bytes()
        (self.root / 'data/recordings.json').write_text('[{"broken":')
        result = subprocess.run(['node', str(script)], capture_output=True, env=self.env)
        self.assertNotEqual(result.returncode, 0,
                            'production build accepted malformed data and silently kept stale feeds')
        self.assertEqual((self.root / 'dashboard/public/feed.xml').read_bytes(), before)

    def test_status_refresh_preserves_mirror_health_summary(self):
        self.write_recordings([self.recording(1)])
        health = {'healthy': True, 'total': 22, 'degraded': 0,
                  'dead_links': 0, 'updated_at': '2026-10-30T00:00:00Z'}
        status_path = self.root / 'data/system-status.json'
        status_path.write_text(json.dumps({'mirror_health': health}))
        subprocess.run(['python3', str(self.root / 'scripts/gen-status.py')],
                       check=True, capture_output=True, env=self.env)
        status = json.loads(status_path.read_text())
        self.assertEqual(status.get('mirror_health'), health,
                         'status refresh erased the last mirror-health sweep')

    def test_index_update_workflow_regenerates_and_commits_feeds(self):
        workflow = yaml.safe_load((ROOT / '.github/workflows/status.yml').read_text())
        triggers = workflow.get('on', workflow.get(True))
        self.assertIn('data/recordings.json', triggers['push']['paths'])
        steps = workflow['jobs']['status']['steps']
        generate = next(s for s in steps if 'gen-status.py' in s.get('run', ''))
        self.write_recordings([self.recording(i) for i in range(3)])
        # Execute the actual workflow command in a disposable checkout. Neither
        # the CDN purge nor the remote commit step is run by this test.
        subprocess.run(['bash', '-eo', 'pipefail', '-c', generate['run']], cwd=self.root,
                       check=True, capture_output=True, text=True, env=self.env)
        feed = self.root / 'dashboard/public/feed.xml'
        self.assertTrue(feed.exists(), 'index-update workflow did not regenerate public feeds')
        self.assertEqual(len(ET.parse(feed).findall('./channel/item')), 3)
        commit = next(s for s in steps if s.get('name', '').lower().startswith('commit'))['run']
        for name in ('feed.xml', 'podcast.xml', 'feed.json', 'sitemap.xml'):
            self.assertIn(f'dashboard/public/{name}', commit,
                          f'generated {name} was not included in the publication commit')


if __name__ == '__main__':
    unittest.main(verbosity=2)
