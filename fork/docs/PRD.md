# PRD - DeepTutor fork: native exam study (Bagrut first) + better UX/UI

**Verdict.** This fork makes exam study a first-class part of DeepTutor's own Learning workspace instead of a bolted-on side page. It adds Exam Packs (Bagrut maths, history and civics are the first users), ports the study tools from the private Omni Tutor sidecar into DeepTutor screens, and adds an accessible ADHD/dyslexia-friendly mode. Everything private stays out of this public repo and is loaded at runtime.

Status: draft for Amit's review. Gaps are `UNKNOWN`; inferred lines are `(EXTRAPOLATED)`.

## Problem

- The first user studies for the Israeli Bagrut: maths (3 units now, 5 later), history (22261, 22262) and civics (34281, 34282). Material is Hebrew; explanations work best in English with the Hebrew terms kept.
- The current setup runs upstream DeepTutor plus a separate "study desk" server at `/study/desk`. The study tools open in a different page with a different look. The point of the fork is to improve DeepTutor itself instead.
- DeepTutor's UI is dense. For learners with ADHD or dyslexia, long text, many panels and no read-aloud on every block make it hard to start and stay on task.

## Users

1. **The owner (Amit)** - first user. Bagrut student, English UI, Hebrew material, likes read-aloud.
2. **Any self-hoster** - a student preparing for a structured exam who wants DeepTutor with their own syllabus. (EXTRAPOLATED: this keeps the fork useful as public portfolio work.)

## Features

### F1 Exam Packs (core)
- An Exam Pack is a folder of plain files: exam, subjects, questionnaires (paper codes), topic tree, glossary (term in source language, term in UI language, short explanation), and optional materials.
- Packs load from a runtime folder (`data/user/exam_packs/`), never from the repo. The repo ships one small made-up demo pack and the format spec only.
- A pack can be "bilingual": source material in Hebrew (right-to-left), explanations in English, Hebrew terms kept and shown next to the English.

### F2 Exam home inside Learning
- A new "Exams" tab in the Learning workspace lists loaded packs and, per subject, progress, next session and the exam date.
- Each subject opens a topic map built from the pack's topic tree, linked to DeepTutor's existing mastery paths (Guided Learning).

### F3 Study tools ported from the Omni Tutor desk (parity list)
| Desk tool (omni-tutor `study/src`) | Lands in DeepTutor as | Phase 4 acceptance check on preview |
|---|---|---|
| PDF notes (`pdf.ts`, `note-file.ts`) | Reading materials + a notes panel with print/download | Open a pack PDF, then print and download its notes. |
| Teach-back (`desk.ts`) | A "Teach it back" mode: the learner explains, the tutor checks against the topic's objectives | Submit an explanation and see feedback tied to the topic objectives. |
| Lessons, pause-to-ask (`lesson.ts`, `demo.ts`) | Mastery session lesson steps with a pause-and-ask button | Start a lesson, pause to ask a question, then resume at the same step. |
| Weekly plan, quick capture (`more.ts`) | Exam plan view writing to DeepTutor's calendar and quick capture into notebooks | Create a week of sessions and confirm they appear in the calendar. Capture a note and reopen it in a notebook. |
| Transcript search (`more.ts`) | Chat history search for study-session transcripts, accessible from Learning | Search for a phrase in a study-session transcript and open the matching message. |
| Board | Phase 3 study board in Learning (EXTRAPOLATED) | Add and edit a board item, then reopen the board and confirm the edit is saved. |
| Saved apps | Phase 3 saved apps library in Learning (EXTRAPOLATED) | Save a study app, return to Learning, then find and launch it from the library. |
| Nudges and class reminders (`remind.ts`, `alerts.ts`, `feed.ts`) | Opt-in browser reminders; ICS feed import into the calendar | Import an ICS feed, confirm the events appear, and verify that study nudges and class reminders fire when enabled. |
| Games and decks (`deck.ts`, `turn.ts`) | Decks (CSV/Anki text import) played as flash cards and quick quizzes | Import CSV and Anki text decks, then play flash cards and complete a quick quiz. |
| Timed mock, marking, progress (`bagrut.ts`) | Timed mock paper from pack topics with rubric feedback and progress in Exams | Submit a timed mock and verify the mark, rubric feedback and updated progress. |
| Voice turns, speed control (`voice.ts`, `lesson.ts`) | Read-aloud on every block and voice questions, speed 0.5-2x | Ask a question by voice and verify that every content block can be read aloud at 0.5x and 2x. |
| Phone handwriting hand-off (`handoff.ts`, `qr.ts`) | Phase 3 (EXTRAPOLATED): send a photo of handwritten work by QR | Scan the QR code on a phone, upload a photo and confirm it reaches the study session. |

### F4 Accessible study mode
- Focus mode: one task on screen, a short timer, one clear next step.
- Reading comfort: dyslexia-friendly font option, larger line spacing, shorter line length, no justified text.
- Read-aloud button on every content block; reduced motion; high contrast; keyboard-only path.
- Right-to-left rendering for Hebrew blocks inside an English page.

### F5 Upstream-friendly fork
- Fork code lives in new modules and one `fork/` folder. Upstream files get only small, listed registration edits so `upstream/main` can be merged regularly.

## Feature parity

The Phase 4 parity gate requires every capability in F3 to ship and Amit to verify every acceptance check on preview before the private `/study/desk` can be retired.

Comparators for UX: studywithmommy.com (Amit's reference, on its waiting list - details `UNKNOWN`) and DeepTutor's own current UI. Live comparator research has not been done for this draft: `UNKNOWN`.

## Out of scope

- Any private content in this repo: Amit's persona, his notes, real Bagrut paper scans, his calendar, keys.
- Railway, Vercel or any deploy. Changes to the private omni-tutor repo (the desk retirement happens there later, by Amit's decision).
- Desktop app releases (upstream's desktop release rules apply only if a release is made; none is planned).
- Payments, multi-tenant hosting, Omni Tutor branding.

## Success checks

- Amit can open DeepTutor, pick "Exams", choose maths 35172, study a topic, take a timed mock and see progress, without leaving DeepTutor's UI.
- `npm run check:fast` (web) and `pytest` (fork tests) pass on every PR.
- An upstream merge of the next DeepTutor release produces conflicts only in the files listed in `fork/UPSTREAM.md`.

## Open questions for Amit
1. Should the public fork ship real public Bagrut syllabus topic names, or only the made-up demo pack? (Draft assumes demo pack only.)
2. Which comes first after maths: history or civics?
3. What should the fork be called in its own README (DeepTutor fork, Omni Tutor, other)?
4. Is studywithmommy.com's look the target for the whole app or only the study screens?

## Sources
- omni-tutor `study/src/*.ts` header comments (main, read 2026-11-18).
- DeepTutor v1.7.3 tree: `web/app/(workspace)/learning/*`, `deeptutor/learning/*`, `AGENTS.md`.
- Lane S fork check log, 2026-11-18. Owner's notes on DeepTutor and Bagrut study.
