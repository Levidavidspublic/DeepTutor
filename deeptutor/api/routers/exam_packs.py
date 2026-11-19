"""Read-only API for runtime exam packs."""

from __future__ import annotations

from threading import Lock

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from deeptutor.exam_packs import ExamPack, GlossaryTerm, Questionnaire, load_packs
from deeptutor.exam_packs.glossary import find_terms

router = APIRouter()

_packs: list[ExamPack] | None = None
_packs_lock = Lock()


class SubjectSummary(BaseModel):
    id: str
    title: str
    title_source: str


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


class SubjectDetail(BaseModel):
    id: str
    title: str
    questionnaires: list[Questionnaire]
    topics: list[TopicSummary]


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


@router.get("", response_model=list[PackSummary])
def list_exam_packs() -> list[ExamPack]:
    return _get_packs()


@router.get("/{pack}/subjects/{subject}", response_model=SubjectDetail)
def get_exam_subject(pack: str, subject: str) -> dict:
    exam_pack = _get_pack(pack)
    for exam_subject in exam_pack.subjects:
        if exam_subject.id == subject:
            return {
                "id": exam_subject.id,
                "title": exam_subject.title,
                "questionnaires": exam_subject.questionnaires,
                "topics": [topic for topic in exam_pack.topics if topic.subject_id == subject],
            }
    raise HTTPException(status_code=404, detail="Exam subject not found")


@router.get("/{pack}/glossary", response_model=list[GlossaryTerm])
def get_exam_glossary(pack: str, q: str | None = None) -> list[GlossaryTerm]:
    exam_pack = _get_pack(pack)
    return exam_pack.glossary if q is None else find_terms(exam_pack, q)


@router.post("/reload")
def reload_exam_packs() -> dict[str, int]:
    return {"count": len(_get_packs(reload=True))}
