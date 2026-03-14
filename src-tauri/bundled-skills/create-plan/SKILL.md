---
name: create-plan
description: Create a concise, actionable plan. Use when a user explicitly asks for a plan related to a coding task, feature design, or technical problem.
metadata:
  icon: assets/icon.svg
---

# Create Plan

## Goal

Turn a user prompt into a **single, actionable plan** delivered in the final assistant message.

## Workflow

Throughout the entire workflow, operate in read-only mode. Do not write or update files.

1. **Scan context quickly**
   - Use the read tool to check `README.md` and obvious docs (`docs/`, `CONTRIBUTING.md`, `ARCHITECTURE.md`).
   - Skim relevant source files most likely to be affected.
   - Identify constraints: language, framework, test commands, deployment shape.

2. **Ask follow-ups only if blocking**
   - Ask **at most 1–2 questions**.
   - Only ask if you cannot responsibly plan without the answer; prefer multiple-choice.
   - If unsure but not blocked, make a reasonable assumption and state it.

3. **Create a plan using the template below**
   - Start with **1 short paragraph** describing intent and approach.
   - Call out what is **in scope** and what is **out of scope** briefly.
   - Provide a **small checklist** of action items (6–10 items).
     - Each item should be concrete; mention files/commands when helpful.
     - **Make items atomic and ordered**: discovery → changes → tests → rollout.
     - **Verb-first**: "Add…", "Refactor…", "Verify…", "Update…".
   - Include at least one item for **tests/validation** and one for **edge cases/risk**.
   - If there are unknowns, add a small **Open questions** section (max 3).

4. **Output only the plan — no meta-explanations or preamble**

## Plan Template

```markdown
# Plan

<1–3 sentences: what we're doing, why, and the high-level approach.>

## Scope
- In:
- Out:

## Action items
- [ ] <Step 1>
- [ ] <Step 2>
- [ ] <Step 3>
- [ ] <Step 4>
- [ ] <Step 5>
- [ ] <Step 6>

## Open questions
- <Question 1>
```

## Checklist Item Guidance

Good items:
- Point to likely files/modules: `src/...`, `app/...`, `services/...`
- Name concrete validation: "Run `npm test`", "Add unit tests for X"
- Include safe rollout when relevant: feature flag, migration step, rollback note

Avoid:
- Vague steps ("handle backend", "do auth")
- Too many micro-steps
- Writing code (keep the plan implementation-agnostic)
