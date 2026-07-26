---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Save plans to:** `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for.

- Design units with clear boundaries and well-defined interfaces
- Each file should have one clear responsibility
- Prefer smaller, focused files over large ones
- Files that change together should live together
- In existing codebases, follow established patterns

## Task Right-Sizing

A task is the smallest unit that carries its own test cycle and is worth a fresh reviewer's gate. Each step is one action (2-5 minutes):

- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to make the test pass" — step
- "Run the tests and make sure they pass" — step
- "Commit" — step

## Plan Document Header

```
# [Feature Name] Implementation Plan

> REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or executing-plans

**Goal:** [One sentence]
**Architecture:** [2-3 sentences]
**Tech Stack:** [Key technologies]

## Global Constraints
[...]
---
```

## Task Structure

```
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`

**Interfaces:**
- Consumes: [what this task uses from earlier tasks]
- Produces: [what later tasks rely on]

- [ ] **Step 1: Write the failing test**
  ```code```
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
  ```code```
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**
```

## No Placeholders

Every step must contain the actual content. Never write:
- "TBD", "TODO", "implement later"
- "Add appropriate error handling"
- "Write tests for the above" (without actual test code)
- "Similar to Task N"
- Steps that describe what to do without showing how

## Self-Review

1. **Spec coverage:** Can you point to a task for each section/requirement?
2. **Placeholder scan:** Any red flags? Fix them.
3. **Type consistency:** Do signatures match across tasks?

## Execution Handoff

After saving the plan, offer:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks
**2. Inline Execution** — batch execution with checkpoints
