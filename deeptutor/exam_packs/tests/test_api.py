import asyncio
<<<<<<< HEAD
from datetime import datetime, timezone
import json
from pathlib import Path
from shutil import copytree
from threading import get_ident
=======
import json
from pathlib import Path
from shutil import copytree
>>>>>>> origin/main

from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
import pytest
import pytest_asyncio

from deeptutor.api import module_routes
from deeptutor.api.router_loader import RouterLoader
from deeptutor.api.routers import exam_packs
from deeptutor.api.routers.auth import require_auth, require_learning_surface
from deeptutor.exam_packs import teachback
from deeptutor.learning.models import RepetitionState, ReviewTask
from deeptutor.learning.storage import LearningStore
from deeptutor.multi_user import learning_access
from deeptutor.services.llm import LLMConfigError, LLMError
from deeptutor.services.path_service import PathService

from .test_loader import pack_path as pack_path

pytestmark = pytest.mark.asyncio
SUBJECT_URL = "/api/exam-packs/sample-pack/subjects/math"
FUNCTIONS_URL = f"{SUBJECT_URL}/topics/functions"
ANSWER = "Each input gives exactly one output."


@pytest_asyncio.fixture(autouse=True)
async def keep_loop_responsive():
    # As in test_links, let restricted sandboxes process worker-thread completions.
    loop = asyncio.get_running_loop()

    def tick() -> None:
        nonlocal timer
        timer = loop.call_later(0.01, tick)

    timer = loop.call_later(0.01, tick)
    try:
        yield
    finally:
        timer.cancel()


@pytest.fixture
def state_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    service = PathService(workspace_root=tmp_path / "runtime" / "data")
    monkeypatch.setattr(PathService, "_instance", service)
    return service.user_data_dir / "exam_packs_state" / "teachback"


