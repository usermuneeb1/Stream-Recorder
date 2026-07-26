# Superpowers — Agentic Skills Framework

> **Source:** https://github.com/obra/superpowers (MIT License, by Jesse Vincent / Prime Radiant)
> **Adapted for:** Stream-Recorder workspace

---

## The Fundamental Rule

**Invoke relevant skills BEFORE any response or action** — including clarifying questions, exploring the codebase, or checking files. If it turns out wrong for the situation, you don't have to use it.

**IF A SKILL APPLIES TO YOUR TASK, YOU DO NOT HAVE A CHOICE. YOU MUST USE IT.**
This is not negotiable. You cannot rationalize your way out of this.

## Skill Priority

When multiple skills apply, process skills come first — they set the approach, then implementation skills carry it out.

- "Let's build X" → **brainstorming** first, then implementation skills.
- "Fix this bug" → **systematic-debugging** first.
- "Implement from a plan" → **subagent-driven-development** or **executing-plans**.

## Red Flags — STOP and Check for Skills

| Thought | Reality |
|---------|---------|
| "This is just a simple question" | Questions are tasks. Check for skills. |
| "I need more context first" | Skill check comes BEFORE clarifying questions. |
| "Let me explore the codebase first" | Skills tell you HOW to explore. Check first. |
| "This doesn't need a formal skill" | If a skill exists, use it. |
| "I remember this skill" | Skills evolve. Read current version. |
| "I'll just do this one thing first" | Check BEFORE doing anything. |

---

# The Complete Skill Library

## 1. Brainstorming → Design

**Use BEFORE any creative work** — features, components, functionality, or behavior changes.

### The Gate
Do NOT invoke any implementation skill, write any code, scaffold any project, or take any implementation action until you have presented a design and the user has approved it. This applies to EVERY project regardless of perceived simplicity.

**Anti-Pattern:** "This is too simple to need a design." Every project goes through this process. A todo list, a single-function utility, a config change — all of them. "Simple" projects are where unexamined assumptions cause the most wasted work.

### Checklist (create todos for each)

1. **Explore project context** — check files, docs, recent commits
2. **Ask clarifying questions** — one at a time, understand purpose/constraints/success criteria
3. **Propose 2-3 approaches** — with trade-offs and your recommendation
4. **Present design** — in sections scaled to their complexity, get user approval after each section
5. **Write design doc** — save to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` and commit
6. **Spec self-review** — check for placeholders, contradictions, ambiguity, scope
7. **User reviews written spec** — ask user to review before proceeding
8. **Transition to implementation** — invoke writing-plans skill

### Process Flow
Explore context → Ask questions (one at a time) → Propose approaches → Present design sections → Get approval per section → Write spec doc → Self-review → User reviews → Invoke writing-plans

**The terminal state is invoking writing-plans.** Do NOT invoke any implementation skill directly after brainstorming.

---

## 2. Writing Plans

**Use when you have a spec or requirements for a multi-step task, before touching code.**

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything: which files to touch, code, testing, docs. Give the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

### Task Right-Sizing
A task is the smallest unit that carries its own test cycle and is worth a fresh reviewer's gate. Each step is one action (2-5 minutes):
- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to make the test pass" — step
- "Run the tests and make sure they pass" — step
- "Commit" — step

### Plan Structure
Save plans to: `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`

Each plan starts with a header containing: Goal, Architecture, Tech Stack, Global Constraints.

Each task contains: Files (create/modify/test), Interfaces (consumes/produces), Steps with exact code and test commands.

### No Placeholders
Never write: "TBD", "TODO", "implement later", "Add appropriate error handling", "Write tests for the above", "Similar to Task N".

### Execution Handoff
After saving the plan, offer: Subagent-Driven (recommended — fresh subagent per task, review between tasks) or Inline Execution (batch execution with checkpoints).

---

## 3. Using Git Worktrees

**Use when starting feature work that needs isolation from current workspace or before executing implementation plans.**

### Process
1. **Detect existing isolation** — Check if already in a linked worktree or submodule
2. **Create isolated workspace** — Use native worktree tools if available, fall back to `git worktree add`
3. **Project setup** — Auto-detect and run appropriate setup (npm install, cargo build, pip install, etc.)
4. **Verify clean baseline** — Run tests to ensure workspace starts clean

---

## 4. Subagent-Driven Development (SDD)

**Use when executing implementation plans with independent tasks (recommended approach).**

### Why Subagents
You delegate tasks to specialized agents with isolated context. By precisely crafting their instructions and context, you ensure they stay focused and succeed at their task. They should never inherit your session's context or history — you construct exactly what they need.

### Core Principle
Fresh subagent per task + task review (spec compliance + code quality) + broad final review = high quality, fast iteration.

### Process
1. **Setup** — Verify worktree, create ledger, read plan, pre-flight review for conflicts
2. **Per Task** — Dispatch implementer subagent → Implementer works + commits → Generate review package → Dispatch task reviewer (spec compliance + code quality)
3. **Fix Loop** — If review finds issues: up to 5 fix rounds. Rounds 1-3 resume implementer, rounds 4-5 fresh implementer on more capable model. Each round ends with scoped re-review.
4. **Final Review** — Whole-branch code review on most capable model
5. **Finish** — Delete workspace, invoke finishing-a-development-branch

### Continuous Execution
Do not pause to check in with your human partner between tasks. Execute all tasks from the plan without stopping. The only reasons to stop are: BLOCKED status you cannot resolve, ambiguity that genuinely prevents progress, or all tasks complete.

---

## 5. Executing Plans

**Use when you have a written implementation plan to execute in a separate session with review checkpoints.**

Fallback approach when subagents aren't available. Load plan, review critically, execute all tasks with review checkpoints, report when complete.

---

## 6. Test-Driven Development (TDD)

**Use when implementing any feature or bugfix, before writing implementation code.**

### The Iron Law
```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```
Write code before the test? Delete it. Start over.

### Red-Green-Refactor

**RED** — Write one minimal test showing what should happen. One behavior, clear name, real code.
**Verify RED** — Watch it fail for the expected reason (feature missing, not typo). MANDATORY. Never skip.
**GREEN** — Write simplest code to pass the test. No extra features, no refactoring, no "improvements."
**Verify GREEN** — Watch it pass with full suite green.
**REFACTOR** — Clean up only after green. Keep tests green. Don't add behavior.
**Repeat** — Next failing test for next feature.

### Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Too simple to test" | Simple code breaks. Test takes 30 seconds. |
| "I'll test after" | Tests written after pass immediately — which proves nothing. |
| "Tests after achieve same goals" | Tests-after answer "what does this do?" Tests-first answer "what should this do?" |
| "Deleting X hours is wasteful" | Sunk cost fallacy. Rewrite with TDD (high confidence) vs. keep untrustworthy code (low confidence). |
| "TDD will slow me down" | TDD catches bugs before commit, prevents regressions, lets you refactor without fear. |

### Red Flags — STOP and Start Over
- Code before test
- Test after implementation
- Test passes immediately
- Can't explain why test failed
- "I already manually tested it"
- "Keep as reference" or "adapt existing code"

---

## 7. Systematic Debugging

**Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes.**

### The Iron Law
```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

