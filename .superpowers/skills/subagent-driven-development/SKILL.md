---
name: subagent-driven-development
description: Use when executing implementation plans with independent tasks in the current session
---

# Subagent-Driven Development

Execute plan by dispatching a fresh implementer subagent per task, a task review (spec compliance + code quality) after each, and a broad whole-branch review at the end.

**Why subagents:** You delegate tasks to specialized agents with isolated context. By precisely crafting their instructions and context, you ensure they stay focused and succeed at their task. They should never inherit your session's context or history — you construct exactly what they need.

**Core principle:** Fresh subagent per task + task review (spec + quality) + broad final review = high quality, fast iteration

**Continuous execution:** Do not pause to check in with your human partner between tasks. Execute all tasks from the plan without stopping.

## When to Use

- Have implementation plan with mostly independent tasks? → SDD
- Tightly coupled tasks? → executing-plans or manual
- No plan? → brainstorm first

## The Process

### Setup
- Ensure isolated workspace (using-git-worktrees)
- Create a progress ledger file for tracking
- Read the plan once, note context and Global Constraints
- Create todos per task
- Pre-flight scan for conflicts

### 1. Dispatch the Implementer
- Record BASE commit before dispatching
- Extract task brief to a file
- Craft dispatch with: context, brief path, interfaces from earlier tasks, report path
- Never dispatch multiple implementation subagents in parallel
- Specify the model explicitly

### 2. Handle the Report
- **DONE:** Generate review package, dispatch task reviewer
- **DONE_WITH_CONCERNS:** Read concerns, address if needed, proceed to review
- **NEEDS_CONTEXT:** Provide context, re-dispatch
- **BLOCKED:** Assess blocker, escalate if needed

### 3. Review the Task
- Hand the reviewer a diff file (review package)
- Reviewer checks: spec compliance AND code quality
- Both verdicts required

### 4. The Fix Loop
- Minor findings → record in ledger, defer
- Plan conflicts → ask human which governs
- Rounds 1-3: resume original implementer
- Rounds 4-5: fresh implementer, more capable model
- Max 5 rounds per task
- Each round: fix → scoped re-review

### 5. Complete the Task
- Record in ledger when review is clean
- Mark todo complete
- Move to next task

### Final Review
- Whole-branch review on most capable model
- One fix dispatch for all findings
- One scoped re-review
- Adjudicate residuals

### Finish
- Delete plan workspace
- Use finishing-a-development-branch
