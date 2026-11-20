import asyncio
import json
from pathlib import Path

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
import pytest
import pytest_asyncio

from deeptutor.api import module_routes
from deeptutor.api.router_loader import RouterLoader
from deeptutor.api.routers import auth, exam_packs
from deeptutor.exam_packs import links
from deeptutor.learning.service import LearningService
from deeptutor.learning.storage import LearningStore
from deeptutor.multi_user import learning_access, paths
from deeptutor.services.path_service import get_path_service
from deeptutor.services.workspace import get_content_workspace_service
from deeptutor.services.workspace.activity import WorkspaceActivityMiddleware
from deeptutor.services.workspace.context import workspace_context

from .test_loader import pack_path as pack_path

PACK_ID = "sample-pack"
FUNCTIONS_URL = f"/api/exam-packs/{PACK_ID}/subjects/math/topics/functions/mastery-link"
pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def client(tmp_path: Path, pack_path: Path, monkeypatch: pytest.MonkeyPatch):
    runtime_home = tmp_path / "runtime"
    monkeypatch.setenv("DEEPTUTOR_HOME", str(runtime_home))
    monkeypatch.delenv("DEEPTUTOR_WORKSPACE_ROOT", raising=False)
    monkeypatch.setenv("DEEPTUTOR_EXAM_PACKS_DIR", str(pack_path.parent))
    monkeypatch.setattr(paths, "ADMIN_WORKSPACE_ROOT", runtime_home / "data")
    monkeypatch.setattr(auth, "AUTH_ENABLED", False)
    monkeypatch.setattr(exam_packs, "_packs", None)

    metadata_path = pack_path / "pack.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata["subjects"].append(
        {"id": "science", "title": "Science", "title_source": "Science", "questionnaires": []}
    )
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False), encoding="utf-8")
    functions = pack_path / "topics" / "math" / "functions.md"
    functions.write_text(
        functions.read_text(encoding="utf-8").replace(
            "  - Define a function", "  - Define a function\n  - Identify its domain"
        ),
        encoding="utf-8",
    )
    graphs = pack_path / "topics" / "math" / "graphs.md"
    graphs.write_text(
        graphs.read_text(encoding="utf-8").replace("objectives: [Read a graph]", "objectives: []"),
        encoding="utf-8",
    )
    science_graphs = pack_path / "topics" / "science" / "graphs.md"
    science_graphs.parent.mkdir()
    science_graphs.write_text(graphs.read_text(encoding="utf-8"), encoding="utf-8")

    questions = module_routes.manifests()["questions"]
    exam_route = next(
        route for route in questions["routes"] if route["reference"].endswith(".exam_packs:router")
    )
    monkeypatch.setattr(
        module_routes, "manifests", lambda: {"questions": {**questions, "routes": [exam_route]}}
    )
    app = FastAPI()
    app.add_middleware(WorkspaceActivityMiddleware)
    module_routes.mount_module_routes(app, RouterLoader(app))

    # Some test sandboxes block asyncio's socketpair wakeups from worker threads.
    # A timer lets the selector service queued completions in those sandboxes.
    loop = asyncio.get_running_loop()

    def tick() -> None:
        nonlocal timer
        timer = loop.call_later(0.01, tick)

    timer = loop.call_later(0.01, tick)
    try:
        with paths.user_context(paths.local_admin_user()):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://testserver"
            ) as client:
                yield client
    finally:
        timer.cancel()


@pytest.mark.parametrize(
    ("pack", "subject", "topic"),
    [
        ("missing", "math", "functions"),
        (PACK_ID, "missing", "functions"),
        (PACK_ID, "math", "missing"),
        (PACK_ID, "science", "functions"),
    ],
)
async def test_unknown_or_mismatched_tuple(client: AsyncClient, pack: str, subject: str, topic: str):
    response = await client.post(
        f"/api/exam-packs/{pack}/subjects/{subject}/topics/{topic}/mastery-link"
    )
    assert response.status_code == 404
    assert links.get_mastery_link(pack, subject, topic) is None
    assert not (get_path_service().user_data_dir / "exam_packs_state").exists()


