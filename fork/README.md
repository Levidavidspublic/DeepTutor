# fork/ - files that belong to this fork only

This folder holds everything the fork adds that is not product code: the six planning docs, the factory slots, the upstream sync notes and the demo exam pack. Keeping them here keeps merges from `HKUDS/DeepTutor` clean.

## Rules for agents working on fork tickets
DeepTutor's root `AGENTS.md` is the architecture guide and wins for how code is built. These fork rules add to it:

- One ticket = one branch = one PR to `main`. Branch name: `ticket/<issue-number>-<short-name>`.
- Stay inside the ticket's SCOPE (at most 3 files + 1 test). Anything else is a new ticket.
- Never merge a PR, never push to `main`, never force-push, never deploy. Merges and deploys are Amit's unless he approves one in chat.
- Reviewer is CodeRabbit only. Never request `@codex review`. Without CodeRabbit: work built by Opus is reviewed by Codex, and work built by Codex is reviewed by Opus.
- The kitchen lead checks every worker's output against the ticket's scope and its DONE test before calling it ready.
- No API keys, ever: not in code, tests, fixtures, docs or logs.
- Public repo: no private content (persona, personal notes, real exam papers, calendars). Private packs load from `data/user/exam_packs/` at runtime.
- Never weaken a check, skip a test or delete a test to make something pass.
- New UI strings go into every locale folder (the i18n parity check requires it).

## Files
- `docs/` - PRD, TRD, APP_FLOW, UI_BRIEF, BACKEND_SCHEMA, ROADMAP.
- `factory/SLOTS.md` - which tool fills each factory role.
- `MODE` - `kitchen` (rapid prototype).
- `UPSTREAM.md` - how to merge upstream releases and which upstream files the fork touches.
