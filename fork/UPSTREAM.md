# Upstream sync

Upstream: https://github.com/HKUDS/DeepTutor (remote `upstream`). Fork base: v1.7.3.

## How to sync (by a ticket, never straight to main)
1. `git fetch upstream --tags`
2. `git switch -c sync/upstream-<tag> main && git merge <tag>`
3. Resolve conflicts. Only the files below should conflict.
<<<<<<< HEAD
4. Run `pytest deeptutor/exam_packs/tests -q` and in `web/`: `npm run typecheck && npm run i18n:check`.
=======
4. Run `npm run typecheck && npm run i18n:check` from `web/` for every sync.
   If `deeptutor/exam_packs/tests` exists in the checkout, also run
   `pytest deeptutor/exam_packs/tests -q` from the repository root.
>>>>>>> origin/main
5. Open a PR to `main`. Amit merges.

## Upstream files the fork is allowed to touch
| File | Change |
|---|---|
<<<<<<< HEAD
| `deeptutor/modules/manifests/questions.json` | Register `routers/exam_packs.py` with learning auth |
| `deeptutor/api/routers/auth.py` | Map `/api/exam-packs` to the `chat` learner surface |
| `deeptutor/api/router_index.json` | Generated routing entries and fingerprint for lazy loading |
=======
| `deeptutor/api/router_loader.py` | one line: register `routers/exam_packs.py` |
>>>>>>> origin/main
| `pyproject.toml` | one entry in pytest `testpaths` |
| `web/components/learning/LearningDashboard.tsx` | Workspace-scoped Exams link next to the modern Learning filters |
| `web/features/ui-layout/classic/ClassicLearningDashboard.tsx` | Workspace-scoped Exams link alongside the classic Learning choices |
| Settings section registry (file found by code map) | one section entry: Study comfort |
| `web/locales/*/exam.json` | new files only |

Any other upstream file change needs a note here in the same PR.
