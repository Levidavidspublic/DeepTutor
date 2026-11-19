"""API for runtime exam packs, Guided Learning links, and teach-back."""

from __future__ import annotations

from datetime import date, datetime, timezone
from threading import Lock
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from deeptutor.exam_packs import ExamPack, GlossaryTerm, Questionnaire, Subject, load_packs
from deeptutor.exam_packs.glossary import find_terms
from deeptutor.exam_packs.links import get_or_create_mastery_link
from deeptutor.exam_packs.mock import (
    ExpiredMockAttempt,
    InvalidMockInput,
    MockResult,
    build_mock,
    load_mock_attempt,
    save_mock_attempt,
    submit_mock_attempt,
)
from deeptutor.exam_packs.models import Topic
from deeptutor.exam_packs.teachback import (
    InvalidGrade,
    TeachBackResult,
    TopicStatus,
    append_result,
    get_topic_status,
    grade_answer,
)
from deeptutor.services.llm import LLMConfigError, LLMError

router = APIRouter()

_packs: list[ExamPack] | None = None
_packs_lock = Lock()


class SubjectProgress(BaseModel):
    done: int
    total: int


class SubjectSummary(BaseModel):
    id: str
    title: str
    title_source: str
    progress: SubjectProgress
    exam_date: date | None


class PackSummary(BaseModel):
    id: str
    title: str
    exam: str
    source_lang: str
    ui_lang: str
    subjects: list[SubjectSummary]


class TopicSummary(BaseModel):
    id: str
    title: str
    title_source: str
    weight: float
    objectives: list[str]
    status: TopicStatus


class SubjectDetail(BaseModel):
    id: str
    title: str
    source_lang: str
    ui_lang: str
    questionnaires: list[Questionnaire]
    topics: list[TopicSummary]


class StartMockRequest(BaseModel):
    subject_id: str
    questionnaire_code: str


class SubmitMockRequest(BaseModel):
    answers: dict[str, str]


class MockQuestionResponse(BaseModel):
    id: str
    topic_id: str
    prompt: str
    options: dict[str, str]
    points: int


class MockAttemptResponse(BaseModel):
    attempt_id: UUID
    pack_id: str
    subject_id: str
    questionnaire_code: str
    ui_lang: str
    started_at: datetime
    expires_at: datetime
    minutes: int
    questions: list[MockQuestionResponse]
    result: MockResult | None


def _get_packs(*, reload: bool = False) -> list[ExamPack]:
    global _packs
    with _packs_lock:
        if _packs is None or reload:
            _packs = load_packs()
        return _packs


def _get_pack(pack_id: str) -> ExamPack:
    for pack in _get_packs():
        if pack.id == pack_id:
            return pack
    raise HTTPException(status_code=404, detail="Exam pack not found")


def _get_subject(exam_pack: ExamPack, subject_id: str) -> Subject:
    for subject in exam_pack.subjects:
        if subject.id == subject_id:
            return subject
    raise HTTPException(status_code=404, detail="Exam subject not found")


def _get_topic(exam_pack: ExamPack, subject_id: str, topic_id: str) -> Topic:
    subject = _get_subject(exam_pack, subject_id)
    for topic in exam_pack.topics:
        if topic.id == topic_id and topic.subject_id == subject.id:
            return topic
    raise HTTPException(status_code=404, detail="Exam topic not found")


def _summarize_pack(pack: ExamPack, today: date) -> PackSummary:
    topics_by_subject: dict[str, dict[str, Topic]] = {}
    for topic in pack.topics:
        subject_topics = topics_by_subject.setdefault(topic.subject_id, {})
        subject_topics.setdefault(topic.id, topic)

    subjects = []
    for subject in pack.subjects:
        topics = topics_by_subject.get(subject.id, {})
        subjects.append(
            SubjectSummary(
                id=subject.id,
                title=subject.title,
                title_source=subject.title_source,
                progress=SubjectProgress(
                    done=sum(get_topic_status(pack.id, topic) == "done" for topic in topics.values()),
                    total=len(topics),
                ),
                exam_date=min(
                    (exam_date for exam_date in subject.exam_dates or [] if exam_date >= today),
                    default=None,
                ),
            )
        )
    return PackSummary(
        id=pack.id,
        title=pack.title,
        exam=pack.exam,
        source_lang=pack.source_lang,
        ui_lang=pack.ui_lang,
        subjects=subjects,
    )


@router.get("", response_model=list[PackSummary])
def list_exam_packs() -> list[PackSummary]:
    today = datetime.now(timezone.utc).date()
    return [_summarize_pack(pack, today) for pack in _get_packs()]