async def test_mastery_link_requires_learning_access(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(
        learning_access, "current_learning_policy", lambda: {"allowed_surfaces": ["reading"]}
    )
    assert (await client.post(FUNCTIONS_URL)).status_code == 403
    assert links.get_mastery_link(PACK_ID, "math", "functions") is None


async def test_concurrent_and_repeated_starts_preserve_objectives_and_source(client: AsyncClient):
    responses = await asyncio.gather(*(client.post(FUNCTIONS_URL) for _ in range(4)))
    responses.append(await client.post(FUNCTIONS_URL))
    for response in responses:
        assert response.status_code == 200, response.text
    path_id = responses[0].json()["path_id"]
    assert all(response.json() == {"path_id": path_id} for response in responses)
    assert links.get_mastery_link(PACK_ID, "math", "functions") == path_id

    store = LearningStore()
    assert store.list_all() == [path_id]
    progress = store.load(path_id)
    assert progress is not None
    (module,) = progress.modules
    assert module.name == "Functions"
    assert progress.current_module_id == module.id
    assert [point.name for point in module.knowledge_points] == [
        "Define a function",
        "Identify its domain",
    ]
    topic = store.get_topic(path_id)
    assert topic is not None
    (source,) = topic.sources
    assert source.excerpt == "# Functions\n\nStudy a rule.\n"
    assert source.metadata == {
        "exam_pack_id": PACK_ID,
        "exam_subject_id": "math",
        "exam_topic_id": "functions",
        "exam_ui_lang": "en",
    }
    assert all(point.topic_source_ids == [source.id] for point in module.knowledge_points)


async def test_topic_ids_are_subject_scoped_and_empty_objectives_use_title(client: AsyncClient):
    path_ids = []
    for subject in ("math", "science"):
        response = await client.post(
            f"/api/exam-packs/{PACK_ID}/subjects/{subject}/topics/graphs/mastery-link"
        )
        assert response.status_code == 200, response.text
        path_id = response.json()["path_id"]
        path_ids.append(path_id)
        assert links.get_mastery_link(PACK_ID, subject, "graphs") == path_id
        progress = LearningStore().load(path_id)
        assert progress is not None
        (module,) = progress.modules
        assert [point.name for point in module.knowledge_points] == ["Graphs"]
    assert len(set(path_ids)) == 2


async def test_retry_after_failed_link_write_reuses_committed_path(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    def fail_write(path: Path, payload: dict) -> None:
        raise OSError("interrupted link write")

    with monkeypatch.context() as patch:
        patch.setattr(links, "atomic_write_json", fail_write)
        with pytest.raises(OSError, match="interrupted link write"):
            await client.post(FUNCTIONS_URL)

    assert links.get_mastery_link(PACK_ID, "math", "functions") is None
    store = LearningStore()
    (path_id,) = store.list_all()
    LearningService(store).rename_path(path_id, "My Functions Route")
    response = await client.post(FUNCTIONS_URL)
    assert response.status_code == 200, response.text
    assert response.json() == {"path_id": path_id}
    assert links.get_mastery_link(PACK_ID, "math", "functions") == path_id
    assert store.list_all() == [path_id]
    progress = store.load(path_id)
    assert progress is not None
    assert progress.name == "My Functions Route"


async def test_link_and_learning_path_follow_selected_workspace(client: AsyncClient):
    workspace_id = get_content_workspace_service().create_workspace("Exam Study")["workspace_id"]
    response = await asyncio.create_task(
        client.post(FUNCTIONS_URL, headers={"X-DeepTutor-Workspace": workspace_id})
    )
    assert response.status_code == 200, response.text
    path_id = response.json()["path_id"]

    assert links.get_mastery_link(PACK_ID, "math", "functions") is None
    assert not LearningStore().exists(path_id)
    with workspace_context(workspace_id):
        assert links.get_mastery_link(PACK_ID, "math", "functions") == path_id
        assert LearningStore().exists(path_id)
