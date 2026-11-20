"""Preview study sessions for a subject as account Calendar events."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
import json
from uuid import NAMESPACE_URL, uuid5

from deeptutor.services.calendar.models import EventInput
from deeptutor.services.calendar.recurrence import zone

from .models import ExamPack, Subject


@dataclass(frozen=True)
class StudySession:
    topic_id: str
    event_id: str
    event: EventInput


@dataclass(frozen=True)
class StudyPlan:
    exam_date: date
    sessions: list[StudySession]
    unscheduled_topic_ids: list[str]


def plan_sessions(
    pack: ExamPack,
    subject: Subject,
    start: date,
    exam_date: date | None = None,
    *,
    tzid: str,
    remind: bool = False,
) -> StudyPlan:
    """Build a preview without opening the Calendar store or changing the pack."""
    local_zone = zone(tzid)
    if exam_date is None:
        exam_date = min((day for day in subject.exam_dates or [] if day > start), default=None)
        if exam_date is None:
            raise ValueError("The subject has no exam date after the start date.")

    days = (exam_date - start).days
    if not 1 <= days <= 400:
        raise ValueError("The exam date must be 1 to 400 days after the start date.")

    available_starts = []
    for offset in range(days):
        local_start = datetime.combine(start + timedelta(days=offset), time(18), local_zone)
        instant = local_start.astimezone(timezone.utc)
        # A time-zone change can skip a local time or even an entire day.
        if instant.astimezone(local_zone) == local_start:
            available_starts.append(instant)

    topics = sorted(
        (topic for topic in pack.topics if topic.subject_id == subject.id),
        key=lambda topic: (-topic.weight, topic.id),
    )
    count = min(len(topics), len(available_starts))
    sessions = []
    for index, topic in enumerate(topics[:count]):
        # Space sessions across the full window, starting on the first day.
        slot = index * (len(available_starts) - 1) // max(1, count - 1)
        instant = available_starts[slot]
        event = EventInput(
            title=topic.title.strip()[:200],
            notes=f"exam-pack:{pack.id}:{subject.id}",
            start=instant.isoformat(),
            end=(instant + timedelta(minutes=30)).isoformat(),
            tzid=tzid,
            reminders=[10] if remind else [],
        )
        identity = json.dumps(["exam-pack", pack.id, subject.id, topic.id, event.start])
        sessions.append(StudySession(topic.id, uuid5(NAMESPACE_URL, identity).hex, event))

    return StudyPlan(exam_date, sessions, [topic.id for topic in topics[count:]])
