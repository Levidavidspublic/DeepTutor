"""Build and store timed practice papers from questionnaire weights."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from fractions import Fraction
from math import isfinite
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel

from deeptutor.agents.question.pipeline import QuestionPipeline, QuestionType, QuizTemplate
from deeptutor.core.context import UnifiedContext
from deeptutor.runtime.stream_bus import StreamBus
from deeptutor.services.file_io import atomic_write_json, read_text
from deeptutor.services.path_service import get_path_service

from .models import ExamPack, MockPaper, MockQuestion, Questionnaire, Subject

_OPTION_KEYS = ("A", "B", "C", "D")
_PAPER_POINTS = 100
_MAX_TOPICS = 5


class InvalidMockInput(ValueError):
    """The questionnaire cannot be used to build a mock paper."""


class InvalidMockGeneration(ValueError):
    """The question pipeline did not produce a complete, scoreable paper."""


class MockAttempt(BaseModel):
    """Workspace record containing the timed paper and its scoring information."""

    attempt_id: UUID
    pack_id: str
    subject_id: str
    questionnaire_code: str
    ui_lang: str
    started_at: datetime
    expires_at: datetime
    minutes: int
    questions: list[MockQuestion]
    result: dict[str, Any] | None = None


def _attempt_path(attempt_id: UUID) -> Path:
    return get_path_service().user_data_dir / "exam_packs_state" / "attempts" / f"{attempt_id}.json"


def _attempt_expiry(started_at: datetime, minutes: int) -> datetime:
    try:
        return started_at + timedelta(minutes=minutes)
    except OverflowError:
        raise InvalidMockInput("The questionnaire duration is too large.") from None


def save_mock_attempt(paper: MockPaper, ui_lang: str) -> MockAttempt:
    attempt = MockAttempt(
        attempt_id=UUID(paper.attempt_id),
        pack_id=paper.pack_id,
        subject_id=paper.subject_id,
        questionnaire_code=paper.questionnaire,
        ui_lang=ui_lang,
        started_at=paper.started_at,
        expires_at=_attempt_expiry(paper.started_at, paper.minutes),
        minutes=paper.minutes,
        questions=paper.questions,
    )
    atomic_write_json(_attempt_path(attempt.attempt_id), attempt.model_dump(mode="json"))
    return attempt


def load_mock_attempt(attempt_id: UUID) -> MockAttempt | None:
    try:
        raw = read_text(_attempt_path(attempt_id))
    except FileNotFoundError:
        return None
    return MockAttempt.model_validate_json(raw)


class _MockQuestionPipeline(QuestionPipeline):
    def _resolved_tools(self, context: UnifiedContext) -> list[str]:
        # The quiz pipeline normally auto-mounts tools that can write user state.
        return []


async def build_mock(pack: ExamPack, subject: Subject, questionnaire: Questionnaire) -> MockPaper:
    """Generate one question per selected topic and return the paper in memory."""
    minutes = questionnaire.minutes
    if isinstance(minutes, bool) or not isinstance(minutes, int) or minutes <= 0:
        raise InvalidMockInput("The questionnaire duration must be a positive integer.")
    _attempt_expiry(datetime.now(timezone.utc), minutes)

    subject_topics = {topic.id: topic for topic in pack.topics if topic.subject_id == subject.id}
    eligible = [
        (topic_id, weight)
        for topic_id, weight in questionnaire.topic_weights.items()
        if topic_id in subject_topics and weight > 0 and isfinite(weight)
    ]
    eligible.sort(key=lambda entry: (-entry[1], entry[0]))
    weights = dict(eligible[:_MAX_TOPICS])
    if not weights:
        raise InvalidMockInput(
            "The questionnaire has no positively weighted topics in this subject."
        )

    templates = []
    topic_ids = {}
    for topic_id in weights:
        topic = subject_topics[topic_id]
        question_id = f"q-{topic_id}"
        coverage = "\n".join([topic.title, *(f"- {objective}" for objective in topic.objectives)])
        topic_ids[question_id] = topic_id
        templates.append(
            QuizTemplate(
                question_id=question_id,
                topic=coverage,
                question_type=QuestionType.CHOICE.value,
                difficulty="medium",
            )
        )

    request = "Generate original single-choice practice questions for this questionnaire."
    payload = await _MockQuestionPipeline(language=pack.ui_lang).run(
        context=UnifiedContext(user_message=request, language=pack.ui_lang),
        user_message=request,
        num_questions=len(templates),
        templates_override=templates,
        stream=StreamBus(max_history=0),
    )
    questions = _read_questions(payload, topic_ids, _allocate_points(weights))
    return MockPaper(
        attempt_id=uuid4().hex,
        pack_id=pack.id,
        subject_id=subject.id,
        questionnaire=questionnaire.code,
        questions=questions,
        started_at=datetime.now(timezone.utc),
        minutes=minutes,
    )


def _allocate_points(weights: dict[str, float]) -> dict[str, int]:
    # Preserve decimal weight ties and keep quota arithmetic exact.
    exact = {topic_id: Fraction(str(weight)) for topic_id, weight in weights.items()}
    available = _PAPER_POINTS - len(exact)
    total = sum(exact.values())
    points = {}
    remainders = {}
    unassigned = available
    for topic_id, weight in exact.items():
        whole, remainder = divmod(available * weight, total)
        points[topic_id] = 1 + whole
        remainders[topic_id] = remainder
        unassigned -= whole
    ranked = sorted(exact, key=lambda topic_id: (-remainders[topic_id], topic_id))
    for topic_id in ranked[:unassigned]:
        points[topic_id] += 1
    return points


def _read_questions(
    payload: dict[str, Any], topic_ids: dict[str, str], points: dict[str, int]
) -> list[MockQuestion]:
    summary = payload.get("summary") if isinstance(payload, dict) else None
    results = summary.get("results") if isinstance(summary, dict) else None
    if not isinstance(results, list) or len(results) != len(topic_ids):
        raise InvalidMockGeneration("The pipeline must return one question per selected topic.")

    questions: dict[str, MockQuestion] = {}
    for result in results:
        pair = result.get("qa_pair") if isinstance(result, dict) else None
        if not isinstance(pair, dict):
            raise InvalidMockGeneration("The pipeline returned a malformed question.")

        question_id = pair.get("question_id")
        if (
            not isinstance(question_id, str)
            or question_id not in topic_ids
            or question_id in questions
        ):
            raise InvalidMockGeneration(
                "The pipeline returned an unexpected or duplicate question ID."
            )

        metadata = result.get("metadata", {})
        prompt = pair.get("question")
        options = pair.get("options")
        correct = pair.get("correct_answer")
        rationale = pair.get("explanation")
        if (
            not isinstance(metadata, dict)
            or metadata.get("issues")
            or pair.get("question_type") != QuestionType.CHOICE.value
            or not isinstance(prompt, str)
            or not prompt.strip()
            or not isinstance(rationale, str)
            or not rationale.strip()
            or not isinstance(options, dict)
            or options.keys() != set(_OPTION_KEYS)
            or any(not isinstance(value, str) or not value.strip() for value in options.values())
            or not isinstance(correct, str)
            or correct not in _OPTION_KEYS
        ):
            raise InvalidMockGeneration(
                "Every question needs four A–D options, an answer and an explanation."
            )

        clean_options = {key: options[key].strip() for key in _OPTION_KEYS}
        if len(set(clean_options.values())) != len(_OPTION_KEYS):
            raise InvalidMockGeneration("Each question's options must be distinct.")
        topic_id = topic_ids[question_id]
        questions[question_id] = MockQuestion(
            id=question_id,
            topic_id=topic_id,
            prompt=prompt.strip(),
            options=clean_options,
            correct_option=correct,
            rationale=rationale.strip(),
            points=points[topic_id],
        )

    return [questions[question_id] for question_id in topic_ids]
