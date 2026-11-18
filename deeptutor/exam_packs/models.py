"""Records for exam pack metadata and study content."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
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
