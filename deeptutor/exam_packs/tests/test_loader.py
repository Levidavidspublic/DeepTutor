from datetime import date
import json
import logging
from pathlib import Path

import pytest

from deeptutor.exam_packs import (
    ExamPack,
    GlossaryTerm,
    Questionnaire,
    Subject,
    Topic,
    get_packs_root,
    load_packs,
)


@pytest.fixture
def pack_path(tmp_path: Path) -> Path:
    pack = tmp_path / "sample-pack"
    topics = pack / "topics" / "math"
    topics.mkdir(parents=True)
    metadata = {
        "id": "sample-pack",
        "title": "Sample Pack",
        "exam": "Sample Exam",
        "source_lang": "he",
        "ui_lang": "en",
        "subjects": [
            {
                "id": "math",
                "title": "Math",
                "title_source": "מתמטיקה",
                "questionnaires": [
                    {
                        "code": "001",
                        "title": "Basics",
                        "minutes": 60,
                        "topic_weights": {"functions": 0.75, "graphs": 0.25},
                    }
                ],
                "exam_dates": ["2027-02-03"],
            }
        ],
    }
    (pack / "pack.json").write_text(json.dumps(metadata, ensure_ascii=False), encoding="utf-8")
    (topics / "functions.md").write_text(
        '---\nid: functions\ntitle: Functions\ntitle_source: פונקציות\n'
        'questionnaire: "001"\n'
        "weight: 0.75\nobjectives:\n  - Define a function\n---\n# Functions\n\nStudy a rule.\n",
        encoding="utf-8",
    )
    (topics / "graphs.md").write_text(
        '---\nid: graphs\ntitle: Graphs\ntitle_source: גרפים\nquestionnaire: "001"\n'
        "weight: 0.25\nobjectives: [Read a graph]\n---\nDraw a graph.\n",
        encoding="utf-8",
    )
    (pack / "glossary.csv").write_text(
        "term_source,term_ui,note,topic_ids\n"
        'פונקציה,Function,"A rule, with one output per input",functions; graphs\n'
        "גרף,Graph,,graphs\n",
        encoding="utf-8",
    )
    return pack


def test_load_packs_skips_broken_json(
    tmp_path: Path, pack_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    broken = tmp_path / "broken-pack"
    broken.mkdir()
    (broken / "pack.json").write_text("{", encoding="utf-8")

    assert load_packs(tmp_path) == [
        ExamPack(
            id="sample-pack",
            title="Sample Pack",
            exam="Sample Exam",
            source_lang="he",
            ui_lang="en",
            subjects=[
                Subject(
                    id="math",
                    title="Math",
                    title_source="מתמטיקה",
                    questionnaires=[
                        Questionnaire("001", "Basics", 60, {"functions": 0.75, "graphs": 0.25})
                    ],
                    exam_dates=[date(2027, 2, 3)],
                )
            ],
            path=pack_path,
            topics=[
                Topic(
                    id="functions",
                    subject_id="math",
                    title="Functions",
                    title_source="פונקציות",
                    objectives=["Define a function"],
                    weight=0.75,
                    questionnaire="001",
                    body_md="# Functions\n\nStudy a rule.\n",
                ),
                Topic(
                    id="graphs",
                    subject_id="math",
                    title="Graphs",
                    title_source="גרפים",
                    objectives=["Read a graph"],
                    weight=0.25,
                    questionnaire="001",
                    body_md="Draw a graph.\n",
                ),
            ],
            glossary=[
                GlossaryTerm(
                    "פונקציה",
                    "Function",
                    "A rule, with one output per input",
                    ["functions", "graphs"],
                ),
                GlossaryTerm("גרף", "Graph", "", ["graphs"]),
            ],
        )
    ]
    assert (
        "deeptutor.exam_packs.loader",
        logging.WARNING,
        "Skipping broken exam pack broken-pack (JSONDecodeError)",
    ) in caplog.record_tuples


@pytest.mark.parametrize(
    ("file", "content"),
    [
        ("pack.json", '{"id": "incomplete"}'),
        ("topics/math/functions.md", "---\nid: [invalid YAML\n---\n"),
        ("topics/math/functions.md", '---\nweight: !!int ""\n---\n'),
        ("topics/math/functions.md", "---\nid: missing-closing-fence\n"),
        ("glossary.csv", "term_source,term_ui,note,topic_ids\nגרף,Graph\n"),
    ],
)
def test_skips_malformed_pack(
    pack_path: Path, file: str, content: str, caplog: pytest.LogCaptureFixture
) -> None:
    (pack_path / file).write_text(content, encoding="utf-8")

    assert load_packs(pack_path.parent) == []
    assert "Skipping broken exam pack sample-pack" in caplog.text


def test_packs_root_override(pack_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEEPTUTOR_EXAM_PACKS_DIR", str(pack_path.parent))

    assert get_packs_root() == pack_path.parent
    assert [pack.path for pack in load_packs()] == [pack_path]
    assert load_packs(pack_path.parent / "missing") == []


def test_default_packs_root(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DEEPTUTOR_EXAM_PACKS_DIR", raising=False)

    assert get_packs_root() == Path("data/user/exam_packs")
