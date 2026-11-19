"""HTTP contracts for the runtime Exam Pack PDF catalog and original files."""

from email.message import Message
import json
from urllib.parse import quote

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

pytestmark = pytest.mark.skip(reason="KITCHEN-PENDING #66: feature not built yet")

PACKS_URL = "/api/exam-packs"
CATALOG_URL = f"{PACKS_URL}/sample-pack/materials"
FIRST_PDF = "01 algebra.v2.pdf"
SECOND_PDF = "02-geometry.pdf"
FIRST_MATERIAL = {"id": FIRST_PDF, "title": "01 algebra.v2"}
SECOND_MATERIAL = {"id": SECOND_PDF, "title": "02-geometry"}
PDF_URL = f"{CATALOG_URL}/{quote(FIRST_PDF)}"


@pytest.fixture
def sample_pdf():
    import pymupdf

    with pymupdf.open() as document:
        document.new_page().insert_text((72, 72), "Synthetic exam notes")
        return document.tobytes()


@pytest.fixture
def pack_root(tmp_path, monkeypatch, sample_pdf):
    root = tmp_path / "exam-packs"
    monkeypatch.setenv("DEEPTUTOR_EXAM_PACKS_DIR", str(root))

    for pack_id in ("sample-pack", "other-pack", "empty-pack", "linked-pack"):
        pack = root / pack_id
        pack.mkdir(parents=True)
        metadata = {
            "id": pack_id,
            "title": pack_id,
            "exam": "Sample Exam",
            "source_lang": "en",
            "ui_lang": "en",
            "subjects": [],
        }
        (pack / "pack.json").write_text(json.dumps(metadata), encoding="utf-8")
        (pack / "glossary.csv").write_text(
            "term_source,term_ui,note,topic_ids\n", encoding="utf-8"
        )

    other_materials = root / "other-pack" / "materials"
    other_materials.mkdir()
    other_pdf = other_materials / "other-pack.pdf"
    other_pdf.write_bytes(sample_pdf)
    (root / "linked-pack" / "materials").symlink_to(other_materials, target_is_directory=True)

    materials = root / "sample-pack" / "materials"
    (materials / "nested").mkdir(parents=True)
    (materials / "folder.pdf").mkdir()
    (materials / "nested" / "nested.pdf").write_bytes(sample_pdf)
    (materials / "notes.txt").write_text("Synthetic notes", encoding="utf-8")
    (materials / SECOND_PDF).write_bytes(sample_pdf)
    (materials / FIRST_PDF).write_bytes(sample_pdf)
    (materials / "inside-link.pdf").symlink_to(FIRST_PDF)
    (materials / "outside-link.pdf").symlink_to(other_pdf)


@pytest.fixture
def make_client(tmp_path, monkeypatch, pack_root):
    monkeypatch.setenv("DEEPTUTOR_HOME", str(tmp_path))

    from deeptutor.api import module_routes
    from deeptutor.api.router_loader import RouterLoader
    from deeptutor.api.routers import auth
    from deeptutor.multi_user import learning_access, paths
    from deeptutor.services.auth import TokenPayload
    from deeptutor.services.workspace.activity import WorkspaceActivityMiddleware

    monkeypatch.setattr(paths, "USERS_ROOT", tmp_path / "data" / "users")
    monkeypatch.setattr(paths, "LEGACY_MULTI_USER_ROOT", tmp_path / "multi-user")
    monkeypatch.setattr(paths, "_legacy_migration_done", False)
    monkeypatch.setattr(paths, "_path_services", {})
    accounts = {
        "reader": TokenPayload(username="reader", role="user", user_id="reader"),
        "learner": TokenPayload(username="learner", role="user", user_id="learner"),
    }
    monkeypatch.setattr(auth, "AUTH_ENABLED", True)
    monkeypatch.setattr(auth, "decode_token", accounts.get)

    def client(exam_packs, *, account="reader", policy=None):
        monkeypatch.setattr(exam_packs, "_packs", None)
        monkeypatch.setattr(
            learning_access,
            "learning_policy_for_user",
            lambda user_id, **_: policy if user_id == "learner" else None,
        )
        questions = module_routes.manifests()["questions"]
        exam_routes = [
            route
            for route in questions["routes"]
            if route["reference"] == "deeptutor.api.routers.exam_packs:router"
        ]
        monkeypatch.setattr(
            module_routes, "manifests", lambda: {"questions": {**questions, "routes": exam_routes}}
        )
        app = FastAPI()
        app.add_middleware(WorkspaceActivityMiddleware)
        module_routes.mount_module_routes(app, RouterLoader(app))
        headers = {"Authorization": f"Bearer {account}"} if account else {}
        return TestClient(app, headers=headers)

    return client


