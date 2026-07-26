---
name: systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes
---

# Systematic Debugging

## Overview

**Core principle:** ALWAYS find root cause before attempting fixes. Symptom fixes are failure.

**Violating the letter of this process is violating the spirit of debugging.**

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you cannot propose fixes.

## When to Use

Use for ANY technical issue:
- Test failures, bugs in production, unexpected behavior
- Performance problems, build failures, integration issues

**Use ESPECIALLY when:**
- Under time pressure (emergencies make guessing tempting)
- "Just one quick fix" seems obvious
- You've already tried multiple fixes

## The Four Phases

### Phase 1: Root Cause Investigation
1. **Read Error Messages Carefully** — complete stack traces, line numbers, error codes
2. **Reproduce Consistently** — exact steps, every time?
3. **Check Recent Changes** — git diff, recent commits, new dependencies
4. **Gather Evidence in Multi-Component Systems** — diagnostic instrumentation at each boundary
5. **Trace Data Flow** — where does bad value originate? Fix at source, not symptom.

### Phase 2: Pattern Analysis
1. Find working examples in same codebase
2. Compare against references (read completely, don't skim)
3. Identify differences — list every one, don't assume "that can't matter"
4. Understand dependencies, assumptions

### Phase 3: Hypothesis and Testing
1. Form single hypothesis: "I think X is root cause because Y"
2. Test minimally — smallest possible change, one variable at a time
3. Verify before continuing. Didn't work? New hypothesis.
4. Say "I don't understand X" when you don't.

### Phase 4: Implementation
1. Create failing test case first
2. Implement single fix — address root cause, ONE change at a time
3. Verify fix — test passes, no other tests broken
4. If fix doesn't work: STOP. If < 3 tries: return to Phase 1. If ≥ 3: STOP and question architecture.

### If 3+ Fixes Failed: Question Architecture
Patterns: each fix reveals new coupling, fixes require "massive refactoring," each fix creates new symptoms. STOP and question fundamentals.

## Red Flags — STOP

- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Add multiple changes, run tests"
- "Skip the test, I'll manually verify"
- Proposing solutions before tracing data flow
- "One more fix attempt" (when already tried 2+)

## Quick Reference

| Phase | Key Activities | Success Criteria |
|-------|---------------|------------------|
| **1. Root Cause** | Read errors, reproduce, check changes, gather evidence | Understand WHAT and WHY |
| **2. Pattern** | Find working examples, compare | Identify differences |
| **3. Hypothesis** | Form theory, test minimally | Confirmed or new hypothesis |
| **4. Implementation** | Create test, fix, verify | Bug resolved, tests pass |
