"""Contracts for previewing exam sessions and saving them in the account calendar."""

from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from dataclasses import replace
from datetime import date, timedelta
from pathlib import Path
import sqlite3
from threading import Barrier
from zoneinfo import ZoneInfo

import pytest

from deeptutor.services.calendar.models import CreateCalendar, EventInput
from deeptutor.services.calendar.recurrence import parse_instant
from deeptutor.services.calendar.store import CalendarStore, get_calendar_store

pytestmark = pytest.mark.skip(reason="KITCHEN-PENDING #62: feature not built yet")

START = date(2027, 3, 27)


@pytest.fixture
def pack(tmp_path: Path):
    from deeptutor.exam_packs.models import ExamPack, Subject, Topic

    maths = Subject(
        id="maths",
        title="Maths",
        title_source="Maths",
        questionnaires=[],
        exam_dates=[START + timedelta(days=9), START, START - timedelta(days=1), date(2027, 3, 30)],
    )
    physics = Subject(id="physics", title="Physics", title_source="Physics", questionnaires=[])
    return ExamPack(
        id="sample-pack",
        title="Sample Pack",
        exam="Sample Exam",
        source_lang="en",
        ui_lang="en",
        subjects=[maths, physics],
        path=tmp_path / "sample-pack",
        topics=[
            Topic(topic_id, subject_id, topic_id.title(), topic_id.title(), [], weight, "001", "")
            for topic_id, subject_id, weight in [
                ("vectors", "maths", 0.5),
                ("sets", "maths", 0.1),
                ("motion", "physics", 1.0),
                ("geometry", "maths", 0.9),
                ("ratios", "maths", 0.5),
            ]
        ],
    )


@pytest.fixture
def store(tmp_path: Path) -> CalendarStore:
    return CalendarStore(tmp_path / "calendar.sqlite")


def test_preview_uses_earliest_later_exam_and_prioritizes_topics(pack):
    from deeptutor.exam_packs.plan import plan_sessions

    original = deepcopy(pack)
    preview = plan_sessions(pack, pack.subjects[0], START, tzid="UTC")

    assert [session.topic_id for session in preview.sessions] == ["geometry", "ratios", "vectors"]
    assert list(preview.unscheduled_topic_ids) == ["sets"]
    assert [session.event.start for session in preview.sessions] == [
        "2027-03-27T18:00:00Z",
        "2027-03-28T18:00:00Z",
        "2027-03-29T18:00:00Z",
    ]
    assert pack == original


def test_explicit_exam_date_overrides_subject_dates(pack):
    from deeptutor.exam_packs.plan import plan_sessions

    preview = plan_sessions(pack, pack.subjects[0], START, date(2027, 3, 29), tzid="UTC")

    assert [session.topic_id for session in preview.sessions] == ["geometry", "ratios"]
    assert list(preview.unscheduled_topic_ids) == ["vectors", "sets"]


@pytest.mark.parametrize("days", [1, 400])
def test_inclusive_window_limits(pack, days):
    from deeptutor.exam_packs.plan import plan_sessions

    exam_date = START + timedelta(days=days)
    preview = plan_sessions(pack, pack.subjects[0], START, exam_date, tzid="UTC")
    dates = [parse_instant(session.event.start).date() for session in preview.sessions]

    assert len(dates) == min(days, 4)
    assert dates == sorted(set(dates))
    assert dates[0] == START
    assert dates[-1] == exam_date - timedelta(days=1)
    assert len(preview.unscheduled_topic_ids) == 4 - len(dates)


@pytest.mark.parametrize("days", [-1, 0, 401])
def test_rejects_windows_outside_the_limits(pack, days):
    from deeptutor.exam_packs.plan import plan_sessions

    with pytest.raises(ValueError):
        plan_sessions(pack, pack.subjects[0], START, START + timedelta(days=days), tzid="UTC")


@pytest.mark.parametrize("exam_dates", [None, [START - timedelta(days=1), START]])
def test_implicit_exam_requires_a_later_date(pack, exam_dates):
    from deeptutor.exam_packs.plan import plan_sessions

    subject = pack.subjects[0]
    subject.exam_dates = exam_dates

    with pytest.raises(ValueError):
        plan_sessions(pack, subject, START, tzid="UTC")


def test_rejects_invalid_iana_time_zone(pack):
    from deeptutor.exam_packs.plan import plan_sessions

    with pytest.raises(ValueError):
        plan_sessions(pack, pack.subjects[0], START, tzid="Invalid/StudyZone")


def test_session_ids_include_pack_subject_topic_and_scheduled_start(pack):
    from deeptutor.exam_packs.plan import plan_sessions

    subject = pack.subjects[0]
    exam_date = START + timedelta(days=1)
    session = plan_sessions(pack, subject, START, exam_date, tzid="UTC").sessions[0]
    replay = plan_sessions(
        replace(pack, topics=list(reversed(pack.topics))),
        subject,
        START,
        exam_date,
        tzid="UTC",
        remind=True,
    ).sessions[0]
    assert isinstance(session.event_id, str)
    assert session.event_id
    assert replay.event_id == session.event_id

    topic = next(topic for topic in pack.topics if topic.id == session.topic_id)
    renamed_subject = replace(subject, id="maths-extra")
    other_subject_pack = replace(
        pack, subjects=[renamed_subject], topics=[replace(topic, subject_id=renamed_subject.id)]
    )
    variants = [
        (replace(pack, id="sample-pack-extra"), subject, START, exam_date),
        (other_subject_pack, renamed_subject, START, exam_date),
        (replace(pack, topics=[replace(topic, id="other-topic")]), subject, START, exam_date),
        (pack, subject, START + timedelta(days=1), exam_date + timedelta(days=1)),
    ]
    for other_pack, other_subject, start, exam in variants:
        other = plan_sessions(other_pack, other_subject, start, exam, tzid="UTC").sessions[0]
        assert other.event_id != session.event_id
        assert f"exam-pack:{other_pack.id}:{other_subject.id}" in other.event.notes.splitlines()
    assert "exam-pack:sample-pack:maths" in session.event.notes.splitlines()