def assert_pdf_headers(response, disposition):
    assert response.headers["content-type"] == "application/pdf"
    cache_directives = {
        directive.strip().lower() for directive in response.headers["cache-control"].split(",")
    }
    assert "no-store" in cache_directives

    headers = Message()
    headers["Content-Disposition"] = response.headers["content-disposition"]
    assert headers.get_content_disposition() == disposition
    assert headers.get_filename() == FIRST_PDF


def test_catalog_lists_sorted_direct_child_pdfs_with_only_public_metadata(make_client):
    from deeptutor.api.routers import exam_packs

    with make_client(exam_packs) as client:
        response = client.get(CATALOG_URL)
        assert response.status_code == 200
        assert response.json() == [FIRST_MATERIAL, SECOND_MATERIAL]

        response = client.get(f"{PACKS_URL}/empty-pack/materials")
        assert response.status_code == 200
        assert response.json() == []

        assert client.get(f"{PACKS_URL}/missing-pack/materials").status_code == 404


@pytest.mark.parametrize(("download", "disposition"), [("false", "inline"), ("true", "attachment")])
def test_file_serves_original_pdf_with_requested_disposition(
    make_client, sample_pdf, download, disposition
):
    from deeptutor.api.routers import exam_packs

    with make_client(exam_packs) as client:
        response = client.get(PDF_URL, params={"download": download})

    assert response.status_code == 200
    assert_pdf_headers(response, disposition)
    assert response.content == sample_pdf


def test_inline_file_serves_the_requested_byte_range(make_client, sample_pdf):
    from deeptutor.api.routers import exam_packs

    with make_client(exam_packs) as client:
        response = client.get(PDF_URL, headers={"Range": "bytes=0-7"})

    assert response.status_code == 206
    assert_pdf_headers(response, "inline")
    assert response.headers["accept-ranges"] == "bytes"
    assert response.headers["content-range"] == f"bytes 0-7/{len(sample_pdf)}"
    assert response.content == sample_pdf[:8]


@pytest.mark.parametrize("url", [CATALOG_URL, PDF_URL, f"{PDF_URL}?download=true"])
def test_material_routes_require_authentication(make_client, url):
    from deeptutor.api.routers import exam_packs

    with make_client(exam_packs, account=None) as client:
        assert client.get(url).status_code == 401


def test_material_routes_require_reading_surface_access(make_client):
    from deeptutor.api.routers import exam_packs

    policy = {"allowed_surfaces": ["chat"], "reading": {"material_ids": ["*"]}}
    with make_client(exam_packs, account="learner", policy=policy) as client:
        assert client.get(CATALOG_URL).status_code == 403
        assert client.get(PDF_URL).status_code == 403
        assert client.get(PDF_URL, params={"download": "true"}).status_code == 403


def test_catalog_and_file_apply_reading_material_assignments(make_client):
    from deeptutor.api.routers import exam_packs

    policy = {
        "allowed_surfaces": ["chat", "reading"],
        "reading": {"material_ids": [FIRST_PDF]},
    }
    with make_client(exam_packs, account="learner", policy=policy) as client:
        response = client.get(CATALOG_URL)
        assert response.status_code == 200
        assert response.json() == [FIRST_MATERIAL]
        assert client.get(PDF_URL).status_code == 200

        denied_url = f"{CATALOG_URL}/{SECOND_PDF}"
        assert client.get(denied_url).status_code == 403
        assert client.get(denied_url, params={"download": "true"}).status_code == 403


@pytest.mark.parametrize(
    "material_path",
    [
        "notes.txt",
        "folder.pdf",
        "nested/nested.pdf",
        "inside-link.pdf",
        "outside-link.pdf",
        "other-pack.pdf",
    ],
)
def test_file_rejects_paths_outside_the_selected_pack_catalog(make_client, material_path):
    from deeptutor.api.routers import exam_packs

    url = f"{CATALOG_URL}/{quote(material_path, safe='')}"
    with make_client(exam_packs) as client:
        assert client.get(url).status_code == 404


def test_symlinked_materials_directory_cannot_expose_another_pack(make_client):
    from deeptutor.api.routers import exam_packs

    url = f"{PACKS_URL}/linked-pack/materials"
    with make_client(exam_packs) as client:
        response = client.get(url)
        assert response.status_code == 200
        assert response.json() == []
        assert client.get(f"{url}/other-pack.pdf").status_code == 404
