"""Records for exam pack metadata and study content."""

from __future__ import annotations

from dataclasses import dataclass, field
<<<<<<< HEAD
from datetime import date, datetime
=======
from datetime import date
>>>>>>> origin/main
from pathlib import Path


@dataclass
class ExamPack:
    id: str
    title: str
    exam: str
    source_lang: str
    ui_lang: str
    subjects: list[Subject]
    path: Path
    topics: list[Topic] = field(default_factory=list)
    glossary: list[GlossaryTerm] = field(default_factory=list)


@dataclass
class Subject:
    id: str
    title: str
    title_source: str
    questionnaires: list[Questionnaire]
    exam_dates: list[date] | None = None


@dataclass
class Questionnaire:
    code: str
    title: str
    minutes: int
    topic_weights: dict[str, float]


@dataclass
class Topic:
    id: str
    subject_id: str
    title: str
    title_source: str
    objectives: list[str]
    weight: float
    questionnaire: str
    body_md: str


@dataclass
class GlossaryTerm:
    term_source: str
    term_ui: str
    note: str
    topic_ids: list[str]
<<<<<<< HEAD


@dataclass
class MockQuestion:
    """Internal question record with its scoring information."""

    id: str
    topic_id: str
    prompt: str
    options: dict[str, str]
    correct_option: str = field(repr=False)
    rationale: str = field(repr=False)
    points: int


@dataclass
class MockPaper:
    """Internal timed paper with the questions in presentation order."""

    attempt_id: str
    pack_id: str
    subject_id: str
    questionnaire: str
    questions: list[MockQuestion]
    started_at: datetime
    minutes: int
=======
>>>>>>> origin/main
