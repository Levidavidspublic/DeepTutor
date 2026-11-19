"""Persist workspace-local links from exam topics to Guided Learning paths."""

from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path

from deeptutor.learning.models import (
    KnowledgePoint,
    KnowledgeType,
    LearningModule,
    TopicMetadata,
    TopicSource,
    TopicSourceKind,
)
from deeptutor.learning.service import LearningService
from deeptutor.learning.storage import LearningStore
from deeptutor.services.file_io import atomic_write_json, read_text
from deeptutor.services.path_service import get_path_service
from deeptutor.services.session.migration_lock import exclusive_lock

from .models import ExamPack, Topic


def _links_path() -> Path:
    return get_path_service().user_data_dir / "exam_packs_state" / "links.json"


def _read_links(path: Path) -> dict[str, dict[str, dict[str, str]]]:
    try:
        return json.loads(read_text(path))
    except FileNotFoundError:
        return {}


def get_mastery_link(pack_id: str, subject_id: str, topic_id: str) -> str | None:
    """Read the recorded path ID without creating any exam or learning state."""
    return _read_links(_links_path()).get(pack_id, {}).get(subject_id, {}).get(topic_id)


def get_or_create_mastery_link(pack: ExamPack, topic: Topic) -> str:
    """Link a resolved exam topic to a path in the current workspace."""
    links_path = _links_path()
    links_path.parent.mkdir(parents=True, exist_ok=True)
    with exclusive_lock(links_path.with_suffix(".lock")):
        links = _read_links(links_path)
        topic_links = links.setdefault(pack.id, {}).setdefault(topic.subject_id, {})
        linked_path_id = topic_links.get(topic.id)
        # A retry can find the committed learning topic even if links.json was
        # never replaced after the initial creation.
        identity = json.dumps((pack.id, topic.subject_id, topic.id))
        path_id = linked_path_id or f"topic_exam_{sha256(identity.encode()).hexdigest()}"
        store = LearningStore()
        if not store.exists(path_id):
            _create_path(store, path_id, pack, topic)
        if linked_path_id is None:
            topic_links[topic.id] = path_id
            atomic_write_json(links_path, links)
        return path_id


def _create_path(store: LearningStore, path_id: str, pack: ExamPack, topic: Topic) -> None:
    source = TopicSource(
        id=f"{path_id}_source",
        kind=TopicSourceKind.FILE,
        label=topic.title,
        excerpt=topic.body_md,
        metadata={
            "exam_pack_id": pack.id,
            "exam_subject_id": topic.subject_id,
            "exam_topic_id": topic.id,
            "exam_ui_lang": pack.ui_lang,
        },
    )
    module_id = f"{path_id}_m0"
    module = LearningModule(
        id=module_id,
        name=topic.title,
        order=0,
        knowledge_points=[
            KnowledgePoint(
                id=f"{module_id}_kp{index}",
                name=objective,
                type=KnowledgeType.CONCEPT,
                module_id=module_id,
                topic_source_ids=[source.id],
            )
            for index, objective in enumerate(topic.objectives or [topic.title])
        ],
    )
    LearningService(store).create_topic(
        path_id,
        name=topic.title,
        modules=[module],
        metadata=TopicMetadata(path_id=path_id, goal=topic.title),
        sources=[source],
    )
