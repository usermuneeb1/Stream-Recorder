#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: every .github/workflows/*.yml must be a loadable workflow  ║
# ║                                                                              ║
# ║  Locks down the 2026-09-02 → 2026-10-14 incident: a web-editor edit          ║
# ║  (69e2ad4, "Update install-self-test.yml") over-indented one `- name:` step  ║
# ║  by 6 spaces. The file stopped parsing as YAML, so GitHub could not even     ║
# ║  read its `on:` block → it logged a 0-job "failure" run on EVERY push to     ║
# ║  main for 6 weeks, and the real Install self-test (daily 05:30 UTC) never    ║
# ║  ran once. A sentinel cannot protect itself; this test protects it.         ║
# ║                                                                              ║
# ║  Must stay true FOREVER:                                                     ║
# ║   1. every workflow file parses as YAML                                      ║
# ║   2. it has `on:` and `jobs:` mappings                                       ║
# ║   3. every job's `steps` is a list of mappings, each with `uses` or `run`    ║
# ║      (a mis-indented step silently becomes a nested list — caught here)      ║
# ║   4. no duplicate step ids inside a job                                      ║
# ║                                                                              ║
# ║  Deps: python3 + PyYAML (both present on ubuntu runners and in CI's         ║
# ║  quality-check job). Exits non-zero on RED.                                  ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
WF_DIR="${1:-$ROOT/.github/workflows}"

if ! python3 -c 'import yaml' 2>/dev/null; then
    echo "  ❌ PyYAML missing (pip install pyyaml) — cannot validate workflows"
    exit 1
fi

python3 - "$WF_DIR" <<'PY'
import glob, os, sys, yaml

wf_dir = sys.argv[1]
files = sorted(glob.glob(os.path.join(wf_dir, "*.yml")) + glob.glob(os.path.join(wf_dir, "*.yaml")))
if not files:
    print(f"  ❌ no workflow files found under {wf_dir}")
    sys.exit(1)

failures = 0
def ok(msg):  print(f"  ✅ {msg}")
def bad(msg):
    global failures
    failures += 1
    print(f"  ❌ {msg}")

for path in files:
    name = os.path.basename(path)
    try:
        with open(path, encoding="utf-8") as fh:
            doc = yaml.safe_load(fh)
    except yaml.YAMLError as exc:
        mark = getattr(exc, "problem_mark", None)
        where = f" (line {mark.line + 1}, col {mark.column + 1})" if mark else ""
        bad(f"{name}: YAML parse error{where}: {getattr(exc, 'problem', exc)}")
        continue

    if not isinstance(doc, dict):
        bad(f"{name}: top level is not a mapping"); continue
    # PyYAML (YAML 1.1) reads the bare key `on` as boolean True.
    if "on" not in doc and True not in doc:
        bad(f"{name}: missing `on:` trigger block"); continue
    jobs = doc.get("jobs")
    if not isinstance(jobs, dict) or not jobs:
        bad(f"{name}: missing/empty `jobs:` mapping"); continue

    problems = []
    for job_id, job in jobs.items():
        if not isinstance(job, dict):
            problems.append(f"job `{job_id}` is not a mapping"); continue
        if "uses" in job:          # reusable-workflow job: no steps expected
            continue
        steps = job.get("steps")
        if not isinstance(steps, list) or not steps:
            problems.append(f"job `{job_id}` has no `steps` list"); continue
        seen_ids = set()
        for i, st in enumerate(steps):
            label = f"job `{job_id}` step #{i + 1}"
            if not isinstance(st, dict):
                problems.append(f"{label} is a {type(st).__name__}, not a mapping (mis-indented `- name:`?)")
                continue
            if "uses" not in st and "run" not in st:
                problems.append(f"{label} ({st.get('name', '?')}) has neither `uses` nor `run`")
            sid = st.get("id")
            if sid is not None:
                if sid in seen_ids:
                    problems.append(f"{label} duplicate step id `{sid}`")
                seen_ids.add(sid)
    if problems:
        for p in problems:
            bad(f"{name}: {p}")
    else:
        ok(f"{name}")

print()
if failures:
    print(f"RESULT: ❌ {failures} workflow problem(s) in {len(files)} file(s)")
    sys.exit(1)
print(f"RESULT: ✅ all {len(files)} workflow files are structurally valid")
PY
