---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements
---

# Requesting Code Review

Dispatch a code reviewer subagent to catch issues before they cascade. The reviewer gets precisely crafted context for evaluation — never your session's history.

**Core principle:** Review early, review often.

## When to Request Review

**Mandatory:**
- After each task in subagent-driven development
- After completing major feature
- Before merge to main

**Optional but valuable:**
- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing complex bug

## How to Request

1. Get git SHAs: BASE_SHA and HEAD_SHA
2. Dispatch code reviewer with: DESCRIPTION, PLAN_OR_REQUIREMENTS, BASE_SHA, HEAD_SHA
3. Act on feedback:
   - Fix Critical issues immediately
   - Fix Important issues before proceeding
   - Note Minor issues for later
   - Push back if reviewer is wrong (with reasoning)

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "I'll just review the diff myself" | Reviewing inline burns context. Dispatch a reviewer. |
| "The reviewer needs my whole history" | Hand it precisely crafted context, never session history. |

## Red Flags

**Never:**
- Skip review because "it's simple"
- Ignore Critical issues
- Proceed with unfixed Important issues
- Argue with valid technical feedback
