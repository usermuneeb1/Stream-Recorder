#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: literal `git add <path>` targets in workflows must exist   ║
# ║                                                                              ║
# ║  Locks down the youtube-stats.yml incident (2026-08-26 → 2026-10-14, every   ║
# ║  scheduled run red): the commit step ran                                     ║
# ║      git add data/youtube-stats.json public/yt-all.json                      ║
# ║  but the scrape step runs with working-directory: dashboard, so the file is ║
# ║  dashboard/public/yt-all.json. `git add` with a pathspec that matches        ║
# ║  nothing is fatal (exit 128) and under the runner's `bash -e` the step died  ║
# ║  before `git push` — four months of stats refreshes were thrown away.        ║
# ║                                                                              ║
# ║  For every workflow step: each literal, non-glob, non-variable argument of   ║
# ║  `git add` must exist in the repo, resolved against the step's              ║
# ║  working-directory. Paths that a workflow CREATES at runtime can be          ║
# ║  whitelisted below with a reason.                                            ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"

if ! python3 -c 'import yaml' 2>/dev/null; then
    echo "  ❌ PyYAML missing (pip install pyyaml)"; exit 1
fi

python3 - "$ROOT" <<'PY'
import glob, os, re, sys, yaml

root = sys.argv[1]
# path -> reason it is allowed to be absent from the tree at test time
RUNTIME_CREATED = {
    # none today; add "workflow.yml:relative/path": "why" entries here
}

failures = 0
checked = 0
def ok(m):  print(f"  ✅ {m}")
def bad(m):
    global failures; failures += 1; print(f"  ❌ {m}")

import shlex

def git_add_targets(script):
    """Yield literal pathspecs of every `git add ...` in a shell snippet.
    Line-based; tokens after `git add` up to a shell operator/redirection."""
    for raw in script.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        try:
            toks = shlex.split(line, comments=True, posix=True)
        except ValueError:
            continue
        i = 0
        while i < len(toks) - 1:
            if toks[i] == "git" and toks[i + 1] == "add":
                j = i + 2
                while j < len(toks):
                    t = toks[j]
                    if t in ("|", "||", "&&", ";", "&") or re.match(r"^\d*[<>]", t):
                        break
                    if not t.startswith("-"):
                        yield t
                    j += 1
                i = j
            else:
                i += 1

for path in sorted(glob.glob(os.path.join(root, ".github/workflows/*.yml"))):
    wf = os.path.basename(path)
    try:
        doc = yaml.safe_load(open(path, encoding="utf-8"))
    except yaml.YAMLError:
        continue  # tests/workflow-yaml-test.sh owns that failure
    wf_wd = ((doc.get("defaults") or {}).get("run") or {}).get("working-directory") or ""
    for job_id, job in (doc.get("jobs") or {}).items():
        if not isinstance(job, dict):
            continue
        job_wd = ((job.get("defaults") or {}).get("run") or {}).get("working-directory") or wf_wd
        for step in job.get("steps") or []:
            if not isinstance(step, dict) or not step.get("run"):
                continue
            wd = step.get("working-directory") or job_wd
            for arg in git_add_targets(step["run"]):
                    if arg in (".", ":/"):
                        continue
                    if any(ch in arg for ch in "$*?[{"):
                        continue  # variable or glob: not a literal pathspec
                    key = f"{wf}:{arg}"
                    full = os.path.normpath(os.path.join(root, wd, arg)) if wd else os.path.join(root, arg)
                    checked += 1
                    if os.path.exists(full):
                        continue
                    if key in RUNTIME_CREATED:
                        ok(f"{wf} [{job_id}/{step.get('name', '?')}] git add {arg} — absent but whitelisted: {RUNTIME_CREATED[key]}")
                        continue
                    where = f"working-directory={wd}" if wd else "repo root"
                    bad(f"{wf} [{job_id}/{step.get('name', '?')}] git add '{arg}' matches nothing ({where}) — `git add` exits 128 on a dead pathspec")

print()
if failures:
    print(f"RESULT: ❌ {failures} dead pathspec(s) among {checked} literal git-add targets")
    sys.exit(1)
print(f"RESULT: ✅ all {checked} literal git-add targets exist")
PY
