#!/usr/bin/env bash
# Both capture workflows produce the same canonical archive records. Event-driven
# enrichment must subscribe to both, not only the main recorder.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python3 - "$ROOT" <<'PY'
from pathlib import Path
import sys, yaml
root=Path(sys.argv[1])
names={}
for p in (root/'.github/workflows').glob('*.yml'):
    w=yaml.safe_load(p.read_text())
    names[p.name]=w.get('name',p.stem)
assert names['stream-recorder.yml']=='Stream Recorder'
assert names['stream-sniper.yml']=='Go-live sniper'
consumers=['thumbnail-gen','storyboard-gen','telegram-mirror','youtube-ghost-host',
           'chat-archiver','catbox-mirror','auto-issue']
missing=[]
for stem in consumers:
    w=yaml.safe_load((root/f'.github/workflows/{stem}.yml').read_text())
    trigger=w.get('on',w.get(True,{}))['workflow_run']['workflows']
    for producer in ('stream-recorder.yml','stream-sniper.yml'):
        if names[producer] not in trigger:
            missing.append(f'{stem} misses {names[producer]}')
stale=[]
for p in (root/'.github/workflows').glob('*.yml'):
    w=yaml.safe_load(p.read_text())
    trigger=w.get('on',w.get(True,{})).get('workflow_run',{})
    for name in trigger.get('workflows',[]):
        if name not in names.values():
            stale.append(f'{p.name} subscribes to nonexistent workflow {name!r}')
if stale:
    print('RED: workflow_run subscriptions reference nonexistent producers')
    print('\\n'.join(stale))
    raise SystemExit(1)
if missing:
    print('RED: successful sniper captures do not trigger the full archive pipeline')
    print('\n'.join(missing))
    raise SystemExit(1)
print('GREEN: both recording paths trigger enrichment, mirrors, chat, and failure ticketing')
PY
