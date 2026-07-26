---
name: using-git-worktrees
description: Use when starting feature work that needs isolation from current workspace or before executing implementation plans - ensures an isolated workspace exists
---

# Using Git Worktrees

## Overview

Ensure work happens in an isolated workspace. Prefer your platform's native worktree tools. Fall back to manual git worktrees only when no native tool is available.

**Core principle:** Detect existing isolation first. Then use native tools. Then fall back to git.

**Announce at start:** "I'm using the using-git-worktrees skill to set up an isolated workspace."

## Step 0: Detect Existing Isolation

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
BRANCH=$(git branch --show-current)
```

**If `GIT_DIR != GIT_COMMON`:** Already in a linked worktree. Skip to Step 2.

**If `GIT_DIR == GIT_COMMON`:** In a normal repo checkout. Ask for consent before creating a worktree.

## Step 1: Create Isolated Workspace

### 1a. Native Worktree Tools (preferred)
If available, use native tools (EnterWorktree, WorktreeCreate, /worktree, --worktree).

### 1b. Git Worktree Fallback
```bash
git worktree add "$path" -b "$BRANCH_NAME"
cd "$path"
```

## Step 2: Project Setup
Auto-detect and run appropriate setup:
- package.json → npm install
- Cargo.toml → cargo build
- requirements.txt → pip install
- go.mod → go mod download

## Step 3: Verify Clean Baseline
Run tests to ensure workspace starts clean. If tests fail: report and ask.
