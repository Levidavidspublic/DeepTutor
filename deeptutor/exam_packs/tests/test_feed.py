"""Contracts for parsing pasted class feeds into calendar event inputs."""

from dataclasses import FrozenInstanceError, is_dataclass
import json
from uuid import NAMESPACE_URL, uuid5

import pytest

from deeptutor.services.calendar.models import EventInput

pytestmark = pytest.mark.skip(reason="KITCHEN-PENDING #185: feature not built yet")


def _calendar(*components: str) -> str:
    return "\r\n".join(("BEGIN:VCALENDAR", "VERSION:2.0", *components, "END:VCALENDAR", ""))


def _event(*properties: str) -> str:
    return "\r\n".join(("BEGIN:VEVENT", *properties, "END:VEVENT"))


@pytest.mark.parametrize(
    ("times", "start", "end", "all_day"),
    [
        pytest.param(
            ("DTSTART:20270708T093000Z", "DTEND:20270708T104500Z"),
            "2027-07-08T09:30:00Z",
            "2027-07-08T10:45:00Z",
            False,
            id="utc",
        ),
        pytest.param(
            ("DTSTART;TZID=Europe/Berlin:20270708T093000", "DTEND;TZID=Europe/Berlin:20270708T104500"),
            "2027-07-08T07:30:00Z",
            "2027-07-08T08:45:00Z",
            False,
            id="explicit-zone-during-dst",
        ),
        pytest.param(
            ("DTSTART:20270708T003000",),
            "2027-07-07T19:00:00Z",
            "2027-07-07T20:00:00Z",
            False,
            id="floating-with-default-hour",
        ),
        pytest.param(
            ("DTSTART:20270708T093000Z", "DURATION:PT1H15M30S"),
            "2027-07-08T09:30:00Z",
            "2027-07-08T10:45:30Z",
            False,
            id="timed-duration",
        ),
        pytest.param(
            ("DTSTART;VALUE=DATE:20270708", "DTEND;VALUE=DATE:20270711"),
            "2027-07-08",
            "2027-07-11",
            True,
            id="exclusive-date-end",
        ),
        pytest.param(
            ("DTSTART;VALUE=DATE:20270708", "DURATION:P2D"),
            "2027-07-08",
            "2027-07-10",
            True,
            id="all-day-duration",
        ),
        pytest.param(
            ("DTSTART;VALUE=DATE:20270731",),
            "2027-07-31",
            "2027-08-01",
            True,
            id="all-day-with-default-day",
        ),
    ],
)
def test_parses_calendar_times_and_opt_in_reminders(times, start, end, all_day):
    from deeptutor.exam_packs.feed import FeedEvent, parse_feed

    text = _calendar(_event("SUMMARY:Sample class", *times))
    [entry] = parse_feed(text, tzid="Asia/Kolkata", remind=True)

    assert isinstance(entry, FeedEvent)
    assert isinstance(entry.event, EventInput)
    assert entry.event.title == "Sample class"
    assert entry.event.notes == "exam-feed"
    assert (entry.event.start, entry.event.end, entry.event.all_day) == (start, end, all_day)
    assert entry.event.reminders == ([] if all_day else [10])
    [default_entry] = parse_feed(text, tzid="Asia/Kolkata")
    assert default_entry.event.reminders == []


@pytest.mark.parametrize("newline", ["\r\n", "\n"], ids=["crlf", "lf"])
def test_unfolds_space_and_tab_continuations_and_unescapes_summary(newline):
    from deeptutor.exam_packs.feed import parse_feed

    text = _calendar(
        _event(
            "DTSTART:20270708T093000Z",
            r"SUMMARY:  Maths: vectors\, mat",
            r" rices\; practice\nBring a ",
            "\tnotebook  ",
            "DESCRIPTION:Unrelated event description",
        )
    ).replace("\r\n", newline)

    [entry] = parse_feed(text, tzid="UTC")

    assert entry.event.title == "Maths: vectors, matrices; practice\nBring a notebook"
    assert entry.event.notes == "exam-feed"


@pytest.mark.parametrize(
    ("summary_lines", "title"),
    [
        pytest.param((), "Class", id="missing"),
        pytest.param(("SUMMARY:",), "Class", id="empty"),
        pytest.param(("SUMMARY:   ",), "Class", id="whitespace"),
        pytest.param(("SUMMARY:  " + "é" * 201,), "é" * 200, id="trimmed-to-200-characters"),
    ],
)
def test_defaults_or_trims_titles(summary_lines, title):
    from deeptutor.exam_packs.feed import parse_feed

    [entry] = parse_feed(_calendar(_event("DTSTART:20270708T093000Z", *summary_lines)), tzid="UTC")

    assert entry.event.title == title


