# CI wiring patch (cannot be pushed by this token)

The GitHub App token used here lacks the `workflows` permission, so any
push that touches `.github/workflows/*` is rejected. The *scripts and
tests* for these bugs land on the branch; a human (or a PAT with
workflow scope) must apply this patch for the still-red jobs to go green.

```bash
git apply patches/ci-wiring.patch
```

What it wires:

| Workflow | Symptom | Change |
|---|---|---|
| `workflow-watchdog.yml` | 100% red since 2026-08-26, Inspect exit 5 | call `scripts/workflow-watchdog.sh` |
| `install-self-test.yml` | 13 days of false "install regression" pages | call `scripts/check-install-drift.sh` |
| `youtube-stats.yml` | 100% red since 2026-08-26, commit+push exit 128 | stage `dashboard/public/yt-all.json` + `safe-push.sh` |
| `db-backup.yml` | bare `git push` (outage 2026-08-22..25) | `safe-push.sh` |
| `quality-check.yml` | regression tests not executed | run every `tests/*.sh` |
