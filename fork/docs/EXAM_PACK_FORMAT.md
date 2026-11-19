# Exam Pack Format

An exam pack is a folder of UTF-8 files. The bundled [demo pack](../demo-pack/)
contains a made-up algebra exam. To use it, copy the folder to
`data/user/exam_packs/demo-algebra/`. Set `DEEPTUTOR_EXAM_PACKS_DIR` to use a
different parent folder. The loader looks for packs in that folder's direct
subfolders. Keep private packs in the runtime folder.

## `pack.json`

The JSON file contains one object with these fields.

| Field | Meaning |
| --- | --- |
| `id` | Pack ID, such as `demo-algebra`. |
| `title` | Pack display name, such as `Demo Algebra`. |
| `exam` | Exam name, such as `Demo Exam`. |
| `source_lang` | Source language code, `he` for Hebrew in the demo. |
| `ui_lang` | Display language code, `en` for English in the demo. |
| `subjects` | List of subject objects. |

Each subject has an `id` such as `algebra`, a `title` in the display language,
a `title_source` in the source language, and a `questionnaires` list. The
optional `exam_dates` field is a list of dates written as `YYYY-MM-DD`.

Each questionnaire has a string `code` such as `DEMO-1`, a display `title`,
an integer `minutes` for the duration, and `topic_weights`, an object mapping
topic IDs to numbers. The demo gives `linear-equations` a weight of `0.4`.

## `topics/<subject-id>/<topic-id>.md`

Put each topic under its subject folder, for example
`topics/algebra/linear-equations.md`. Start with YAML front matter between two
lines containing only `---`.

| Field | Meaning |
| --- | --- |
| `id` | Topic ID, such as `linear-equations`. Use it in questionnaire weights and glossary links. |
| `title` | Topic name in the display language. |
| `title_source` | Topic name in the source language. |
| `questionnaire` | Questionnaire code as a string, such as `"DEMO-1"`. |
| `weight` | Numeric topic weight. Use the same value in `topic_weights`. |
| `objectives` | List of learning goals written as strings. |

Write the study text in Markdown after the closing `---`. The loader gets
`subject_id` from the parent folder and `body_md` from the Markdown text.

## `glossary.csv`

Use these four column names in the header and write one term per row.

| Column | Meaning |
| --- | --- |
| `term_source` | Term in the source language, such as `משתנה`. |
| `term_ui` | Term in the display language, such as `Variable`. |
| `note` | Short explanation. This cell can be empty. |
| `topic_ids` | Related topic IDs separated by semicolons, such as `linear-equations;functions`. Leave empty if there are no links. |

Quote CSV values that contain commas. The loader fills the pack's `path`,
`topics`, and `glossary` fields from the folder and files. An optional
`materials/` folder can hold PDFs and notes. The current loader reads only
the files described above.
