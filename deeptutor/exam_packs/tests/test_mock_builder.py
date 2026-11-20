from dataclasses import replace
from datetime import timezone
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from deeptutor.agents.question.pipeline import QuestionPipeline
from deeptutor.exam_packs.mock import InvalidMockGeneration, InvalidMockInput, build_mock
from deeptutor.exam_packs.models import ExamPack, Questionnaire, Subject, Topic
from deeptutor.runtime.stream_bus import StreamBus


@pytest.fixture
def sample_pack(tmp_path):
    questionnaire = Questionnaire(
        "demo",
        "Demo",
        45,
        {
            "f": 0.1,
            "c": 0.3,
            "b": 0.4,
            "d": 0.2,
            "e": 0.1,
            "a": 0.4,
            "missing": 10.0,
            "other-subject": 10.0,
            "zero": 0.0,
            "negative": -1.0,
            "infinite": float("inf"),
            "nan": float("nan"),
        },
    )
    subject = Subject("math", "Math", "Math", [questionnaire])
    topics = [
        Topic(
            id=topic_id,
            subject_id="math",
            title=f"Topic {topic_id}",
            title_source=topic_id,
            objectives=[f"Explain {topic_id}"],
            weight=1.0,
            questionnaire="demo",
            body_md="",
        )
        for topic_id in questionnaire.topic_weights
        if topic_id not in {"missing", "other-subject"}
    ]
    topics.append(Topic("a", "physics", "Physics A", "A", [], 1.0, "demo", ""))
    topics.append(Topic("other-subject", "physics", "Force", "Force", [], 1.0, "demo", ""))
    pack = ExamPack("sample", "Sample", "Demo", "en", "es", [subject], tmp_path, topics)
    return pack, subject, questionnaire


@pytest.fixture
def pipeline_run(monkeypatch):
    monkeypatch.setattr(
        "deeptutor.agents.question.pipeline.get_llm_config",
        lambda: SimpleNamespace(model="test-model"),
    )
    with patch.object(QuestionPipeline, "run", autospec=True) as run:
        yield run


def _generated_item(template):
    return {
        "qa_pair": {
            "question_id": template.question_id,
            "question_type": "choice",
            "question": f"Prompt for {template.question_id}",
            "options": {"D": "Four", "C": "Three", "B": "Two", "A": "One"},
            "correct_answer": "B",
            "explanation": f"Explanation for {template.question_id}",
        },
        "metadata": {},
    }


def _valid_payload(_pipeline, *, templates_override, **_kwargs):
    return {"summary": {"results": [_generated_item(t) for t in reversed(templates_override)]}}


@pytest.mark.asyncio
async def test_build_mock_maps_templates_to_topics_in_weight_order(sample_pack, pipeline_run):
    pack, subject, questionnaire = sample_pack
    pipeline_run.side_effect = _valid_payload

    paper = await build_mock(pack, subject, questionnaire)

    pipeline_run.assert_awaited_once()
    call = pipeline_run.await_args
    (pipeline,) = call.args
    assert pipeline.language == pack.ui_lang
    assert call.kwargs["context"].language == pack.ui_lang
    assert pipeline._resolved_tools(call.kwargs["context"]) == []
    assert isinstance(call.kwargs["stream"], StreamBus)
    assert call.kwargs["num_questions"] == 5
    templates = call.kwargs["templates_override"]
    assert [template.question_id for template in templates] == ["q-a", "q-b", "q-c", "q-d", "q-e"]
    assert [template.topic for template in templates] == [
        f"Topic {topic_id}\n- Explain {topic_id}" for topic_id in "abcde"
    ]
    assert all(
        template.question_type == "choice" and template.source == "custom" for template in templates
    )

    assert (paper.pack_id, paper.subject_id, paper.questionnaire) == ("sample", "math", "demo")
    assert paper.minutes == 45
    assert paper.attempt_id
    assert paper.started_at.tzinfo == timezone.utc
    assert [question.topic_id for question in paper.questions] == list("abcde")
    assert [question.points for question in paper.questions] == [28, 28, 21, 15, 8]
    assert sum(question.points for question in paper.questions) == 100
    for question, template in zip(paper.questions, templates, strict=True):
        assert question.id == template.question_id
        assert question.prompt == f"Prompt for {question.id}"
        assert list(question.options.items()) == [
            ("A", "One"),
            ("B", "Two"),
            ("C", "Three"),
            ("D", "Four"),
        ]
        assert question.correct_option == "B"
        assert question.rationale == f"Explanation for {question.id}"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("weights", "expected"),
    [
        ({"b": 1.01, "a": 0.81, "c": 0.12}, [("b", 51), ("a", 42), ("c", 7)]),
        ({"b": 1.7e308, "a": 1.7e308, "c": 5e-324}, [("a", 50), ("b", 49), ("c", 1)]),
        ({"b": 0.1}, [("b", 100)]),
    ],
)
async def test_build_mock_apportions_points_with_topic_id_breaking_ties(
    sample_pack, pipeline_run, weights, expected
):
    pack, subject, questionnaire = sample_pack
    pipeline_run.side_effect = _valid_payload

    paper = await build_mock(pack, subject, replace(questionnaire, topic_weights=weights))

    assert [(question.topic_id, question.points) for question in paper.questions] == expected