@pytest_asyncio.fixture
async def client(pack_path: Path, state_dir: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("DEEPTUTOR_EXAM_PACKS_DIR", str(pack_path.parent))
    monkeypatch.setattr(exam_packs, "_packs", None)
    app = FastAPI()
    app.include_router(exam_packs.router, prefix="/api/exam-packs")
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client

<<<<<<< HEAD

async def test_exam_pack_routes(
    pack_path: Path, client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            assert tz == timezone.utc
            return cls(2027, 2, 3, tzinfo=tz)

    monkeypatch.setattr(exam_packs, "datetime", FrozenDateTime)
    metadata_path = pack_path / "pack.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata["subjects"][0]["exam_dates"] = ["2027-02-08", "2027-02-02", "2027-02-03"]
    metadata["subjects"].append(
        {
            "id": "empty",
            "title": "Empty Subject",
            "title_source": "Empty Subject",
            "questionnaires": [],
            "exam_dates": ["2027-02-02"],
        }
    )
    metadata_path.write_text(json.dumps(metadata), encoding="utf-8")

    response = await client.get("/api/exam-packs")
    assert response.status_code == 200
    assert response.json() == [
        {
            "id": "sample-pack",
            "title": "Sample Pack",
            "exam": "Sample Exam",
            "source_lang": "he",
            "ui_lang": "en",
            "subjects": [
                {
                    "id": "math",
                    "title": "Math",
                    "title_source": "מתמטיקה",
                    "progress": {"done": 0, "total": 2},
                    "exam_date": "2027-02-03",
                },
                {
                    "id": "empty",
                    "title": "Empty Subject",
                    "title_source": "Empty Subject",
                    "progress": {"done": 0, "total": 0},
                    "exam_date": None,
                },
            ],
=======

async def test_exam_pack_routes(pack_path: Path, client: AsyncClient) -> None:
    response = await client.get("/api/exam-packs")
    assert response.status_code == 200
    assert response.json() == [
        {
            "id": "sample-pack",
            "title": "Sample Pack",
            "exam": "Sample Exam",
            "source_lang": "he",
            "ui_lang": "en",
            "subjects": [{"id": "math", "title": "Math", "title_source": "מתמטיקה"}],
        }
    ]

    response = await client.get("/api/exam-packs/sample-pack/subjects/math")
    assert response.status_code == 200
    assert response.json() == {
        "id": "math",
        "title": "Math",
        "source_lang": "he",
        "ui_lang": "en",
        "questionnaires": [
            {
                "code": "001",
                "title": "Basics",
                "minutes": 60,
                "topic_weights": {"functions": 0.75, "graphs": 0.25},
            }
        ],
        "topics": [
            {
                "id": "functions",
                "title": "Functions",
                "title_source": "פונקציות",
                "weight": 0.75,
                "objectives": ["Define a function"],
                "status": "new",
            },
            {
                "id": "graphs",
                "title": "Graphs",
                "title_source": "גרפים",
                "weight": 0.25,
                "objectives": ["Read a graph"],
                "status": "new",
            },
        ],
    }

    glossary_url = "/api/exam-packs/sample-pack/glossary"
    response = await client.get(glossary_url)
    assert response.status_code == 200
    glossary = [
        {
            "term_source": "פונקציה",
            "term_ui": "Function",
            "note": "A rule, with one output per input",
            "topic_ids": ["functions", "graphs"],
        },
        {"term_source": "גרף", "term_ui": "Graph", "note": "", "topic_ids": ["graphs"]},
    ]
    assert response.json() == glossary
    response = await client.get(glossary_url, params={"q": "Draw a גרף."})
    assert response.status_code == 200
    assert response.json() == [glossary[1]]

    assert (await client.get("/api/exam-packs/missing/glossary")).status_code == 404
    assert (await client.get("/api/exam-packs/sample-pack/subjects/missing")).status_code == 404

    metadata_path = pack_path / "pack.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata["title"] = "Updated Sample Pack"
    metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
    assert (await client.get("/api/exam-packs")).json()[0]["title"] == "Sample Pack"

    response = await client.post("/api/exam-packs/reload")
    assert response.status_code == 200
    assert response.json() == {"count": 1}
    assert (await client.get("/api/exam-packs")).json()[0]["title"] == "Updated Sample Pack"


async def test_teach_back_updates_only_the_submitted_pack_topic(
    client: AsyncClient, pack_path: Path, state_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    other = pack_path.with_name("another-pack-folder")
    copytree(pack_path, other)
    metadata_path = other / "pack.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata["id"] = "other-pack"
    metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
    other_subject = SUBJECT_URL.replace("sample-pack", "other-pack")
    functions = pack_path / "topics" / "math" / "functions.md"
    functions.write_text(
        functions.read_text(encoding="utf-8").replace(
            "  - Define a function", "  - Define a function\n  - Identify its domain"
        ),
        encoding="utf-8",
    )

    grades = iter(
        [
            {"verdict": "not yet", "missing": [1, 0], "feedback": "Explain how the rule works."},
            {"verdict": "partly", "missing": [1], "feedback": "Describe which inputs are allowed."},
            {"verdict": "got it", "missing": [], "feedback": "You explained the rule clearly."},
        ]
    )

    async def complete(prompt: str, **kwargs) -> str:
        assert json.loads(prompt) == {
            "topic": "Functions",
            "objectives": ["Define a function", "Identify its domain"],
            "source_lang": "he",
            "ui_lang": "en",
            "learner_text": ANSWER,
        }
        return json.dumps(next(grades))

    monkeypatch.setattr(teachback, "complete", complete)
    accepted = []
    for verdict, status, missing in (
        ("not yet", "learning", ["Define a function", "Identify its domain"]),
        ("partly", "review", ["Identify its domain"]),
        ("got it", "done", []),
    ):
        response = await client.post(
            f"{FUNCTIONS_URL}/teach-back", json={"learner_text": f" {ANSWER}\n"}
        )
        assert response.status_code == 200
        result = response.json()
        assert set(result) == {"verdict", "missing", "feedback"}
        assert result["verdict"] == verdict
        assert result["missing"] == missing
        assert ANSWER not in response.text
        accepted.append(result)

        subject = await client.get(SUBJECT_URL)
        assert [topic["status"] for topic in subject.json()["topics"]] == [status, "new"]
        assert (await client.get(other_subject)).json()["topics"][0]["status"] == "new"

    (history,) = state_dir.glob("*.jsonl")
    contents = history.read_text(encoding="utf-8")
    assert ANSWER not in contents
    entries = [json.loads(line) for line in contents.splitlines()]
    for entry, result in zip(entries, accepted, strict=True):
        assert entry.pop("at")
        assert entry == {
            "pack_id": "sample-pack",
            "subject_id": "math",
            "topic_id": "functions",
            **result,
>>>>>>> origin/main
        }
    ]

<<<<<<< HEAD
    response = await client.get("/api/exam-packs/sample-pack/subjects/math")
    assert response.status_code == 200
    assert response.json() == {
        "id": "math",
        "title": "Math",
        "source_lang": "he",
        "ui_lang": "en",
        "questionnaires": [
            {
                "code": "001",
                "title": "Basics",
                "minutes": 60,
                "topic_weights": {"functions": 0.75, "graphs": 0.25},
            }
        ],
        "topics": [
            {
                "id": "functions",
                "title": "Functions",
                "title_source": "פונקציות",
                "weight": 0.75,
                "objectives": ["Define a function"],
                "status": "new",
            },
            {
                "id": "graphs",
                "title": "Graphs",
                "title_source": "גרפים",
                "weight": 0.25,
                "objectives": ["Read a graph"],
                "status": "new",
            },
        ],
    }

    glossary_url = "/api/exam-packs/sample-pack/glossary"
    response = await client.get(glossary_url)
    assert response.status_code == 200
    glossary = [
        {
            "term_source": "פונקציה",
            "term_ui": "Function",
            "note": "A rule, with one output per input",
            "topic_ids": ["functions", "graphs"],
        },
        {"term_source": "גרף", "term_ui": "Graph", "note": "", "topic_ids": ["graphs"]},
    ]
    assert response.json() == glossary
    response = await client.get(glossary_url, params={"q": "Draw a גרף."})
    assert response.status_code == 200
    assert response.json() == [glossary[1]]

    assert (await client.get("/api/exam-packs/missing/glossary")).status_code == 404
    assert (await client.get("/api/exam-packs/sample-pack/subjects/missing")).status_code == 404

    metadata["title"] = "Updated Sample Pack"
    metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
    assert (await client.get("/api/exam-packs")).json()[0]["title"] == "Sample Pack"

    response = await client.post("/api/exam-packs/reload")
    assert response.status_code == 200
    assert response.json() == {"count": 1}
    assert (await client.get("/api/exam-packs")).json()[0]["title"] == "Updated Sample Pack"


async def test_teach_back_updates_only_the_submitted_pack_topic(
    client: AsyncClient, pack_path: Path, state_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    other = pack_path.with_name("other-pack")
    copytree(pack_path, other)
    metadata_path = other / "pack.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata["id"] = "other-pack"
    metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
    other_subject = SUBJECT_URL.replace("sample-pack", "other-pack")
    functions = pack_path / "topics" / "math" / "functions.md"
    functions.write_text(
        functions.read_text(encoding="utf-8").replace(
            "  - Define a function", "  - Define a function\n  - Identify its domain"
        ),
        encoding="utf-8",
    )

    grades = iter(
        [
            {"verdict": "not yet", "missing": [1, 0], "feedback": "Explain how the rule works."},
            {"verdict": "partly", "missing": [1], "feedback": "Describe which inputs are allowed."},
            {"verdict": "got it", "missing": [], "feedback": "You explained the rule clearly."},
        ]
    )

    async def complete(prompt: str, **kwargs) -> str:
        assert json.loads(prompt) == {
            "topic": "Functions",
            "objectives": ["Define a function", "Identify its domain"],
            "source_lang": "he",
            "ui_lang": "en",
            "learner_text": ANSWER,
        }
        return json.dumps(next(grades))

    monkeypatch.setattr(teachback, "complete", complete)

    metadata_path = pack_path / "pack.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata["subjects"].append(
        {
            "id": "applied-math",
            "title": "Applied Math",
            "title_source": "Applied Math",
            "questionnaires": metadata["subjects"][0]["questionnaires"],
        }
    )
    metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
    applied_math = pack_path / "topics" / "applied-math"
    applied_math.mkdir()
    (applied_math / "functions.md").write_bytes(functions.read_bytes())
    (applied_math / "functions-copy.md").write_bytes(functions.read_bytes())

    async def list_progress() -> dict[tuple[str, str], dict[str, int]]:
        response = await client.get("/api/exam-packs")
        assert response.status_code == 200
        return {
            (pack["id"], subject["id"]): subject["progress"]
            for pack in response.json()
            for subject in pack["subjects"]
        }

    initial_progress = {
        ("sample-pack", "math"): {"done": 0, "total": 2},
        ("sample-pack", "applied-math"): {"done": 0, "total": 1},
        ("other-pack", "math"): {"done": 0, "total": 2},
    }
    assert await list_progress() == initial_progress
    accepted = []
    for verdict, status, missing in (
        ("not yet", "learning", ["Define a function", "Identify its domain"]),
        ("partly", "review", ["Identify its domain"]),
        ("got it", "done", []),
    ):
        response = await client.post(
            f"{FUNCTIONS_URL}/teach-back", json={"learner_text": f" {ANSWER}\n"}
        )
        assert response.status_code == 200
        result = response.json()
        assert set(result) == {"verdict", "missing", "feedback"}
        assert result["verdict"] == verdict
        assert result["missing"] == missing
        assert ANSWER not in response.text
        accepted.append(result)

        subject = await client.get(SUBJECT_URL)
        assert [topic["status"] for topic in subject.json()["topics"]] == [status, "new"]
        assert (await client.get(other_subject)).json()["topics"][0]["status"] == "new"
        assert await list_progress() == {
            **initial_progress,
            ("sample-pack", "math"): {"done": int(status == "done"), "total": 2},
        }

    (history,) = state_dir.glob("*.jsonl")
    contents = history.read_text(encoding="utf-8")
    assert ANSWER not in contents
    entries = [json.loads(line) for line in contents.splitlines()]
    for entry, result in zip(entries, accepted, strict=True):
        assert entry.pop("at")
        assert entry == {"topic_id": "functions", **result}


async def test_teach_back_title_fallback_and_concurrent_appends(
    client: AsyncClient, pack_path: Path, state_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    event_loop_thread = get_ident()
    load_packs = exam_packs.load_packs

    def load_packs_off_loop():
        assert get_ident() != event_loop_thread
        return load_packs()

    monkeypatch.setattr(exam_packs, "load_packs", load_packs_off_loop)
    graphs = pack_path / "topics" / "math" / "graphs.md"
    graphs.write_text(
        graphs.read_text(encoding="utf-8").replace("objectives: [Read a graph]", "objectives: []"),
        encoding="utf-8",
    )
    answers = ["x", "y" * 4000, "Coordinate axes", "A plotted line"]
    seen = []

    async def complete(prompt: str, **kwargs) -> str:
        data = json.loads(prompt)
        assert data["objectives"] == ["Graphs"]
        seen.append(data["learner_text"])
        return json.dumps({"verdict": "not yet", "missing": [0], "feedback": "Describe both axes."})

    monkeypatch.setattr(teachback, "complete", complete)
    responses = await asyncio.gather(
        *(
            client.post(
                f"{SUBJECT_URL}/topics/graphs/teach-back", json={"learner_text": f" {answer} "}
            )
            for answer in answers
        )
    )
    assert sorted(seen) == sorted(answers)
    for response in responses:
        assert response.status_code == 200
        assert response.json()["missing"] == ["Graphs"]
    (history,) = state_dir.glob("*.jsonl")
    entries = [json.loads(line) for line in history.read_text(encoding="utf-8").splitlines()]
    assert [entry["missing"] for entry in entries] == [["Graphs"]] * len(answers)


=======
    async def other_grade(*args, **kwargs) -> str:
        return json.dumps({"verdict": "not yet", "missing": [0], "feedback": "Explain the rule."})

    monkeypatch.setattr(teachback, "complete", other_grade)
    response = await client.post(
        f"{other_subject}/topics/functions/teach-back", json={"learner_text": ANSWER}
    )
    assert response.status_code == 200
    assert (await client.get(other_subject)).json()["topics"][0]["status"] == "learning"
    assert (await client.get(SUBJECT_URL)).json()["topics"][0]["status"] == "done"
    (other_history,) = set(state_dir.glob("*.jsonl")) - {history}
    assert json.loads(other_history.read_text(encoding="utf-8"))["pack_id"] == "other-pack"
    assert history.read_text(encoding="utf-8") == contents


async def test_teach_back_title_fallback_and_concurrent_appends(
    client: AsyncClient, pack_path: Path, state_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    graphs = pack_path / "topics" / "math" / "graphs.md"
    graphs.write_text(
        graphs.read_text(encoding="utf-8").replace("objectives: [Read a graph]", "objectives: []"),
        encoding="utf-8",
    )
    answers = ["x", "y" * 4000, "Coordinate axes", "A plotted line"]
    seen = []

    async def complete(prompt: str, **kwargs) -> str:
        data = json.loads(prompt)
        assert data["objectives"] == ["Graphs"]
        seen.append(data["learner_text"])
        return json.dumps({"verdict": "not yet", "missing": [0], "feedback": "Describe both axes."})

    monkeypatch.setattr(teachback, "complete", complete)
    responses = await asyncio.gather(
        *(
            client.post(
                f"{SUBJECT_URL}/topics/graphs/teach-back", json={"learner_text": f" {answer} "}
            )
            for answer in answers
        )
    )
    assert sorted(seen) == sorted(answers)
    for response in responses:
        assert response.status_code == 200
        assert response.json()["missing"] == ["Graphs"]
    (history,) = state_dir.glob("*.jsonl")
    entries = [json.loads(line) for line in history.read_text(encoding="utf-8").splitlines()]
    assert [entry["missing"] for entry in entries] == [["Graphs"]] * len(answers)


>>>>>>> origin/main
async def test_teach_back_rejections_leave_state_intact(
    client: AsyncClient,
    state_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    url = f"{FUNCTIONS_URL}/teach-back"
    payload = {"learner_text": ANSWER}

    async def unconfigured(*args, **kwargs) -> str:
        raise LLMConfigError(ANSWER)

    monkeypatch.setattr(teachback, "complete", unconfigured)
    for path in (
        url.replace("sample-pack", "missing"),
        url.replace("math", "missing"),
        url.replace("functions", "missing"),
    ):
        assert (await client.post(path, json=payload)).status_code == 404
    for body in (
        {},
        {"learner_text": 123},
        {"learner_text": "  \n"},
        {"learner_text": "x" * 4001},
        [ANSWER],
    ):
        response = await client.post(url, json=body)
        assert response.status_code == 422
        assert ANSWER not in response.text
    assert (await client.post(url, content="{")).status_code == 422
    response = await client.post(url, json=payload)
    assert response.status_code == 503
    assert ANSWER not in response.text
    assert not state_dir.exists()

    grade = {"verdict": "got it", "missing": [], "feedback": "Clear explanation."}
    raw = json.dumps(grade)

    async def complete(*args, **kwargs) -> str:
        return raw

    monkeypatch.setattr(teachback, "complete", complete)
    assert (await client.post(url, json=payload)).status_code == 200
    saved = {path.name: path.read_bytes() for path in state_dir.iterdir()}
    for raw in (
        "incomplete JSON",
        json.dumps({**grade, "verdict": "unknown"}),
        json.dumps({**grade, "verdict": "partly", "missing": [1]}),
        json.dumps({**grade, "verdict": "partly", "missing": ["Define a function"]}),
        json.dumps({**grade, "missing": [0]}),
        json.dumps({**grade, "feedback": "  "}),
        json.dumps({**grade, "feedback": f"You said: {ANSWER}"}),
    ):
        response = await client.post(url, json=payload)
        assert response.status_code == 502
        assert ANSWER not in response.text

    async def failed_provider(*args, **kwargs) -> str:
        raise LLMError(ANSWER)

    monkeypatch.setattr(teachback, "complete", failed_provider)
    response = await client.post(url, json=payload)
    assert response.status_code == 502
    assert ANSWER not in response.text
    assert ANSWER not in caplog.text
    assert {path.name: path.read_bytes() for path in state_dir.iterdir()} == saved
    assert (await client.get(SUBJECT_URL)).json()["topics"][0]["status"] == "done"


async def test_subject_status_falls_back_to_linked_mastery(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def topic_status() -> str:
        return (await client.get(SUBJECT_URL)).json()["topics"][0]["status"]

    linked = await client.post(f"{FUNCTIONS_URL}/mastery-link")
    assert linked.status_code == 200
    path_id = linked.json()["path_id"]
    store = LearningStore()
    progress = store.load(path_id)
    assert progress is not None
    (objective,) = progress.modules[0].knowledge_points
    assert await topic_status() == "new"

    progress.qualitative_mastery[objective.id] = False
    store.save(progress)
    assert await topic_status() == "learning"

    progress.qualitative_mastery[objective.id] = True
    store.save(progress)
    assert await topic_status() == "done"
<<<<<<< HEAD
    packs = (await client.get("/api/exam-packs")).json()
    assert packs[0]["subjects"][0]["progress"] == {"done": 1, "total": 2}
=======
>>>>>>> origin/main

    progress.review_queue = [
        ReviewTask(
            id="due-review",
            knowledge_point_id=objective.id,
            knowledge_type=objective.type,
            due_at=0,
            priority=0,
            state=RepetitionState(next_review_at=0),
        )
    ]
    store.save(progress)
    assert await topic_status() == "review"
<<<<<<< HEAD
    packs = (await client.get("/api/exam-packs")).json()
    assert packs[0]["subjects"][0]["progress"] == {"done": 0, "total": 2}
=======
>>>>>>> origin/main
    before = store.load(path_id)

    async def complete(*args, **kwargs) -> str:
        return json.dumps({"verdict": "not yet", "missing": [0], "feedback": "Explain the rule."})

    monkeypatch.setattr(teachback, "complete", complete)
    response = await client.post(f"{FUNCTIONS_URL}/teach-back", json={"learner_text": ANSWER})
    assert response.status_code == 200
    assert await topic_status() == "learning"
    assert store.load(path_id) == before


async def test_exam_pack_manifest_mount_uses_learning_auth(
    tmp_path: Path, pack_path: Path, state_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DEEPTUTOR_HOME", str(tmp_path))
    monkeypatch.setenv("DEEPTUTOR_EXAM_PACKS_DIR", str(pack_path.parent))
    monkeypatch.setattr(exam_packs, "_packs", None)
    questions = module_routes.manifests()["questions"]
    exam_route = next(
        route for route in questions["routes"] if route["reference"].endswith(".exam_packs:router")
    )
    monkeypatch.setattr(
        module_routes, "manifests", lambda: {"questions": {**questions, "routes": [exam_route]}}
    )
    app = FastAPI()
    module_routes.mount_module_routes(app, RouterLoader(app, lazy=True))

    def deny_learning_access() -> None:
        raise HTTPException(status_code=403)

    app.dependency_overrides[require_learning_surface] = deny_learning_access
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        assert (await client.get("/api/exam-packs")).status_code == 403
        assert (await client.get("/api/exam-packs/sample-pack/subjects/math")).status_code == 403
        assert (await client.get("/api/exam-packs/sample-pack/glossary")).status_code == 403
        assert (await client.post("/api/exam-packs/reload")).status_code == 403
        response = await client.post(f"{FUNCTIONS_URL}/teach-back", json={"learner_text": ANSWER})
        assert response.status_code == 403

        async def authenticated_learner() -> None:
            pass

        async def complete(*args, **kwargs) -> str:
            return json.dumps({"verdict": "got it", "missing": [], "feedback": "Clear explanation."})

        del app.dependency_overrides[require_learning_surface]
        app.dependency_overrides[require_auth] = authenticated_learner
        policy = {"allowed_surfaces": ["reading"]}
        monkeypatch.setattr(learning_access, "current_learning_policy", lambda: policy)
        monkeypatch.setattr(teachback, "complete", complete)
        assert (await client.get("/api/exam-packs")).status_code == 403
        assert (await client.get(SUBJECT_URL)).status_code == 403
        response = await client.post(f"{FUNCTIONS_URL}/teach-back", json={"learner_text": ANSWER})
        assert response.status_code == 403
        assert not state_dir.exists()

        policy["allowed_surfaces"] = ["chat"]
        assert (await client.get("/api/exam-packs")).status_code == 200
        response = await client.post(f"{FUNCTIONS_URL}/teach-back", json={"learner_text": ANSWER})
        assert response.status_code == 200
        subject = await client.get(SUBJECT_URL)
        assert subject.status_code == 200
        assert subject.json()["topics"][0]["status"] == "done"
