# Backend schema - DeepTutor fork: native exam study

**Verdict.** Exam Packs are read-only files in a runtime folder; learner state (progress, attempts, decks, plan, comfort settings) is stored the way DeepTutor already stores user data under `data/user/`. No new database server. Mastery progress reuses `deeptutor/learning` instead of a second progress store.

## Storage map

| Data | Where | Owner | Read by | Written by |
|---|---|---|---|---|
| Exam Pack files | `data/user/exam_packs/<packId>/` (runtime; private packs mounted) | self-hoster | `exam_packs.loader` | the person (copy/mount), never the app |
| Demo pack | `fork/demo-pack/` (repo, made-up content) | fork | loader (when no packs folder) | maintainers |
| Pack cache | memory (per process) | `exam_packs.loader` | API router | loader on start / `POST /exam-packs/reload` |
| Topic mastery | existing `deeptutor/learning` storage (mastery paths) | learning | S3, S4 | mastery capability |
| Pack-topic -> mastery-path link | `data/user/exam_packs_state/links.json` | exam_packs | S3 | `exam_packs.links` |
| Mock attempts | `data/user/exam_packs_state/attempts/<attemptId>.json` | exam_packs | S7, S3 | `exam_packs.mock` |
| Decks | `data/user/exam_packs_state/decks/<deckId>.json` | exam_packs | S6 | deck import, topic-to-deck |
| Teach-back results | `data/user/exam_packs_state/teachback/<topicId>.jsonl` | exam_packs | S3, S5 | teach-back endpoint |
| Plan sessions | existing calendar service (`deeptutor/services/calendar`) | calendar | S8, S11 | `exam_packs.plan` via calendar API |
| Study comfort settings | existing settings JSON (`data/user/settings/*.json`), new key `study_comfort` | settings | whole web app | S10 |

Exact upstream storage helpers (path service, JSON store) are reused: `deeptutor/services/path_service.py`, `deeptutor/services/storage` - names confirmed by code-map step in each ticket.

## Pack format (files)

```
<packId>/
  pack.json          { id, title, exam, source_lang: "he", ui_lang: "en", subjects: [...] }
  topics/<subject>/<topicId>.md   front matter: id, title, title_source, questionnaire, weight, objectives[]
  glossary.csv       term_source, term_ui, note, topic_ids
  materials/         optional PDFs and notes (never committed for private packs)
```

### Records (Python dataclasses in `deeptutor/exam_packs/models.py`)
- **ExamPack**: id, title, exam, source_lang, ui_lang, subjects[Subject], path.
- **Subject**: id, title, title_source, questionnaires[Questionnaire], exam_dates[date] (optional).
- **Questionnaire**: code (e.g. "35172"), title, minutes, topic_weights{topicId: float}.
- **Topic**: id, subject_id, title, title_source, objectives[str], weight, questionnaire, body_md.
- **GlossaryTerm**: term_source, term_ui, note, topic_ids[str].
- **MockPaper**: attempt_id, pack_id, questionnaire, questions[{id, topic_id, prompt, points}], started_at, minutes.
- **Attempt result**: attempt_id, answers{qid: text}, marks{qid: {points, feedback}}, total, submitted_at.
- **Deck**: id, title, source ("csv" | "anki" | "topic"), cards[{front, back, topic_id?}].
- **TeachBack entry**: at, topic_id, learner_text, verdict ("got it" | "partly" | "not yet"), missing[str].

## Functions and who calls them

| Function | Module | Caller |
|---|---|---|
| `load_packs(root) -> list[ExamPack]` | loader | router startup, reload |
| `find_terms(pack, text) -> list[GlossaryTerm]` | glossary | router, prompt builder |
| `build_mock(pack, questionnaire) -> MockPaper` | mock | `POST /exam-packs/{pack}/mock` |
| `mark_attempt(paper, answers) -> Attempt` | mock (uses `learning/grading.py`) | submit endpoint |
| `plan_sessions(pack, subject, start, exam_date) -> list[Session]` | plan | `POST /exam-packs/{pack}/plan` |
| `import_deck(text, kind) -> Deck` | decks | S6 import |
| `teach_back(topic, learner_text) -> TeachBack` | teachback | S5 |

## Security and privacy
- The packs folder path comes from settings or env `DEEPTUTOR_EXAM_PACKS_DIR`; it is never served as static files.
- Pack text goes to the self-hoster's own model provider only when a tutor action runs.
- No keys in pack files; the loader rejects a pack that contains a field named like a key (EXTRAPOLATED safety check).
- Public-repo guard test fails the build if fork files include private markers.

## Open questions for Amit
1. Should mock attempts be kept forever or pruned after the exam date?
2. Is ICS import (from the desk's `feed.ts`) still wanted, or does DeepTutor's calendar cover it?

## Sources
- DeepTutor v1.7.3 `deeptutor/services/*`, `deeptutor/learning/*`, AGENTS.md (runtime settings in `data/user/settings/*.json`).
- omni-tutor `study/src/bagrut.ts`, `deck.ts`, `feed.ts` comments.
