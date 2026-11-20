import json
from pathlib import Path
from shutil import copytree
from uuid import UUID, uuid4

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
import pytest
import pytest_asyncio

from deeptutor.api import module_routes
from deeptutor.api.router_loader import RouterLoader
from deeptutor.api.routers import auth, exam_packs
from deeptutor.multi_user import paths
from deeptutor.notes.anki_export import render_anki_export
from deeptutor.services.workspace import get_content_workspace_service
from deeptutor.services.workspace.activity import WorkspaceActivityMiddleware

from .test_api import keep_loop_responsive as keep_loop_responsive
from .test_loader import pack_path as pack_path

pytestmark = pytest.mark.asyncio
DECKS_URL = "/api/exam-packs/sample-pack/subjects/math/decks"
STATE_PATH = Path("user/exam_packs_state/decks")
CSV_DECK = {"title": "Functions", "kind": "csv", "text": "front,back\nInput,Output"}


@pytest.fixture
def decks_dir(tmp_path, monkeypatch):
    runtime = tmp_path / "runtime"
    monkeypatch.setenv("DEEPTUTOR_HOME", str(runtime))
    monkeypatch.setattr(paths, "ADMIN_WORKSPACE_ROOT", runtime / "data")
    return runtime / "data" / STATE_PATH


@pytest_asyncio.fixture
async def client(pack_path, decks_dir, monkeypatch):
    metadata_path = pack_path / "pack.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata["subjects"].append(
        {"id": "science", "title": "Science", "title_source": "Science", "questionnaires": []}
    )
    metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
    other_pack = pack_path.with_name("other-pack")
    copytree(pack_path, other_pack)
    (other_pack / "pack.json").write_text(
        json.dumps({**metadata, "id": "other-pack"}), encoding="utf-8"
    )
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


@pytest.mark.parametrize(
    ("kind", "text", "cards"),
    [
        (
            "csv",
            '\ufefffront,back\r\n"Function, graph","A ""rule""\nwith one output"\r\nחזית," תשובה "\r\n',
            [
                {"front": "Function, graph", "back": 'A "rule"\nwith one output'},
                {"front": "חזית", "back": " תשובה "},
            ],
        ),
        (
            "anki",
            "\ufeff"
            + render_anki_export(
                [
                    {
                        "front": "**Rule** & example\nNext line\n\nNext paragraph",
                        "back": "An inequality like `x < 2`.",
                        "page_title": "Example page",
                        "card_id": "example-card",
                    }
                ]
            ),
            [
                {
                    "front": "Rule & example\nNext line\n\nNext paragraph",
                    "back": "An inequality like x < 2.",
                }
            ],
        ),
        (
            "anki",
            "#html:false\n#columns:Front\tBack\n#Topic: 1\t<b>literal text</b>\n",
            [{"front": "#Topic: 1", "back": "<b>literal text</b>"}],
        ),
    ],
)
async def test_deck_round_trip(client, decks_dir, kind, text, cards):
    response = await client.post(DECKS_URL, json={"title": " Functions ", "kind": kind, "text": text})
    assert response.status_code == 200, response.text
    deck_id = response.json()["id"]
    assert UUID(deck_id).version == 4
    summary = {"id": deck_id, "title": "Functions", "source": kind}
    deck = {**summary, "cards": cards}
    assert response.json() == deck

    (record_path,) = decks_dir.iterdir()
    assert record_path.name == f"{deck_id}.json"
    assert json.loads(record_path.read_text(encoding="utf-8")) == {
        **deck,
        "pack_id": "sample-pack",
        "subject_id": "math",
    }
    response = await client.get(DECKS_URL)
    assert response.status_code == 200
    assert response.json() == [{**summary, "card_count": len(cards)}]
    response = await client.get(f"{DECKS_URL}/{deck_id}")
    assert response.status_code == 200
    assert response.json() == deck


