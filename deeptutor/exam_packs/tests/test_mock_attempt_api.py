from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
import pytest
import pytest_asyncio

from deeptutor.api import module_routes
from deeptutor.api.router_loader import RouterLoader
from deeptutor.api.routers import auth, exam_packs
from deeptutor.exam_packs import mock
from deeptutor.multi_user import learning_access, paths
from deeptutor.services.llm import LLMConfigError
from deeptutor.services.workspace import get_content_workspace_service
from deeptutor.services.workspace.activity import WorkspaceActivityMiddleware

from .test_api import keep_loop_responsive as keep_loop_responsive
from .test_loader import pack_path as pack_path
from .test_mock_builder import _valid_payload
from .test_mock_builder import pipeline_run as pipeline_run

pytestmark = pytest.mark.asyncio

START_URL = "/api/exam-packs/sample-pack/mock"
ATTEMPT_URL = "/api/exam-packs/mock"
START_BODY = {"subject_id": "math", "questionnaire_code": "001"}
STATE_PATH = Path("exam_packs_state/attempts")


@pytest.fixture
def attempts_dir(tmp_path, monkeypatch):
    runtime = tmp_path / "runtime"
    monkeypatch.setenv("DEEPTUTOR_HOME", str(runtime))
    monkeypatch.setattr(paths, "ADMIN_WORKSPACE_ROOT", runtime / "data")
    return runtime / "data" / "user" / STATE_PATH


@pytest_asyncio.fixture
async def client(pack_path, attempts_dir, pipeline_run, monkeypatch):
    metadata_path = pack_path / "pack.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    original = metadata["subjects"][0]["questionnaires"][0]
    metadata["subjects"][0]["questionnaires"].extend(
        [
            {**original, "code": "003", "minutes": 0},
            {**original, "code": "004", "minutes": 10**12},
        ]
    )
    other = {**original, "minutes": 20}
    metadata["subjects"].insert(
        0,
        {
            "id": "science",
            "title": "Science",
            "title_source": "Science",
            "questionnaires": [other, {**other, "code": "002"}],
        },
    )
    metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
    monkeypatch.setenv("DEEPTUTOR_EXAM_PACKS_DIR", str(pack_path.parent))
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
    module_routes.mount_module_routes(app, RouterLoader(app, lazy=True))
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client


async def test_start_and_reload_preserve_timer_and_hide_scoring(
    client, attempts_dir, pipeline_run, monkeypatch
):
    now = datetime(2027, 2, 3, 23, 50, tzinfo=timezone.utc)

    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            assert tz == timezone.utc
            return now

    def generate(*args, **kwargs):
        nonlocal now
        now += timedelta(minutes=5)
        return _valid_payload(*args, **kwargs)

    monkeypatch.setattr(mock, "datetime", FrozenDateTime)
    pipeline_run.side_effect = generate

    response = await client.post(START_URL, json=START_BODY)
    assert response.status_code == 200, response.text
    started = response.json()
    attempt_id = started["attempt_id"]
    assert UUID(attempt_id).version == 4
    assert datetime.fromisoformat(started["started_at"]) == now
    assert datetime.fromisoformat(started["expires_at"]) == now + timedelta(minutes=60)
    assert started == {
        "attempt_id": attempt_id,
        "pack_id": "sample-pack",
        **START_BODY,
        "ui_lang": "en",
        "started_at": started["started_at"],
        "expires_at": started["expires_at"],
        "minutes": 60,
        "questions": [
            {
                "id": f"q-{topic}",
                "topic_id": topic,
                "prompt": f"Prompt for q-{topic}",
                "options": {"A": "One", "B": "Two", "C": "Three", "D": "Four"},
                "points": points,
            }
            for topic, points in (("functions", 75), ("graphs", 25))
        ],
        "result": None,
    }

    (record_path,) = attempts_dir.iterdir()
    assert record_path.name == f"{attempt_id}.json"
    record = json.loads(record_path.read_text(encoding="utf-8"))
    assert record["started_at"] == started["started_at"]
    assert record["expires_at"] == started["expires_at"]
    assert [question["correct_option"] for question in record["questions"]] == ["B", "B"]
    assert [question["rationale"] for question in record["questions"]] == [
        "Explanation for q-functions",
        "Explanation for q-graphs",
    ]

    now += timedelta(hours=2)
    monkeypatch.setattr(exam_packs, "_packs", [])
    reloaded = await client.get(f"{ATTEMPT_URL}/{attempt_id}")
    assert reloaded.status_code == 200
    assert reloaded.json() == started
    pipeline_run.assert_awaited_once()


