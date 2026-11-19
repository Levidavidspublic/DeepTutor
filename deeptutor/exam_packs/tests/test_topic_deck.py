"""Contracts for building and saving drill decks from topic glossary terms."""

from dataclasses import replace
import json
from uuid import UUID

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
import pytest
import pytest_asyncio

from deeptutor.api import module_routes
from deeptutor.api.router_loader import RouterLoader
from deeptutor.api.routers import auth, exam_packs
from deeptutor.exam_packs import load_packs
from deeptutor.multi_user import learning_access, paths
from deeptutor.services.workspace.activity import WorkspaceActivityMiddleware

from .test_api import keep_loop_responsive as keep_loop_responsive
from .test_loader import pack_path as pack_path

pytestmark = pytest.mark.skip(reason="KITCHEN-PENDING #183: feature not built yet")

PACKS_URL = "/api/exam-packs"
SUBJECT_URL = f"{PACKS_URL}/sample-pack/subjects/math"
TOPIC_DECK_URL = f"{SUBJECT_URL}/topics/graphs/deck"
DECKS_URL = f"{SUBJECT_URL}/decks"
GLOSSARY_HEADER = "term_source,term_ui,note,topic_ids\n"
EXPECTED_CARDS = [
    {"front": "תחום", "back": "Domain - Allowed inputs", "topic_id": "graphs"},
    {"front": "גרף", "back": "Graph", "topic_id": "graphs"},
    {
        "front": "פונקציה",
        "back": "Function - A rule, with one output per input",
        "topic_id": "graphs",
    },
]


@pytest.fixture
def topic_pack_path(pack_path):
    (pack_path / "glossary.csv").write_text(
        GLOSSARY_HEADER
        + "תחום,Domain,Allowed inputs,functions; graphs\n"
        "טווח,Range,Possible outputs,functions\n"
        "גרף,Graph,,graphs\n"
        "כלל,Rule,,\n"
        'פונקציה,Function,"A rule, with one output per input",graphs\n',
        encoding="utf-8",
    )
    metadata_path = pack_path / "pack.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata["subjects"].append(
        {"id": "science", "title": "Science", "title_source": "Science", "questionnaires": []}
    )
    metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
    return pack_path


@pytest.fixture
def decks_dir(tmp_path, monkeypatch):
    runtime = tmp_path / "runtime"
    monkeypatch.setenv("DEEPTUTOR_HOME", str(runtime))
    monkeypatch.delenv("DEEPTUTOR_WORKSPACE_ROOT", raising=False)
    monkeypatch.setattr(paths, "ADMIN_WORKSPACE_ROOT", runtime / "data")
    return runtime / "data" / "user" / "exam_packs_state" / "decks"


@pytest_asyncio.fixture
async def client(topic_pack_path, decks_dir, monkeypatch):
    monkeypatch.setenv("DEEPTUTOR_EXAM_PACKS_DIR", str(topic_pack_path.parent))
    monkeypatch.setattr(exam_packs, "_packs", None)
    monkeypatch.setattr(auth, "AUTH_ENABLED", False)
    manifest = module_routes.manifests()["questions"]
    exam_route = next(
        route for route in manifest["routes"] if route["reference"].endswith(".exam_packs:router")
    )
    monkeypatch.setattr(
        module_routes, "manifests", lambda: {"questions": {**manifest, "routes": [exam_route]}}
    )
    app = FastAPI()
    app.add_middleware(WorkspaceActivityMiddleware)
    loader = RouterLoader(app, lazy=True)
    assert exam_route["reference"] in loader.index, "Regenerate the lazy API router index"
    module_routes.mount_module_routes(app, loader)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client


