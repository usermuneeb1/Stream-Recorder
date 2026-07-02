#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  MASS FIX: actions/checkout@v7 → v4                                         ║
# ║  Run this in your repo root. It patches EVERY workflow file.               ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

REPO_ROOT="${1:-.}"
WORKFLOWS_DIR="${REPO_ROOT}/.github/workflows"

if [[ ! -d "$WORKFLOWS_DIR" ]]; then
    echo "❌ .github/workflows not found at ${WORKFLOWS_DIR}"
    echo "Usage: bash mass-fix-checkout.sh [path-to-repo-root]"
    exit 1
fi

FIXED=0
for f in "$WORKFLOWS_DIR"/*.yml; do
    if grep -q 'actions/checkout@v7' "$f" 2>/dev/null; then
        sed -i 's/actions\/checkout@v7/actions\/checkout@v4/g' "$f"
        echo "✅ Fixed: $f"
        ((FIXED++)) || true
    fi
done

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Fixed ${FIXED} workflow file(s)."
echo "  Commit with: git add .github/workflows && git commit -m 'fix: checkout@v7 → v4'"
echo "═══════════════════════════════════════════════════════════════"
