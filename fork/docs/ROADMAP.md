# Roadmap - DeepTutor fork: native exam study + better UX/UI

**Verdict.** Four PHASES. Phase 1 lays the Exam Pack engine, the Exams tab and the accessibility basics, as small independent tickets the overnight kitchen can run in parallel. Phase 4 retires the private `/study/desk` only after the parity list is fully shipped. MVP = Phases 1-2. Gen 1 = Phases 1-4.

Workflow: KITCHEN (rapid prototype). Code model per ticket: Codex `gpt-6.2-sol`, reasoning high. One branch + one PR per ticket to `main`; CodeRabbit reviews; Amit merges.

## Phase 1 - Foundation (goal: packs load, Exams tab shows them, comfort basics exist)
Exit check: on a local run with the demo pack, `/learning/exams` lists the demo pack and its subjects. Run `pytest deeptutor/exam_packs/tests -q` from the repository root. Run `npm run typecheck` and `npm run i18n:check` from `web/`. All three commands must pass.

Tickets (all small, each = one GitHub issue labelled `fork-ticket` + `phase-1`):
1. EP-01 Exam Pack models + loader (backend ticket)
2. EP-02 Demo pack + pack format doc
3. EP-03 Glossary lookup
4. EP-04 Exam Packs read API router
5. EP-05 Public-repo privacy guard test
6. UI-01 Exam API client + types (web)
7. UI-02 Exam i18n namespace in all locales
8. UI-03 Exams home page (S2) with ExamPackCard + empty state
9. A11Y-01 ReadAloudButton component
10. A11Y-02 RtlBlock + GlossaryChip components
11. A11Y-03 Focus mode (toggle + frame + timer)
12. A11Y-04 Study comfort settings provider (font, size, spacing, contrast as CSS variables)

## Phase 2 - Study loop (goal: study a topic end to end inside DeepTutor)
Exit check: from S3 a learner starts a mastery session for a pack topic, uses pause-and-ask and read-aloud, then does a teach-back that updates topic status.
First three tickets: Subject topic map page (S3) - Pack topic to mastery-path link - Teach-back endpoint + card (S5).

## Phase 3 - Practice, plan, notes, decks (goal: desk parity for the big tools)
Exit check: timed mock with marking, plan sessions in the calendar with reminders, deck import and play, PDF notes with print/download - each with a passing test.
First three tickets: Mock builder + marking API - Mock paper screen (S7) - Deck import (CSV/Anki) + DeckPlayer (S6).

## Phase 4 - Parity sign-off and desk retirement (goal: one product)
Exit check: every row of the PRD parity table is shipped and ticked by Amit on preview; `fork/UPSTREAM.md` sync with the latest upstream release done with conflicts only in listed files. Retiring `/study/desk` in the private omni-tutor repo is Amit's call and happens there, not in this fork.
First three tickets: Parity checklist page in `fork/docs` with evidence links - Upstream sync dry run to the latest DeepTutor release - Hebrew UI locale (`he`) with RTL layout check.

## Ordering and parallel work
- EP-02 and EP-03 follow EP-01. EP-04 follows EP-01 and EP-03. These dependent tickets branch from their parent's branch while the parent PR is open (stacked PRs, base `main`).
- Start UI-03 after both the UI-01 and UI-02 PRs have merged into `main`. Create the UI-03 branch from the updated `main` so it includes both dependencies.
- Batches of 9 or 15. Up to 15 Codex workers in parallel on the VPS, limited by free RAM (keep >= 4 GB) and disk (keep >= 30 GB).

## Open questions for Amit
1. Is "MVP = Phases 1-2" right, or must mock exams be in the MVP?
2. Any hard date for the maths exam that should set Phase 3's deadline? (Not written here on purpose: no personal calendar in standing docs.)

## Sources
- PRD, TRD, App flow, UI brief, Backend schema (this folder). Software-factory ticket and batch rules.
