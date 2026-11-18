# PRD - DeepTutor fork: native exam study (Bagrut first) + better UX/UI

**Verdict.** This fork makes exam study a first-class part of DeepTutor's own Learning workspace instead of a bolted-on side page. It adds Exam Packs (Bagrut maths, history and civics are the first users), ports the study tools from the private Omni Tutor sidecar into DeepTutor screens, and adds an accessible ADHD/dyslexia-friendly mode. Everything private stays out of this public repo and is loaded at runtime.

Status: draft for Amit's review. Gaps are `UNKNOWN`; inferred lines are `(EXTRAPOLATED)`.

## Problem

- Amit studies for the Israeli Bagrut as an external examinee: maths (3 units now, 5 later), history (22261, 22262) and civics (34281, 34282). Material is Hebrew; he learns best with English explanations that keep the Hebrew terms.
- His current setup runs upstream DeepTutor plus a separate "study desk" server at `/study/desk`. The study tools open in a different page with a different look. He is unhappy with that: the point was to improve DeepTutor itself.
- DeepTutor's UI is dense. For a learner with ADHD and severe dyslexia, long text, many panels and no read-aloud on every block make it hard to start and stay on task.

## Users

1. **Amit** - first user. Bagrut external examinee, English UI, Hebrew material, listens more than reads.
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
| Desk tool (omni-tutor `study/src`) | Lands in DeepTutor as |
|---|---|
| PDF notes (`pdf.ts`, `note-file.ts`) | Reading materials + a notes panel with print/download |
| Teach-back (`desk.ts`) | A "Teach it back" mode: the learner explains, the tutor checks against the topic's objectives |
| Lessons, pause-to-ask (`lesson.ts`, `demo.ts`) | Mastery session lesson steps with a pause-and-ask button |
| Weekly plan, quick capture, transcript search (`more.ts`) | Exam plan view writing to DeepTutor's calendar; capture into notebooks |
| Nudges and class reminders (`remind.ts`, `alerts.ts`, `feed.ts`) | Opt-in browser reminders; ICS feed import into the calendar |
| Games and decks (`deck.ts`, `turn.ts`) | Decks (CSV/Anki text import) played as flash cards and quick quizzes |
| Timed mock, marking, progress (`bagrut.ts`) | Practice: timed mock paper from pack topics, marked with rubric feedback |
| Voice turns, speed control (`voice.ts`, `lesson.ts`) | Read-aloud on every block and voice questions, speed 0.5-2x |
| Phone handwriting hand-off (`handoff.ts`, `qr.ts`) | Phase 3 (EXTRAPOLATED): send a photo of handwritten work by QR |

### F4 Accessible study mode
- Focus mode: one task on screen, a short timer, one clear next step.
- Reading comfort: dyslexia-friendly font option, larger line spacing, shorter line length, no justified text.
- Read-aloud button on every content block; reduced motion; high contrast; keyboard-only path.
- Right-to-left rendering for Hebrew blocks inside an English page.

### F5 Upstream-friendly fork
- Fork code lives in new modules and one `fork/` folder. Upstream files get only small, listed registration edits so `upstream/main` can be merged regularly.

## Feature parity

Parity target: everything on the private `/study/desk` page listed in F3. The desk is retired only when every row is shipped and checked (Roadmap Phase 4). Comparators for UX: studywithmommy.com (Amit's reference, on its waiting list - details `UNKNOWN`) and DeepTutor's own current UI. Live comparator research has not been done for this draft: `UNKNOWN`.

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
- Lane S fork check log, 2026-11-18. Amit's memory notes on DeepTutor and Bagrut study.
