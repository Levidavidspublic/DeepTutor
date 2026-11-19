"""Parse pasted iCalendar class feeds into account Calendar event inputs."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
import json
import re
from uuid import NAMESPACE_URL, uuid5

from deeptutor.services.calendar.models import EventInput
from deeptutor.services.calendar.recurrence import zone

_MAX_CHARACTERS = 1_000_000
_MAX_EVENTS = 500
_TITLE_LIMIT = 200  # EventInput.title

_PARAMETER_VALUE = r'(?:"[^"]*"|[^";:])*'
_PARAMETER = re.compile(rf";([A-Z0-9-]+)=({_PARAMETER_VALUE})", re.IGNORECASE)
_PROPERTY = re.compile(
    rf"(UID|SUMMARY|DTSTART|DTEND|DURATION|RRULE|STATUS)((?:;[A-Z0-9-]+={_PARAMETER_VALUE})*):",
    re.IGNORECASE,
)
_DURATION = re.compile(
    r"\+?P(?:(?P<weeks>[0-9]+)W|(?:(?P<days>[0-9]+)D)?"
    r"(?:T(?=[0-9])(?:(?P<hours>[0-9]+)H)?(?:(?P<minutes>[0-9]+)M)?"
    r"(?:(?P<seconds>[0-9]+)S)?)?)"
)
_TEXT_ESCAPES = {"n": "\n", "N": "\n", ",": ",", ";": ";", "\\": "\\"}
_Property = tuple[dict[str, str], str]


@dataclass(frozen=True)
class FeedEvent:
    event_id: str
    event: EventInput


class InvalidFeed(ValueError):
    """The pasted text is missing a calendar header or exceeds a feed limit."""


def _event_properties(text: str) -> Iterator[dict[str, _Property]]:
    components: list[str] = []
    properties: dict[str, _Property] = {}
    found_calendar = False
    unfolded = re.sub(r"\r?\n[ \t]", "", text.removeprefix("\ufeff"))
    for line in unfolded.split("\n"):
        line = line.removesuffix("\r")
        name, _, value = line.partition(":")
        name = name.upper()
        in_event = components == ["VCALENDAR", "VEVENT"]
        if name == "BEGIN":
            component = value.upper()
            if component == "VCALENDAR":
                found_calendar = True
                components = [component]
            elif components:
                components.append(component)
                if components == ["VCALENDAR", "VEVENT"]:
                    properties = {}
        elif name == "END" and components and value.upper() == components[-1]:
            if in_event:
                yield properties
            components.pop()
        elif in_event and (match := _PROPERTY.match(line)):
            params = {key.upper(): raw.strip('"') for key, raw in _PARAMETER.findall(match[2])}
            properties[match[1].upper()] = (params, line[match.end() :])

    if not found_calendar:
        raise InvalidFeed("The feed must contain BEGIN:VCALENDAR.")


def _event_time(prop: _Property, tzid: str) -> tuple[date | datetime, str]:
    params, value = prop
    value_type = params.get("VALUE", "DATE-TIME").upper()
    if value_type == "DATE" and re.fullmatch(r"[0-9]{8}", value):
        return date.fromisoformat(value), tzid
    if value_type != "DATE-TIME" or not re.fullmatch(r"[0-9]{8}T[0-9]{6}Z?", value):
        raise ValueError("Invalid calendar date or date-time.")

    moment = datetime.fromisoformat(value)
    if moment.tzinfo is not None:
        return moment, "UTC"
    local_tzid = params.get("TZID", tzid)
    return moment.replace(tzinfo=zone(local_tzid)), local_tzid


def _duration_end(start: date | datetime, value: str) -> date | datetime:
    match = _DURATION.fullmatch(value)
    if match is None:
        raise ValueError("Invalid calendar duration.")
    units = {key: int(raw) for key, raw in match.groupdict().items() if raw is not None}
    days = timedelta(weeks=units.get("weeks", 0), days=units.get("days", 0))
    if isinstance(start, datetime):
        # Days and weeks follow local dates. Hours, minutes and seconds are elapsed time.
        return (start + days).astimezone(timezone.utc) + timedelta(
            hours=units.get("hours", 0),
            minutes=units.get("minutes", 0),
            seconds=units.get("seconds", 0),
        )
    if "T" in value:
        raise ValueError("An all-day duration must use days or weeks.")
    return start + days


def _text_value(properties: dict[str, _Property], name: str) -> str:
    _, value = properties.get(name, ({}, ""))
    return re.sub(r"\\([nN,;\\])", lambda match: _TEXT_ESCAPES[match[1]], value)


def _build_event(properties: dict[str, _Property], tzid: str, remind: bool) -> FeedEvent:
    start, start_tzid = _event_time(properties["DTSTART"], tzid)
    all_day = not isinstance(start, datetime)
    if "DTEND" in properties:
        end, _ = _event_time(properties["DTEND"], tzid)
    elif "DURATION" in properties:
        end = _duration_end(start, properties["DURATION"][1])
    elif isinstance(start, datetime):
        end = start.astimezone(timezone.utc) + timedelta(hours=1)
    else:
        end = start + timedelta(days=1)

    summary = _text_value(properties, "SUMMARY")
    event = EventInput(
        title=summary.strip()[:_TITLE_LIMIT] or "Class",
        notes="exam-feed",
        all_day=all_day,
        start=start.isoformat(),
        end=end.isoformat(),
        tzid=start_tzid,
        reminders=[10] if remind and not all_day else [],
    )
    identity = json.dumps(["exam-feed", _text_value(properties, "UID") or summary, event.start])
    return FeedEvent(uuid5(NAMESPACE_URL, identity).hex, event)


def parse_feed(text: str, *, tzid: str, remind: bool = False) -> list[FeedEvent]:
    """Validate standalone events and return them in normalized start order."""
    if len(text) > _MAX_CHARACTERS:
        raise InvalidFeed(f"The feed can contain at most {_MAX_CHARACTERS:,} characters.")

    events: list[FeedEvent] = []
    for properties in _event_properties(text):
        if "DTSTART" not in properties or "RRULE" in properties:
            continue
        _, status = properties.get("STATUS", ({}, ""))
        if status.upper() == "CANCELLED":
            continue
        try:
            event = _build_event(properties, tzid, remind)
        except (ValueError, OverflowError):
            continue
        if len(events) == _MAX_EVENTS:
            raise InvalidFeed(f"The feed can contain at most {_MAX_EVENTS} usable events.")
        events.append(event)
    return sorted(events, key=lambda entry: entry.event.start)