@pytest.mark.asyncio
@pytest.mark.parametrize("minutes", [0, -1, 1.5, float("inf"), True])
async def test_build_mock_rejects_invalid_duration_before_generation(
    sample_pack, pipeline_run, minutes
):
    pack, subject, questionnaire = sample_pack

    with pytest.raises(InvalidMockInput, match="duration"):
        await build_mock(pack, subject, replace(questionnaire, minutes=minutes))

    pipeline_run.assert_not_awaited()


@pytest.mark.asyncio
async def test_build_mock_rejects_no_eligible_topics_before_generation(sample_pack, pipeline_run):
    pack, subject, questionnaire = sample_pack
    weights = {
        topic_id: weight
        for topic_id, weight in questionnaire.topic_weights.items()
        if topic_id not in {"a", "b", "c", "d", "e", "f"}
    }

    with pytest.raises(InvalidMockInput, match="no positively weighted topics"):
        await build_mock(pack, subject, replace(questionnaire, topic_weights=weights))

    pipeline_run.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("case", ["missing", "extra", "duplicate", "unknown", "issues", "no_pair"])
async def test_build_mock_rejects_incomplete_or_unusable_results(sample_pack, pipeline_run, case):
    def generate(_pipeline, *, templates_override, **_kwargs):
        items = [_generated_item(template) for template in templates_override]
        if case == "missing":
            items.pop()
        elif case == "extra":
            items.append(_generated_item(templates_override[0]))
        elif case == "duplicate":
            items[-1] = items[0]
        elif case == "unknown":
            items[-1]["qa_pair"]["question_id"] = "unexpected"
        elif case == "issues":
            items[-1]["metadata"]["issues"] = ["missing_explanation"]
        else:
            del items[-1]["qa_pair"]
        return {"summary": {"results": items}}

    pipeline_run.side_effect = generate
    with pytest.raises(InvalidMockGeneration):
        await build_mock(*sample_pack)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "invalid_fields",
    [
        {"question": " "},
        {"question_type": "concept"},
        {"options": {"A": "One", "B": "Two", "C": "Three"}},
        {"options": {"A": "One", "B": "Two", "C": "Three", "D": " "}},
        {"options": {"A": "One", "B": "Two", "C": "Three", "D": " One "}},
        {"correct_answer": "A, B"},
        {"explanation": " "},
        {"explanation": None},
    ],
)
async def test_build_mock_rejects_invalid_choice_items(sample_pack, pipeline_run, invalid_fields):
    def generate(_pipeline, *, templates_override, **_kwargs):
        items = [_generated_item(template) for template in templates_override]
        items[-1]["qa_pair"].update(invalid_fields)
        return {"summary": {"results": items}}

    pipeline_run.side_effect = generate
    with pytest.raises(InvalidMockGeneration):
        await build_mock(*sample_pack)
