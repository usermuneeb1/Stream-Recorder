---
name: finishing-a-development-branch
description: Use when implementation is complete, all tests pass, and you need to decide how to integrate the work
---

# Finishing a Development Branch

## Overview

**Core principle:** Verify tests → Detect environment → Present options → Execute choice → Clean up.

**Announce at start:** "I'm using the finishing-a-development-branch skill to complete this work."

## Step 1: Verify Tests
Run the project's full test suite. If tests fail, report and stop.

## Step 2: Detect Environment
Determine if in a normal repo, named-branch worktree, or detached HEAD.

## Step 3: Determine Base Branch
Confirm the fork point. Ask if unsure.

## Step 4: Present Options

**Normal/named-branch:**
```
Implementation complete. What would you like to do?

1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)

Which option?
```

**Detached HEAD:**
```
1. Push as new branch and create a Pull Request
2. Keep as-is (I'll handle it later)
```

## Step 5: Execute Choice

### Option 1: Merge Locally
```bash
git checkout <base-branch>
git pull
git merge <feature-branch>
# Verify tests on merged result
# Clean up worktree
git branch -d <feature-branch>
```

### Option 2: Push and Create PR
```bash
git push -u origin <feature-branch>
# Create PR with forge's tooling
```

### Option 3: Keep As-Is
Report branch and worktree location.

### Discard (explicit request only)
Confirm with exact "discard" input, then force-delete.

## Step 6: Cleanup Workspace
Remove worktree if Superpowers created it, otherwise leave in place.
