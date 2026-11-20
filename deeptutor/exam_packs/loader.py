"""Load exam packs from a runtime directory."""

from __future__ import annotations

import csv
import json
import logging
import os
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter
import yaml

from .models import ExamPack, GlossaryTerm

logger = logging.getLogger(__name__)

_PACK_ADAPTER = TypeAdapter(ExamPack)
_GLOSSARY_COLUMNS = {"term_source", "term_ui", "note", "topic_ids"}


class _DuplicatePackIdError(ValueError):
    """A previously loaded pack already uses the ID."""


def get_packs_root() -> Path:
    """Return the configured exam packs directory."""
    return Path(os.environ.get("DEEPTUTOR_EXAM_PACKS_DIR") or "data/user/exam_packs")


def load_packs(root: Path | None = None) -> list[ExamPack]:
    """Load each child directory as a pack, warning and continuing on failure."""
    if root is None:
        root = get_packs_root()
    try:
        paths = sorted(root.iterdir())
    except FileNotFoundError:
        return []
    except OSError as exc:
        logger.warning("Could not list the exam packs directory (%s)", type(exc).__name__)
        return []

    packs: list[ExamPack] = []
    loaded_ids: set[str] = set()
    for path in paths:
        try:
            if path.is_dir():
                pack = _read_pack(path)
                if pack.id in loaded_ids:
                    raise _DuplicatePackIdError
                packs.append(pack)
                loaded_ids.add(pack.id)
        except Exception as exc:
            # Parser errors can include excerpts from private pack files.
            logger.warning("Skipping broken exam pack %s (%s)", path.name, type(exc).__name__)
    return packs


def _read_pack(path: Path) -> ExamPack:
    metadata = json.loads((path / "pack.json").read_text(encoding="utf-8"))
    if not isinstance(metadata, dict):
        raise ValueError("pack.json must contain an object")

    topics = [_read_topic(file) for file in sorted(path.glob("topics/*/*.md"))]
    glossary = _read_glossary(path / "glossary.csv")
    pack = _PACK_ADAPTER.validate_python(
        {**metadata, "path": path, "topics": topics, "glossary": glossary}
    )
    topic_identities = {(topic.subject_id, topic.id) for topic in pack.topics}
    if len(topic_identities) != len(pack.topics):
        raise ValueError("Topic IDs must be unique within each subject")
    return pack


def _read_topic(path: Path) -> dict[str, Any]:
    lines = path.read_text(encoding="utf-8").split("\n")
    if lines[0] != "---":
        raise ValueError("Topic must begin with YAML front matter")
    end = lines.index("---", 1)
    metadata = yaml.safe_load("\n".join(lines[1:end]))
    if not isinstance(metadata, dict):
        raise ValueError("Topic front matter must contain a mapping")
    return {**metadata, "subject_id": path.parent.name, "body_md": "\n".join(lines[end + 1 :])}


def _read_glossary(path: Path) -> list[GlossaryTerm]:
    terms: list[GlossaryTerm] = []
    with path.open(encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file, strict=True)
        columns = reader.fieldnames or []
        if set(columns) != _GLOSSARY_COLUMNS or len(columns) != len(_GLOSSARY_COLUMNS):
            raise ValueError("glossary.csv must contain the required columns")
        for row in reader:
            if None in row or None in row.values():
                raise ValueError("Glossary row does not match the header")
            topic_ids = [topic_id.strip() for topic_id in row["topic_ids"].split(";")]
            terms.append(
                GlossaryTerm(
                    term_source=row["term_source"],
                    term_ui=row["term_ui"],
                    note=row["note"],
                    topic_ids=[topic_id for topic_id in topic_ids if topic_id],
                )
            )
    return terms