@pytest.mark.parametrize("remind", [False, True], ids=["default", "opt-in"])
def test_calendar_sessions_keep_local_time_and_reminders_through_dst(
    pack, tmp_path, monkeypatch, remind
):
    from deeptutor.exam_packs.plan import plan_sessions
    from deeptutor.multi_user import paths
    from deeptutor.services.path_service import PathService

    path_service = PathService(workspace_root=tmp_path / "account")
    monkeypatch.setattr(paths, "get_account_path_service", lambda: path_service)
    store = get_calendar_store()
    other = store.create_calendar(CreateCalendar(name="Other", color="#001122"))["calendar"]
    before = store.revision()
    tzid = "Europe/Berlin"
    reminder_option = {"remind": True} if remind else {}
    preview = plan_sessions(pack, pack.subjects[0], START, tzid=tzid, **reminder_option)

    assert store.export()[1] == []
    assert store.revision() == before
    for session in preview.sessions:
        assert isinstance(session.event, EventInput)
        assert session.event.tzid == tzid
        assert session.event.reminders == ([10] if remind else [])

    result = store.create_batch([(session.event_id, session.event) for session in preview.sessions])
    assert result["revision"] == before + 1
    reader = get_calendar_store()
    assert reader.export(other.id)[1] == []
    default_rows = reader.export("default")[1]
    expected_ids = [session.event_id for session in preview.sessions]
    assert [event.id for event in default_rows] == expected_ids
    assert all("exam-pack:sample-pack:maths" in event.notes.splitlines() for event in default_rows)

    occurrences = reader.occurrences(
        parse_instant("2027-03-27T00:00:00Z"), parse_instant("2027-03-30T00:00:00Z"), tzid
    )["occurrences"]
    assert [event.start for event in occurrences] == [
        "2027-03-27T17:00:00Z",
        "2027-03-28T16:00:00Z",
        "2027-03-29T16:00:00Z",
    ]
    for event in occurrences:
        start = parse_instant(event.start)
        assert not event.all_day
        assert start.astimezone(ZoneInfo(tzid)).strftime("%H:%M") == "18:00"
        assert parse_instant(event.end) - start == timedelta(minutes=30)
    assert [event.reminder_times for event in occurrences] == (
        [["2027-03-27T16:50:00Z"], ["2027-03-28T15:50:00Z"], ["2027-03-29T15:50:00Z"]]
        if remind
        else [[], [], []]
    )


def event_input(title: str) -> EventInput:
    return EventInput(title=title, start="2027-03-27T18:00:00Z", end="2027-03-27T18:30:00Z")


def test_batch_replay_returns_stored_rows_and_only_inserts_missing_ids(store):
    first = store.create_batch([("first", event_input("Original"))])
    batch = [("first", event_input("Replacement")), ("second", event_input("New"))]

    mixed = store.create_batch(batch)
    assert mixed["revision"] == first["revision"] + 1
    rows = {event.id: event for event in mixed["events"]}
    assert rows["first"] == first["events"][0]
    assert rows["first"].title == "Original"
    assert rows["second"].title == "New"

    replay = store.create_batch(batch)
    assert replay == mixed
    assert {event.id: event for event in store.export("default")[1]} == rows
    assert store.revision() == mixed["revision"]
    assert store.create_batch([]) == {"events": [], "revision": mixed["revision"]}
    assert store.revision() == mixed["revision"]


def test_batch_rolls_back_rows_and_revision_when_second_insert_fails(store):
    original = store.create(event_input("Unrelated"))["event"]
    before = store.revision()
    with store.connect(write=True) as db:
        db.execute("""
            CREATE TRIGGER reject_second_session AFTER INSERT ON events
            WHEN (SELECT COUNT(*) FROM events WHERE id IN ('first', 'second')) = 2
            BEGIN
                SELECT RAISE(ABORT, 'second session failed');
            END
        """)
    batch = [("first", event_input("First")), ("second", event_input("Second"))]

    with pytest.raises(sqlite3.IntegrityError, match="second session failed"):
        store.create_batch(batch)

    assert store.export("default")[1] == [original]
    assert store.revision() == before
    with store.connect(write=True) as db:
        db.execute("DROP TRIGGER reject_second_session")
    assert store.create_batch(batch)["revision"] == before + 1
    assert {event.id for event in store.export("default")[1]} == {original.id, "first", "second"}


def test_concurrent_batch_replays_insert_once_and_return_same_rows(store):
    writers = [CalendarStore(store.path) for _ in range(4)]
    ready = Barrier(len(writers))
    before = store.revision()

    def save(writer):
        batch = [("first", event_input("First")), ("second", event_input("Second"))]
        ready.wait(timeout=10)
        return writer.create_batch(batch)

    with ThreadPoolExecutor(max_workers=len(writers)) as executor:
        results = list(executor.map(save, writers))

    persisted = {event.id: event for event in store.export("default")[1]}
    assert set(persisted) == {"first", "second"}
    assert store.revision() == before + 1
    for result in results:
        assert result["revision"] == before + 1
        assert len(result["events"]) == len(persisted)
        assert {event.id: event for event in result["events"]} == persisted