@router.get("/{pack}/subjects/{subject}", response_model=SubjectDetail)
def get_exam_subject(pack: str, subject: str) -> SubjectDetail:
    exam_pack = _get_pack(pack)
    exam_subject = _get_subject(exam_pack, subject)
    return SubjectDetail(
        id=exam_subject.id,
        title=exam_subject.title,
        source_lang=exam_pack.source_lang,
        ui_lang=exam_pack.ui_lang,
        questionnaires=exam_subject.questionnaires,
        topics=[
            TopicSummary(
                id=topic.id,
                title=topic.title,
                title_source=topic.title_source,
                weight=topic.weight,
                objectives=topic.objectives,
                status=get_topic_status(exam_pack.id, topic),
            )
            for topic in exam_pack.topics
            if topic.subject_id == subject
        ],
    )


@router.post("/{pack}/subjects/{subject}/topics/{topic}/mastery-link")
def create_mastery_link(pack: str, subject: str, topic: str) -> dict[str, str]:
    exam_pack = _get_pack(pack)
    exam_topic = _get_topic(exam_pack, subject, topic)
    return {"path_id": get_or_create_mastery_link(exam_pack, exam_topic)}


@router.post(
    "/{pack}/subjects/{subject}/topics/{topic}/teach-back",
    response_model=TeachBackResult,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "learner_text": {
                                "type": "string",
                                "description": "Answer with 1–4000 characters after trimming.",
                            }
                        },
                        "required": ["learner_text"],
                    }
                }
            },
        }
    },
)
async def submit_teach_back(pack: str, subject: str, topic: str, request: Request) -> TeachBackResult:
    exam_pack = _get_pack(pack)
    exam_topic = _get_topic(exam_pack, subject, topic)
    # FastAPI's automatic body validation can echo rejected input in its error response.
    try:
        body = await request.json()
    except ValueError:
        raise HTTPException(status_code=422, detail="Expected a JSON object") from None
    answer = body.get("learner_text") if isinstance(body, dict) else None
    learner_text = answer.strip() if isinstance(answer, str) else ""
    if not 1 <= len(learner_text) <= 4000:
        raise HTTPException(status_code=422, detail="learner_text must contain 1–4000 characters")

    try:
        result = await grade_answer(exam_pack, exam_topic, learner_text)
    except LLMConfigError:
        raise HTTPException(status_code=503, detail="Tutor model is not configured") from None
    except (InvalidGrade, LLMError):
        raise HTTPException(
            status_code=502, detail="Tutor model could not grade the answer"
        ) from None

    await run_in_threadpool(append_result, exam_pack.id, exam_topic, result)
    return result


@router.get("/{pack}/glossary", response_model=list[GlossaryTerm])
def get_exam_glossary(pack: str, q: str | None = None) -> list[GlossaryTerm]:
    exam_pack = _get_pack(pack)
    return exam_pack.glossary if q is None else find_terms(exam_pack, q)


@router.post("/{pack}/mock", response_model=MockAttemptResponse)
async def start_mock(pack: str, request: StartMockRequest) -> MockAttemptResponse:
    exam_pack = _get_pack(pack)
    subject = _get_subject(exam_pack, request.subject_id)
    questionnaire = next(
        (item for item in subject.questionnaires if item.code == request.questionnaire_code), None
    )
    if questionnaire is None:
        raise HTTPException(status_code=404, detail="Exam questionnaire not found")

    try:
        paper = await build_mock(exam_pack, subject, questionnaire)
    except InvalidMockInput as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    except LLMConfigError:
        raise HTTPException(status_code=503, detail="Tutor model is not configured") from None
    except Exception:
        # The generation pipeline can raise provider exceptions as well as LLMError.
        raise HTTPException(status_code=502, detail="Tutor model could not generate a mock") from None

    try:
        attempt = await run_in_threadpool(save_mock_attempt, paper, exam_pack.ui_lang)
    except InvalidMockInput as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    return MockAttemptResponse.model_validate(attempt, from_attributes=True)


@router.get("/mock/{attempt_id}", response_model=MockAttemptResponse)
def get_mock_attempt(attempt_id: UUID) -> MockAttemptResponse:
    attempt = load_mock_attempt(attempt_id)
    if attempt is None:
        raise HTTPException(status_code=404, detail="Mock attempt not found")
    return MockAttemptResponse.model_validate(attempt, from_attributes=True)


@router.post("/mock/{attempt_id}/submit", response_model=MockResult)
def submit_mock(attempt_id: UUID, request: SubmitMockRequest) -> MockResult:
    try:
        result = submit_mock_attempt(attempt_id, request.answers)
    except InvalidMockInput as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    except ExpiredMockAttempt as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    if result is None:
        raise HTTPException(status_code=404, detail="Mock attempt not found")
    return result


@router.post("/reload")
def reload_exam_packs() -> dict[str, int]:
    return {"count": len(_get_packs(reload=True))}
