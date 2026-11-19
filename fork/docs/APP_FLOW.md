# App flow - DeepTutor fork: native exam study

**Verdict.** Exam study is reached from DeepTutor's existing Learning workspace: Learning -> Exams -> pack -> subject -> topic. Every study tool opens inside that same shell. There is no separate desk page. Focus mode can be switched on from any study screen.

## Screens

| ID | Route | What it shows |
|---|---|---|
| S1 | `/learning` (existing) | Learning home. Gains an "Exams" tab next to Books, Mastery, Practice, Reading, Watching. |
| S2 | `/learning/exams` | Exam home: one card per loaded pack. Per subject: progress ring, next session, exam date, "Continue" button. Empty state: "No exam packs yet" + how to add one (link to docs). |
| S3 | `/learning/exams/[packId]/[subjectId]` | Subject page: topic map (tree), each topic with status (new / learning / review / done), glossary drawer, buttons: Study, Teach it back, Drill, Mock. |
| S4 | `/learning/mastery/[pathId]/sessions/[sessionId]` (existing) | A topic study session. Gains: pause-and-ask button, read-aloud per block, glossary chips for kept source-language terms. |
| S5 | `/learning/exams/[packId]/[subjectId]/teach-back` | Teach it back: prompt card, learner answers by typing or voice, tutor feedback against topic objectives, "try again" or "next". |
| S6 | `/learning/exams/[packId]/[subjectId]/drill` | Deck play: flash cards and quick quiz from a deck (from topic or imported CSV/Anki text). |
| S7 | `/learning/exams/mock/[attemptId]` | Timed mock paper: timer, one question per screen in focus mode, submit, then marks and per-question feedback. |
| S8 | `/learning/exams/[packId]/plan` | Exam plan: weekly view of sessions; "create sessions" writes to DeepTutor's calendar; ICS feed import; reminders on/off. |
| S9 | `/learning/reading/materials` (existing) | Materials. PDF notes from a pack open here; gains a notes panel with print and download. |
| S10 | `/settings/[section]` (existing) | New section "Study comfort": focus mode default, font, spacing, read-aloud speed (0.5-2x), reduced motion, contrast. |
| S11 | `/calendar` (existing) | Shows the plan's sessions; reminder toggles. |

## Click-paths

**Daily study (main loop)**
```
S1 Learning -> [Exams tab] -> S2 -> [Continue on Maths] -> S3 (next topic highlighted)
  -> [Study] -> S4 session (read-aloud, pause-and-ask) -> session end
  -> [Teach it back] -> S5 -> feedback -> back to S3 (topic status updated)
```

**Practice before the exam**
```
S3 -> [Mock] -> choose questionnaire (e.g. 35172) -> S7 timer starts
  -> submit -> marks + feedback -> [Drill weak topics] -> S6 -> back to S3
```

**Plan the weeks**
```
S2 -> [Plan] -> S8 -> set exam date (or read from pack) -> [Create sessions]
  -> S11 calendar shows sessions -> reminders fire in the browser (opt-in)
```

**Notes**
```
S3 -> topic -> [Materials] -> S9 -> open PDF -> notes panel -> [Print] / [Download]
```

**Comfort**
```
any study screen -> [Focus] toggle (top bar) -> one task on screen + timer
S10 -> Study comfort -> font / spacing / speed / motion / contrast -> saved, applies everywhere
```

## States to design for every screen
- Loading (skeleton, no spinner wall), empty, error with one plain next step, offline (Phase 3).
- No provider configured: the tutor actions show "Set a model in Settings" instead of failing. (EXTRAPOLATED, matches upstream behaviour - `UNKNOWN` until checked.)
- Right-to-left source blocks inside an English page.

## Desk parity map (what replaces `/study/desk`)
| Desk area | New place |
|---|---|
| Notes, print | S9 |
| Calendar, feed, reminders | S8, S11 |
| Games, decks | S6 |
| Slide lessons, sample lesson | S4 |
| Teach-back | S5 |
| Board / saved app / QR hand-off | Phase 3 (EXTRAPOLATED) |
| Bagrut path, mock, marking, progress | S2, S3, S7 |

## Open questions for Amit
1. Should "Exams" be its own top-level workspace item instead of a Learning tab?
2. On S3, which button is primary: Study or Continue where I left off?
3. Do you want the mock in strict exam mode (no tutor help) by default?

## Sources
- DeepTutor v1.7.3 `web/app/(workspace)/learning/*` routes; `web/app/(settings)/settings/[section]`; `web/app/(workspace)/calendar`.
- omni-tutor `study/public/*.html` page list (desk, lesson, plan, hand, index).
