#!/usr/bin/env bash
# Backup retention is by snapshot DATE, not checkout/filesystem mtime.
# Run the real workflow snapshot step on 31 deliberately reverse-mtime files.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/data/backups"
python3 - "$ROOT/.github/workflows/db-backup.yml" "$TMP" <<'PY' || exit 2
import datetime, json, pathlib, sys, yaml
w = yaml.safe_load(pathlib.Path(sys.argv[1]).read_text())
step = next(s for s in w['jobs']['backup']['steps'] if s.get('name') == 'Snapshot recordings.json')
root = pathlib.Path(sys.argv[2])
(root / 'step.sh').write_text(step['run'])
(root / 'data/recordings.json').write_text('[{"video_id":"new-record"}]')
for day in range(1, 32):
    p = root / f'data/backups/recordings-2026-01-{day:02d}.json'
    p.write_text(json.dumps([{'day': day}]))
    # Oldest name gets newest mtime, as checkout/copy operations can produce.
    stamp = datetime.datetime(2026, 2, 1).timestamp() - day * 86400
    import os
    os.utime(p, (stamp, stamp))
PY
(cd "$TMP" && bash -eo pipefail step.sh) > "$TMP/log" 2>&1
if [[ -f "$TMP/data/backups/recordings-2026-01-31.json" && ! -f "$TMP/data/backups/recordings-2026-01-01.json" ]]; then
  echo 'GREEN: retention preserves newest snapshot dates regardless of filesystem mtime'
  exit 0
fi
echo 'RED: retention pruned by mtime and lost a newer snapshot'
find "$TMP/data/backups" -maxdepth 1 -type f -printf '%f\n' | sort | head -4
exit 1