async def test_invalid_imports_leave_storage_unchanged(client, decks_dir):
    marker = "Marker phrase"
    bad_row = {"text": f'front,back\n"Example\nfront",answer\n{marker}, '}
    response = await client.post(DECKS_URL, json={**CSV_DECK, **bad_row})
    assert response.status_code == 422
    assert "Row 4" in response.json()["detail"]
    assert marker not in response.text
    assert not decks_dir.exists()

    assert (await client.post(DECKS_URL, json=CSV_DECK)).status_code == 200
    saved = {path.name: path.read_bytes() for path in decks_dir.iterdir()}
    for patch, detail in (
        ({"text": f"{marker},back\nInput,Output"}, "Row 1"),
        ({"text": f'front,back\n"{marker},answer'}, "Row 2"),
        ({"text": f"front,back\n{marker},answer,extra"}, "Row 2"),
        ({"text": f"front,back\n{marker}," + "é" * 65536}, "128 KiB"),
        ({"text": "front,back\n" + f"{marker},answer\n" * 201}, "Row 202"),
        ({"text": "front,back\n"}, "at least one card"),
        ({"kind": "anki", "text": f"#html:true\n{marker}\t<br>&nbsp;"}, "Row 2"),
        ({"kind": "anki", "text": f"#separator:comma\n{marker},answer"}, "Row 1"),
        ({"kind": "anki", "text": f"#notetype:Cloze\n{marker}\tanswer"}, "Row 1"),
        ({"kind": "anki", "text": f"#html:true\n{marker}\t<![unknown]>"}, "Row 2"),
        ({"kind": "apkg", "text": marker}, "Expected"),
        ({"text": {"value": marker}}, "Expected"),
        ({"title": " "}, "nonempty"),
    ):
        response = await client.post(DECKS_URL, json={**CSV_DECK, **patch})
        assert response.status_code == 422
        assert detail in response.json()["detail"]
        assert marker not in response.text
    response = await client.post(DECKS_URL, content=f'{{"text": "{marker}"')
    assert response.status_code == 422
    assert marker not in response.text
    assert {path.name: path.read_bytes() for path in decks_dir.iterdir()} == saved


async def test_import_accepts_exact_byte_and_card_limits(client):
    text = "front,back\n" + "Input,Output\n" * 199 + "Last,"
    text += "x" * (128 * 1024 - len(text))
    response = await client.post(DECKS_URL, json={**CSV_DECK, "text": text})
    assert response.status_code == 200, response.text
    assert len(response.json()["cards"]) == 200


async def test_decks_are_scoped_to_pack_subject_and_workspace(client, decks_dir):
    with paths.user_context(paths.local_admin_user()):
        catalog = get_content_workspace_service()
        first = catalog.create_workspace("Algebra")
        second = catalog.create_workspace("Geometry")
    scope = {"dt_workspace": first["workspace_id"]}
    response = await client.post(DECKS_URL, params=scope, json=CSV_DECK)
    assert response.status_code == 200, response.text
    deck = response.json()
    deck_id = deck["id"]
    deck_url = f"{DECKS_URL}/{deck_id}"
    scoped_dir = Path(first["path"]) / ".deeptutor" / "data" / STATE_PATH
    assert list(scoped_dir.iterdir()) == [scoped_dir / f"{deck_id}.json"]
    assert not decks_dir.exists()

    for url, params in (
        (DECKS_URL, {}),
        (DECKS_URL, {"dt_workspace": second["workspace_id"]}),
        (DECKS_URL.replace("/math/", "/science/"), scope),
        (DECKS_URL.replace("sample-pack", "other-pack"), scope),
    ):
        response = await client.get(url, params=params)
        assert response.status_code == 200
        assert response.json() == []
        assert (await client.get(f"{url}/{deck_id}", params=params)).status_code == 404

    for url in (
        DECKS_URL.replace("sample-pack", "missing"),
        DECKS_URL.replace("/math/", "/missing/"),
    ):
        assert (await client.get(url, params=scope)).status_code == 404
        assert (await client.get(f"{url}/{deck_id}", params=scope)).status_code == 404
        assert (await client.post(url, params=scope, json=CSV_DECK)).status_code == 404
    assert (await client.get(f"{DECKS_URL}/{uuid4()}", params=scope)).status_code == 404
    assert (await client.get(f"{DECKS_URL}/not-a-uuid", params=scope)).status_code == 422
    assert (await client.get(deck_url, params=scope)).json() == deck
    assert list(scoped_dir.iterdir()) == [scoped_dir / f"{deck_id}.json"]