### The Four Phases

**Phase 1: Root Cause Investigation** — Read errors carefully, reproduce consistently, check recent changes (git diff, recent commits), gather evidence in multi-component systems, trace data flow backward.

**Phase 2: Pattern Analysis** — Find working examples, compare against references, identify differences, understand dependencies.

**Phase 3: Hypothesis and Testing** — Form single hypothesis, test minimally (one variable at a time), verify before continuing. Say "I don't understand X" when you don't.

**Phase 4: Implementation** — Create failing test case first, implement single fix, verify fix. If 3+ fixes failed: STOP and question the architecture.

### Supporting Techniques
- **Root cause tracing** — Trace bugs backward through call stack
- **Defense in depth** — Add validation at multiple layers after finding root cause
- **Condition-based waiting** — Replace arbitrary timeouts with condition polling

---

## 8. Verification Before Completion

**Use when about to claim work is complete, fixed, or passing, before committing or creating PRs.**

### The Iron Law
```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```
If you haven't run the verification command in this message, you cannot claim it passes.

### The Gate
1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
5. ONLY THEN: Make the claim

Skip any step = lying, not verifying.

### Red Flags
- Using "should", "probably", "seems to"
- Expressing satisfaction before verification
- About to commit/push/PR without verification
- ANY wording implying success without having run verification

---

## 9. Requesting Code Review

**Use when completing tasks, implementing major features, or before merging.**

Dispatch a code reviewer subagent with precisely crafted context. Review early, review often.

- After each task in SDD (mandatory)
- After completing major feature (mandatory)
- Before merge to main (mandatory)
- Fix Critical issues immediately
- Fix Important issues before proceeding
- Note Minor issues for later

---

## 10. Receiving Code Review

**Use when receiving code review feedback, before implementing suggestions.**

### Response Pattern
READ → UNDERSTAND → VERIFY (against codebase reality) → EVALUATE (technically sound?) → RESPOND (technical acknowledgment or reasoned pushback) → IMPLEMENT (one item at a time, test each)

### Forbidden
- "You're absolutely right!" (performative)
- "Great point!" / "Excellent feedback!"
- Blind implementation before verification

### Push Back When
- Suggestion breaks existing functionality
- Reviewer lacks full context
- Violates YAGNI (unused feature)
- Technically incorrect for this stack

---

## 11. Dispatching Parallel Agents

**Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies.**

Dispatch one agent per independent problem domain. Let them work concurrently.

Good agent prompts are: Focused (one clear problem domain), Self-contained (all needed context), Specific about expected output.

---

## 12. Finishing a Development Branch

**Use when implementation is complete, all tests pass, and you need to decide how to integrate.**

### Process
1. **Verify Tests** — Run full test suite. If failing, report and stop.
2. **Detect Environment** — Normal repo, named-branch worktree, or detached HEAD
3. **Determine Base Branch** — Confirm fork point
4. **Present Options**:
   - Option 1: Merge back to base branch locally
   - Option 2: Push and create a Pull Request
   - Option 3: Keep the branch as-is
5. **Execute Choice**
6. **Cleanup Workspace**

---

## Philosophy

- **Test-Driven Development** — Write tests first, always
- **Systematic over ad-hoc** — Process over guessing
- **Complexity reduction** — Simplicity as primary goal
- **Evidence over claims** — Verify before declaring success
- **YAGNI** — You Aren't Gonna Need It
- **DRY** — Don't Repeat Yourself
- **Small, well-bounded units** — Each file has one clear responsibility
