"""Parse and store flashcard decks for an exam subject."""

from __future__ import annotations

from collections.abc import Iterator
import csv
from html.parser import HTMLParser
from io import StringIO
from pathlib import Path
import re
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ValidationError

from deeptutor.services.file_io import atomic_write_json, read_text
from deeptutor.services.path_service import get_path_service

DeckKind = Literal["csv", "anki"]
DeckSource = Literal["csv", "anki", "topic"]
_MAX_INPUT_BYTES = 128 * 1024
_MAX_CARDS = 200
_ANKI_HEADER = re.compile(r"#([a-z][a-z ]*):(.*)", re.IGNORECASE)
_BLOCK_TAGS = {"div", "li", "p", "pre", "blockquote"}
_HIDDEN_TAGS = {"script", "style"}


class InvalidDeckInput(ValueError):
    """A deck import error safe to show without exposing its input."""


class Card(BaseModel):
    front: str
    back: str
    topic_id: str | None = None


class Deck(BaseModel):
    id: UUID
    title: str
    source: DeckSource
    cards: list[Card]


class DeckSummary(BaseModel):
    id: UUID
    title: str
    source: DeckSource
    card_count: int


class _StoredDeck(Deck):
    pack_id: str
    subject_id: str


class _CardText(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.hidden_depth = 0
        self.pending_breaks = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _HIDDEN_TAGS:
            self.hidden_depth += 1
        elif not self.hidden_depth:
            if tag == "br":
                self.parts.append("\n")
                self.pending_breaks = max(0, self.pending_breaks - 1)
            elif tag in _BLOCK_TAGS and self.parts and not self.parts[-1].endswith("\n"):
                self.pending_breaks = max(1, self.pending_breaks)

    def handle_endtag(self, tag: str) -> None:
        if tag in _HIDDEN_TAGS and self.hidden_depth:
            self.hidden_depth -= 1
        elif not self.hidden_depth and tag in _BLOCK_TAGS:
            self.pending_breaks = max(self.pending_breaks, 2 if tag == "p" else 1)

    def handle_data(self, data: str) -> None:
        if not self.hidden_depth:
            # A following <br> can supply the break at an HTML block boundary.
            if self.pending_breaks:
                self.parts.append("\n" * self.pending_breaks)
                self.pending_breaks = 0
            self.parts.append(data)


def _plain_text(field: str, row: int) -> str:
    parser = _CardText()
    try:
        parser.feed(field)
        parser.close()
    except AssertionError:
        raise InvalidDeckInput(f"Row {row} contains malformed HTML") from None
    return "".join(parser.parts).strip()


def _read_anki_headers(stream: StringIO) -> tuple[bool, int]:
    html = False
    line = 0
    while True:
        position = stream.tell()
        match = _ANKI_HEADER.fullmatch(stream.readline().rstrip("\r\n"))
        # The columns directive itself can contain tabs between column names.
        if match is None or ("\t" in match[2] and match[1].lower() != "columns"):
            stream.seek(position)
            return html, line
        line += 1
        key, value = (part.strip().lower() for part in match.groups())
        if key == "html":
            html = value == "true"
        elif key == "separator" and value != "tab":
            raise InvalidDeckInput(f"Row {line} must specify a tab separator")
        elif key == "notetype" and value != "basic":
            raise InvalidDeckInput(f"Row {line} must specify the Basic note type")


def _read_rows(stream: StringIO, delimiter: str, offset: int) -> Iterator[tuple[int, list[str]]]:
    reader = csv.reader(stream, delimiter=delimiter, strict=True)
    while True:
        row = offset + reader.line_num + 1
        try:
            yield row, next(reader)
        except StopIteration:
            return
        except csv.Error:
            raise InvalidDeckInput(f"Row {row} has malformed fields") from None


def import_deck(text: str, kind: DeckKind, *, title: str = "Imported deck") -> Deck:
    """Parse a UTF-8 CSV or Anki Basic export before doing any storage writes."""
    if kind not in ("csv", "anki"):
        raise InvalidDeckInput("Deck kind must be csv or anki")
    try:
        if len(text) > _MAX_INPUT_BYTES or len(text.encode("utf-8")) > _MAX_INPUT_BYTES:
            raise InvalidDeckInput("Deck text must be at most 128 KiB")
        title.encode("utf-8")
    except UnicodeEncodeError:
        raise InvalidDeckInput("Deck title and text must be valid UTF-8") from None
    title = title.strip()
    if not title:
        raise InvalidDeckInput("Deck title must be nonempty")

    stream = StringIO(text.removeprefix("\ufeff"), newline="")
    html, offset = _read_anki_headers(stream) if kind == "anki" else (False, 0)
    rows = _read_rows(stream, "\t" if kind == "anki" else ",", offset)
    if kind == "csv" and next(rows, (1, []))[1] != ["front", "back"]:
        raise InvalidDeckInput("Row 1 must contain the front,back header")

    cards = []
    for row, fields in rows:
        if not fields:
            continue
        if len(fields) < 2 or (kind == "csv" and len(fields) != 2):
            raise InvalidDeckInput(f"Row {row} must contain front and back fields")
        front, back = fields[:2]
        if html:
            front, back = _plain_text(front, row), _plain_text(back, row)
        if not front.strip() or not back.strip():
            raise InvalidDeckInput(f"Row {row} must have a nonempty front and back")
        if len(cards) == _MAX_CARDS:
            raise InvalidDeckInput(f"Row {row} exceeds the {_MAX_CARDS}-card limit")
        cards.append(Card(front=front, back=back))
    if not cards:
        raise InvalidDeckInput("Deck must contain at least one card")
    return Deck(id=uuid4(), title=title, source=kind, cards=cards)


def _decks_dir() -> Path:
    return get_path_service().user_data_dir / "exam_packs_state" / "decks"


def save_deck(deck: Deck, pack_id: str, subject_id: str) -> None:
    record = _StoredDeck(**deck.model_dump(), pack_id=pack_id, subject_id=subject_id)
    atomic_write_json(
        _decks_dir() / f"{deck.id}.json", record.model_dump(mode="json", exclude_none=True)
    )


def _read_deck(path: Path, pack_id: str, subject_id: str) -> _StoredDeck | None:
    try:
        record = _StoredDeck.model_validate_json(read_text(path))
    except (FileNotFoundError, UnicodeDecodeError, ValidationError):
        return None
    if (record.pack_id, record.subject_id) == (pack_id, subject_id) and path.stem == str(record.id):
        return record
    return None


def load_deck(deck_id: UUID, pack_id: str, subject_id: str) -> Deck | None:
    return _read_deck(_decks_dir() / f"{deck_id}.json", pack_id, subject_id)


def list_decks(pack_id: str, subject_id: str) -> list[DeckSummary]:
    summaries = []
    for path in sorted(_decks_dir().glob("*.json")):
        record = _read_deck(path, pack_id, subject_id)
        if record is not None:
            summaries.append(
                DeckSummary(
                    id=record.id,
                    title=record.title,
                    source=record.source,
                    card_count=len(record.cards),
                )
            )
    return summaries
