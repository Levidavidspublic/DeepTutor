# Upstream sync

Upstream: https://github.com/HKUDS/DeepTutor (remote `upstream`). Fork base: v1.7.3.

## How to sync (by a ticket, never straight to main)
1. `git fetch upstream --tags`
2. Update local `main` from the fork with `git fetch origin main && git switch main && git merge --ff-only origin/main`. Continue only if this succeeds.
3. `git switch -c sync/upstream-<tag> main && git merge <tag>`
4. Resolve conflicts. Only the files below should conflict.
5. Run `npm run typecheck && npm run i18n:check` from `web/` for every sync.
   If `deeptutor/exam_packs/tests` exists in the checkout, also run
   `pytest deeptutor/exam_packs/tests -q` from the repository root.
6. Push the completed sync branch to the fork with `git push origin sync/upstream-<tag>`.
7. Open a PR from `sync/upstream-<tag>` to `main`. Amit merges.

## Upstream files the fork is allowed to touch
| File | Change |
|---|---|
| `deeptutor/modules/manifests/questions.json` | Register `deeptutor.api.routers.exam_packs:router` with the `learning` auth policy |
| `deeptutor/api/routers/auth.py` | Map `/api/exam-packs` to the `chat` learner surface |
| `deeptutor/api/router_index.json` | Use `python scripts/build_router_index.py` to regenerate the routing entries and fingerprint for lazy loading |
| `deeptutor/services/calendar/store.py` | Add atomic batch creation with stable IDs for exam study sessions |
| `pyproject.toml` | one entry in pytest `testpaths` |
| `web/components/learning/LearningDashboard.tsx` | Workspace-scoped Exams link next to the modern Learning filters |
| `web/features/ui-layout/classic/ClassicLearningDashboard.tsx` | Workspace-scoped Exams link alongside the classic Learning choices |
| `deeptutor/modules/manifests/questions.json` | Register `routers/exam_packs.py` with learning auth |
| `deeptutor/api/routers/auth.py` | Map `/api/exam-packs` to the `chat` learner surface |
| `deeptutor/api/router_index.json` | Generated routing entries and fingerprint for lazy loading |
| `web/components/space/learning/MasteryStudy.tsx` | Linked exam lessons get reply read-aloud, pause-and-ask, topic glossary chips, and a workspace-scoped Teach back link |
| `web/features/chat/messages/ChatMessageList.tsx` | Optional replacement for the completed-reply playback controls |
| Settings section registry (file found by code map) | one section entry: Study comfort |
| `web/locales/*/exam.json` | new files only |
| `AGENTS.md` (root) | appended section "Project reference (read first)" pointing at `fork/docs/` |

Any other upstream file change needs a note here in the same PR.