async def test_attempts_are_scoped_to_the_selected_workspace(client, attempts_dir, pipeline_run):
    with paths.user_context(paths.local_admin_user()):
        catalog = get_content_workspace_service()
        first = catalog.create_workspace("Algebra")
        second = catalog.create_workspace("Geometry")
    scope = {"dt_workspace": first["workspace_id"]}
    pipeline_run.side_effect = _valid_payload

    response = await client.post(START_URL, params=scope, json=START_BODY)
    assert response.status_code == 200, response.text
    attempt_id = response.json()["attempt_id"]
    attempt_url = f"{ATTEMPT_URL}/{attempt_id}"
    scoped_dir = Path(first["path"]) / ".deeptutor" / "data" / "user" / STATE_PATH
    assert list(scoped_dir.iterdir()) == [scoped_dir / f"{attempt_id}.json"]
    assert not attempts_dir.exists()

    assert (await client.get(attempt_url)).status_code == 404
    other_scope = {"dt_workspace": second["workspace_id"]}
    assert (await client.get(attempt_url, params=other_scope)).status_code == 404
    reloaded = await client.get(attempt_url, params=scope)
    assert reloaded.status_code == 200
    assert reloaded.json() == response.json()


async def test_missing_and_invalid_mock_input_never_calls_the_tutor(
    client, attempts_dir, pipeline_run
):
    cases = [
        (START_URL.replace("sample-pack", "missing"), START_BODY, 404),
        (START_URL, {**START_BODY, "subject_id": "missing"}, 404),
        (START_URL, {**START_BODY, "questionnaire_code": "002"}, 404),
        (START_URL, {**START_BODY, "questionnaire_code": "003"}, 422),
        (START_URL, {**START_BODY, "questionnaire_code": "004"}, 422),
        (START_URL, {**START_BODY, "subject_id": "science"}, 422),
        (START_URL, {"subject_id": "math"}, 422),
    ]
    for url, body, status in cases:
        assert (await client.post(url, json=body)).status_code == status
    assert (await client.get(f"{ATTEMPT_URL}/{uuid4()}")).status_code == 404
    assert (await client.get(f"{ATTEMPT_URL}/bad-id")).status_code == 422
    pipeline_run.assert_not_awaited()
    assert not attempts_dir.exists()


@pytest.mark.parametrize(
    ("failure", "status"),
    [
        (LLMConfigError("Tutor config details"), 503),
        (RuntimeError("Provider details"), 502),
        (None, 502),
    ],
)
async def test_failed_generation_does_not_save_an_attempt(
    client, attempts_dir, pipeline_run, failure, status
):
    pipeline_run.side_effect = failure
    pipeline_run.return_value = {"summary": {"results": []}}

    response = await client.post(START_URL, json=START_BODY)
    assert response.status_code == status
    assert "details" not in response.text
    pipeline_run.assert_awaited_once()
    assert not attempts_dir.exists()


async def test_mock_routes_require_chat_learning_access(
    client, attempts_dir, pipeline_run, monkeypatch
):
    monkeypatch.setattr(
        learning_access, "current_learning_policy", lambda: {"allowed_surfaces": ["reading"]}
    )

    assert (await client.post(START_URL, json=START_BODY)).status_code == 403
    assert (await client.get(f"{ATTEMPT_URL}/{uuid4()}")).status_code == 403
    pipeline_run.assert_not_awaited()
    assert not attempts_dir.exists()
