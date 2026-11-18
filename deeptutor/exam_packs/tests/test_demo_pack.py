from pathlib import Path
import shutil

from deeptutor.exam_packs import load_packs


def test_load_demo_pack(tmp_path: Path) -> None:
    demo_dir = Path(__file__).resolve().parents[3] / "fork" / "demo-pack"
    pack_dir = tmp_path / "demo-algebra"
    shutil.copytree(demo_dir, pack_dir)

    (pack,) = load_packs(tmp_path)

    assert pack.id == "demo-algebra"
    assert pack.exam == "Demo Exam"
    assert (pack.source_lang, pack.ui_lang) == ("he", "en")
    assert pack.path == pack_dir

    (subject,) = pack.subjects
    assert subject.id == "algebra"
    (questionnaire,) = subject.questionnaires
    assert questionnaire.code == "DEMO-1"
    assert questionnaire.minutes == 60

    assert len(pack.topics) == 3
    topic_ids = {topic.id for topic in pack.topics}
    assert topic_ids == {"linear-equations", "functions", "percentages"}
    assert questionnaire.topic_weights == {topic.id: topic.weight for topic in pack.topics}
    for topic in pack.topics:
        assert topic.subject_id == subject.id
        assert topic.questionnaire == questionnaire.code
        assert 2 <= len(topic.objectives) <= 3
        assert topic.body_md.strip()

    assert len(pack.glossary) == 5
    for term in pack.glossary:
        assert term.term_source and term.term_ui and term.note
        assert term.topic_ids and set(term.topic_ids) <= topic_ids