def test_returns_frozen_feed_events_with_stable_ids_sorted_by_normalized_start():
    from deeptutor.exam_packs.feed import parse_feed

    later = _event("UID:sample-maths", "SUMMARY:Maths", "DTSTART:20270708T090000Z")
    earlier = _event(
        "UID:sample-maths", "SUMMARY:Early Maths", "DTSTART;TZID=Europe/Berlin:20270708T100000"
    )
    no_uid = _event("SUMMARY:Physics", "DTSTART:20270708T083000Z")

    original = parse_feed(_calendar(later, no_uid, earlier), tzid="UTC")
    replay = parse_feed(
        _calendar(earlier, later.replace("SUMMARY:Maths", "SUMMARY:Algebra"), no_uid),
        tzid="UTC",
        remind=True,
    )

    expected = [
        ("sample-maths", "2027-07-08T08:00:00Z"),
        ("Physics", "2027-07-08T08:30:00Z"),
        ("sample-maths", "2027-07-08T09:00:00Z"),
    ]
    assert [entry.event.start for entry in original] == [start for _, start in expected]
    expected_ids = [
        uuid5(NAMESPACE_URL, json.dumps(["exam-feed", identity, start])).hex
        for identity, start in expected
    ]
    assert [entry.event_id for entry in original] == expected_ids
    assert [entry.event_id for entry in replay] == expected_ids
    assert is_dataclass(original[0])
    with pytest.raises(FrozenInstanceError):
        original[0].event_id = "replacement"


@pytest.mark.parametrize(
    "properties",
    [
        pytest.param((), id="missing-dtstart"),
        pytest.param(("DTSTART:20270708T103000Z", "RRULE:FREQ=WEEKLY;COUNT=3"), id="recurring"),
        pytest.param(("DTSTART:invalid",), id="malformed-dtstart"),
        pytest.param(("DTSTART;TZID=Invalid/StudyZone:20270708T103000",), id="unknown-zone"),
        pytest.param(("DTSTART:20270708T103000Z", "DTEND:20270708T103000Z"), id="zero-length"),
        pytest.param(("DTSTART;VALUE=DATE:20270708", "DTEND;VALUE=DATE:20270707"), id="reversed-dates"),
    ],
)
def test_skips_unusable_events_between_valid_events(properties):
    from deeptutor.exam_packs.feed import parse_feed

    text = _calendar(
        _event("SUMMARY:Before", "DTSTART:20270708T083000Z"),
        _event("SUMMARY:Skip this one", *properties),
        _event("SUMMARY:After", "DTSTART:20270708T123000Z"),
    )

    assert [entry.event.title for entry in parse_feed(text, tzid="UTC")] == ["Before", "After"]


def test_empty_calendar_has_no_events():
    from deeptutor.exam_packs.feed import parse_feed

    assert parse_feed(_calendar(), tzid="UTC") == []


def test_rejects_text_with_no_calendar_header():
    from deeptutor.exam_packs.feed import InvalidFeed, parse_feed

    assert issubclass(InvalidFeed, ValueError)
    with pytest.raises(InvalidFeed):
        parse_feed(_event("DTSTART:20270708T093000Z"), tzid="UTC")


def test_rejects_only_above_the_character_limit():
    from deeptutor.exam_packs.feed import InvalidFeed, parse_feed

    event = _event("DTSTART:20270708T093000Z")
    padding_size = 1_000_000 - len(_calendar("X-PADDING:", event))
    padding = "é" * padding_size

    assert len(parse_feed(_calendar("X-PADDING:" + padding, event), tzid="UTC")) == 1
    with pytest.raises(InvalidFeed):
        parse_feed(_calendar("X-PADDING:" + padding + "é", event), tzid="UTC")


def test_event_limit_counts_only_kept_events_and_rejects_the_501st():
    from deeptutor.exam_packs.feed import InvalidFeed, parse_feed

    kept = [_event(f"UID:sample-class-{index}", "DTSTART:20270708T093000Z") for index in range(500)]
    ignored = _event("SUMMARY:Missing a start")
    extra = _event("UID:sample-extra-class", "DTSTART:20270708T103000Z")

    assert len(parse_feed(_calendar(ignored, *kept, ignored), tzid="UTC")) == 500
    with pytest.raises(InvalidFeed):
        parse_feed(_calendar(ignored, *kept, extra), tzid="UTC")