def test_deck_from_topic_uses_glossary_order_and_stable_scoped_id(topic_pack_path):
    from deeptutor.exam_packs.decks import Deck, deck_from_topic

    (pack,) = load_packs(topic_pack_path.parent)
    topics = {topic.id: topic for topic in pack.topics}
    graphs = topics["graphs"]
    deck = deck_from_topic(pack, graphs)
    assert isinstance(deck, Deck)
    assert deck.id.version == 5
    assert deck.model_dump(exclude={"id"}) == {
        "title": "Graphs",
        "source": "topic",
        "cards": EXPECTED_CARDS,
    }
    assert deck_from_topic(pack, graphs) == deck

    # Changing a subject ID changes the deck identity of its topics.
    renamed_topics = {
        topic_id: replace(topic, subject_id="algebra") for topic_id, topic in topics.items()
    }
    renamed_pack = replace(
        pack,
        subjects=[
            replace(subject, id="algebra") if subject.id == "math" else subject
            for subject in pack.subjects
        ],
        topics=list(renamed_topics.values()),
    )
    assert deck_from_topic(renamed_pack, renamed_topics["graphs"]).id != deck.id
    assert deck_from_topic(replace(pack, id="other-pack"), graphs).id != deck.id
    assert deck_from_topic(pack, topics["functions"]).id != deck.id


@pytest.mark.asyncio
async def test_topic_deck_post_saves_one_reopenable_deck_on_retry(client, decks_dir):
    response = await client.post(TOPIC_DECK_URL)
    assert response.status_code == 200, response.text
    deck = response.json()
    deck_id = deck["id"]
    assert UUID(deck_id).version == 5
    summary = {"id": deck_id, "title": "Graphs", "source": "topic"}
    assert deck == {**summary, "cards": EXPECTED_CARDS}

    record_path = decks_dir / f"{deck_id}.json"
    assert list(decks_dir.iterdir()) == [record_path]
    record = {**deck, "pack_id": "sample-pack", "subject_id": "math"}
    assert json.loads(record_path.read_text(encoding="utf-8")) == record

    retry = await client.post(TOPIC_DECK_URL)
    assert retry.status_code == 200, retry.text
    assert retry.json() == deck
    assert list(decks_dir.iterdir()) == [record_path]
    assert json.loads(record_path.read_text(encoding="utf-8")) == record

    response = await client.get(f"{DECKS_URL}/{deck_id}")
    assert response.status_code == 200, response.text
    assert response.json() == deck
    response = await client.get(DECKS_URL)
    assert response.status_code == 200, response.text
    assert response.json() == [{**summary, "card_count": len(EXPECTED_CARDS)}]


@pytest.mark.asyncio
async def test_topic_without_glossary_terms_returns_422_and_saves_nothing(
    client, topic_pack_path, decks_dir
):
    from deeptutor.exam_packs.decks import InvalidDeckInput, deck_from_topic

    (topic_pack_path / "glossary.csv").write_text(
        GLOSSARY_HEADER + "טווח,Range,Possible outputs,functions\n", encoding="utf-8"
    )
    (pack,) = load_packs(topic_pack_path.parent)
    graphs = next(topic for topic in pack.topics if topic.id == "graphs")
    with pytest.raises(InvalidDeckInput) as error:
        deck_from_topic(pack, graphs)
    assert str(error.value).strip()

    response = await client.post(TOPIC_DECK_URL)
    assert response.status_code == 422, response.text
    assert response.json()["detail"] == str(error.value)
    assert not list(decks_dir.glob("*.json"))


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("path", "detail"),
    [
        ("/missing/subjects/math/topics/graphs/deck", "Exam pack not found"),
        ("/sample-pack/subjects/missing/topics/graphs/deck", "Exam subject not found"),
        ("/sample-pack/subjects/math/topics/missing/deck", "Exam topic not found"),
        ("/sample-pack/subjects/science/topics/graphs/deck", "Exam topic not found"),
    ],
)
async def test_topic_deck_rejects_unknown_or_mismatched_ids(client, decks_dir, path, detail):
    response = await client.post(f"{PACKS_URL}{path}")
    assert response.status_code == 404, response.text
    assert response.json()["detail"] == detail
    assert not list(decks_dir.glob("*.json"))


@pytest.mark.asyncio
async def test_topic_deck_requires_learning_access(client, decks_dir, monkeypatch):
    with monkeypatch.context() as patch:
        patch.setattr(auth, "AUTH_ENABLED", True)
        response = await client.post(TOPIC_DECK_URL)
        assert response.status_code == 401, response.text

    monkeypatch.setattr(
        learning_access, "current_learning_policy", lambda: {"allowed_surfaces": ["reading"]}
    )
    response = await client.post(TOPIC_DECK_URL)
    assert response.status_code == 403, response.text
    assert not list(decks_dir.glob("*.json"))
