# Bugfix Report (Superseded)

This report claimed that `actions/checkout@v7` did not exist and was "THE KILLER" breaking every workflow. That claim was wrong.

`actions/checkout@v7.0.0` shipped on 2026-06-17, and v7.0.1 followed on 2026-07-20. It is the current latest release, and the repo correctly uses checkout@v7.

Do not run `mass-fix-checkout.sh` to downgrade to v4. The downgrade was applied once and then reverted in commit `c0de20b` once v7 shipped. Downgrading fixes nothing.

For the current, verified bug list and applied fixes, see [DEEP_BUG_FIX_REPORT.md](DEEP_BUG_FIX_REPORT.md).

The full text of the original report is preserved in git history if you need it.
