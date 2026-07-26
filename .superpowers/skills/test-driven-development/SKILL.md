---
name: test-driven-development
description: Use when implementing any feature or bugfix, before writing implementation code
---

# Test-Driven Development (TDD)

## Overview

Write the test first. Watch it fail. Write minimal code to pass.

**Core principle:** If you didn't watch the test fail, you don't know if it tests the right thing.

**Violating the letter of the rules is violating the spirit of the rules.**

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Write code before the test? Delete it. Start over.

**No exceptions:**
- Don't keep it as "reference"
- Don't "adapt" it while writing tests
- Don't look at it
- Delete means delete

## Red-Green-Refactor

### RED — Write Failing Test
Write one minimal test showing what should happen. One behavior, clear name, real code.

### Verify RED — Watch It Fail
MANDATORY. Never skip. Confirm test fails for expected reason (feature missing, not typos).

### GREEN — Minimal Code
Write simplest code to pass the test. Don't add features, refactor other code, or "improve" beyond the test.

### Verify GREEN — Watch It Pass
MANDATORY. Confirm test passes, other tests still pass, output pristine.

### REFACTOR — Clean Up
After green only: remove duplication, improve names, extract helpers. Keep tests green. Don't add behavior.

### Repeat
Next failing test for next feature.

## Good Tests

| Quality | Good | Bad |
|---------|------|-----|
| **Minimal** | One thing. "and" in name? Split it. | `test('validates email and domain and whitespace')` |
| **Clear** | Name describes behavior | `test('test1')` |
| **Shows intent** | Demonstrates desired API | Obscures what code should do |

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Too simple to test" | Simple code breaks. Test takes 30 seconds. |
| "I'll test after" | Tests written after pass immediately — which proves nothing. |
| "Tests after achieve same goals" | Tests-after = biased by written code. Tests-first = what should happen. |
| "Already manually tested" | Manual testing is ad-hoc, no record, easy to forget cases. |
| "Deleting X hours is wasteful" | Sunk cost fallacy. Real choice: rewrite with TDD vs. keep untrustworthy code. |
| "Keep as reference, write tests first" | You'll adapt it. That's testing after. Delete means delete. |
| "TDD will slow me down" | TDD catches bugs before commit, prevents regressions. |

## Red Flags — STOP and Start Over

- Code before test
- Test after implementation
- Test passes immediately
- Can't explain why test failed
- "I already manually tested it"
- "Keep as reference" or "adapt existing code"

## Verification Checklist

Before marking work complete:
- [ ] Every new function/method has a test
- [ ] Watched each test fail before implementing
- [ ] Each test failed for expected reason
- [ ] Wrote minimal code to pass each test
- [ ] All tests pass
- [ ] Output pristine
- [ ] Tests use real code (mocks only if unavoidable)
- [ ] Edge cases and errors covered

## Final Rule
```
Production code → test exists and failed first
Otherwise → not TDD
```
