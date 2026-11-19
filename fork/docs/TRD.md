# TRD - DeepTutor fork: native exam study + better UX/UI

**Verdict.** Build on DeepTutor's own stack (FastAPI + Python services, Next.js App Router web). Add one Python package (`deeptutor/exam_packs/`), one API router, one web feature folder and one Learning route group. Limit upstream edits to the files listed under Constraints. Private content is a runtime folder, never a repo file.

## Architecture

```
Browser (Next.js, web/)
  /learning/exams/...  -> web/features/exam-prep/*  (new)
        |  REST (web/lib/api.ts style)        |  WebSocket /ws (existing turns)
        v                                     v
FastAPI (deeptutor/api)                 TurnEngine -> capabilities
  routers/exam_packs.py (new)            mastery_path, deep_question, chat (existing)
        |                                     |
        v                                     v
deeptutor/exam_packs/ (new)  ---- uses ---> deeptutor/learning (mastery, grading, scheduler)
  loader, models, glossary, mock, plan       deeptutor/services/calendar, notebook, voice
        |
        v
data/user/exam_packs/<pack-id>/   (runtime folder; private packs mounted here)
```

## Backend slot

- DeepTutor's own backend: Python services with JSON/SQLite storage under `data/user/` (upstream pattern; settings in `data/user/settings/*.json`). No Convex, no Firebase. (EXTRAPOLATED: matches upstream; Amit's product default of Firebase is not applied because this is an upstream fork.)
- New package `deeptutor/exam_packs/`:
  - `models.py` - dataclasses: ExamPack, Subject, Questionnaire, Topic, GlossaryTerm, MockPaper, Attempt.
  - `loader.py` - reads `pack.json`, `topics/<subject>/<topicId>.md`, and `glossary.csv` from each pack folder, then validates and caches the pack.
  - `glossary.py` - term lookup for "keep the Hebrew term" rendering and prompt injection.
  - `mock.py` - builds a timed mock from a questionnaire's topic weights, using `deep_question` for original questions and `deeptutor/learning/grading.py` for marking.
  - `plan.py` - turns exam dates + topics into calendar sessions through `deeptutor/services/calendar`.
  - `tests/` - pytest, added to `testpaths` in one line of `pyproject.toml`.
- `deeptutor/api/module_routes.py` mounts routes declared in enabled module manifests. For exam packs, see the existing `deeptutor.api.routers.exam_packs:router` entry in the `routes` array of `deeptutor/modules/manifests/questions.json`.

## APIs (new, REST under the existing API prefix)

| Method + path | Does |
|---|---|
| GET `/exam-packs` | list loaded packs (id, title, languages, subjects) |
| GET `/exam-packs/{pack}/subjects/{subject}` | topic tree + progress per topic |
| GET `/exam-packs/{pack}/glossary?q=` | glossary terms |
| POST `/exam-packs/{pack}/mock` | start a timed mock for a questionnaire |
| POST `/exam-packs/mock/{attempt}/submit` | submit answers, get marks + feedback |
| POST `/exam-packs/{pack}/plan` | create study sessions in the calendar |
| POST `/exam-packs/reload` | re-read the packs folder |

Exact prefix and auth dependency: copy whatever `routers/practice.py` uses (code-map step in each ticket). Web types come from `npm run contracts:generate` if the contracts tool covers new routers - `UNKNOWN`, checked in the first backend ticket.

## Frontend

- Route group: `web/app/(workspace)/learning/exams/` (`page.tsx`, `[packId]/[subjectId]/page.tsx`, `mock/[attemptId]/page.tsx`).
- Feature folder: `web/features/exam-prep/` (components, hooks, api client). Follows the existing `features/*` pattern and the dependency-cruiser rules (`npm run architecture:check`).
- Accessibility layer: `web/features/a11y-study/` - focus mode, reading-comfort settings, read-aloud button, RTL block wrapper. Settings stored with the existing settings API.
- i18n: every new string goes into a new namespace file `locales/<lang>/exam.json` for **all 13 existing locales** (English text as the fallback), because `npm run i18n:check` enforces parity. A Hebrew UI locale (`he`) is Phase 3 (EXTRAPOLATED).
- Fonts: dyslexia-friendly fonts are self-hosted, open-licensed files (Lexend, OpenDyslexic - licences to be confirmed per file: `UNKNOWN`).

## Constraints

- Public repo: no private content, no keys, no personal data. A pytest privacy guard (ticket EP-05) scans fork-owned files for private markers and key-shaped strings.
- Upstream merge path: new code in new files. Upstream files allowed to change: `deeptutor/modules/manifests/questions.json` (exam packs route entry), `pyproject.toml` testpaths (1 line), the Learning tab list (1 entry), locale folders (new `exam.json` files only), settings section registry (1 entry). See `fork/UPSTREAM.md` for the sync process.
- Tests: Python `pytest deeptutor/exam_packs/tests -q`; web `npm run typecheck`, `npx vitest run <file>`, `npm run i18n:check`, `npm run lint`. A full `npm run check` is too slow per ticket; run on the docs PR and weekly. (EXTRAPOLATED)
- Runtime on the VPS: Python 3.13 venv at `/workspaces/.venv-deeptutor`, Node 24 (upstream asks Node 22 LTS; 24 is used for now - mismatch noted).
- Models: tutor calls go through DeepTutor's existing provider settings. The self-hoster picks the provider. Nothing in the fork hard-codes a provider or key.

## Monorepo layout

Upstream layout is kept as is:
```
deeptutor/            python core   (+ exam_packs/ new)
deeptutor/api/        FastAPI       (+ routers/exam_packs.py new)
web/                  Next.js       (+ features/exam-prep, features/a11y-study, app/(workspace)/learning/exams new)
fork/                 fork-only docs, factory slots, UPSTREAM.md, demo pack
tests/                upstream tests (untouched)
```

## Open questions for Amit
1. OK to keep Node 24 on the VPS, or install Node 22 LTS to match upstream exactly?
2. Should private packs reach the fork through a mounted folder (draft) or through a git submodule of omni-tutor?
3. Which tutor model should the Bagrut pack recommend by default (pack setting only, no key)?

## Sources
- DeepTutor v1.7.3: `AGENTS.md`, `deeptutor/api/routers/*`, `deeptutor/api/module_routes.py`, `deeptutor/modules/manifests/questions.json`, `web/package.json` scripts, `web/scripts/i18n_parity.mjs`, `pyproject.toml` (pytest testpaths).
- omni-tutor `study/src` module comments. PRD (this folder).
