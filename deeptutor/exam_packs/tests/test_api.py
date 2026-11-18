import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from deeptutor.api.routers import exam_packs

from .test_loader import pack_path as pack_path


def test_exam_pack_routes(pack_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEEPTUTOR_EXAM_PACKS_DIR", str(pack_path.parent))
    monkeypatch.setattr(exam_packs, "_packs", None)
    app = FastAPI()
    app.include_router(exam_packs.router)

    with TestClient(app) as client:
        response = client.get("/exam-packs")
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

        response = client.get("/exam-packs/sample-pack/subjects/math")
        assert response.status_code == 200
        assert response.json() == {
            "id": "math",
            "title": "Math",
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
                },
                {
                    "id": "graphs",
                    "title": "Graphs",
                    "title_source": "גרפים",
                    "weight": 0.25,
                    "objectives": ["Read a graph"],
                },
            ],
        }

        glossary_url = "/exam-packs/sample-pack/glossary"
        response = client.get(glossary_url)
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
        response = client.get(glossary_url, params={"q": "Draw a גרף."})
        assert response.status_code == 200
        assert response.json() == [glossary[1]]

        assert client.get("/exam-packs/missing/glossary").status_code == 404
        assert client.get("/exam-packs/sample-pack/subjects/missing").status_code == 404

        metadata_path = pack_path / "pack.json"
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        metadata["title"] = "Updated Sample Pack"
        metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
        assert client.get("/exam-packs").json()[0]["title"] == "Sample Pack"

        response = client.post("/exam-packs/reload")
        assert response.status_code == 200
        assert response.json() == {"count": 1}
        assert client.get("/exam-packs").json()[0]["title"] == "Updated Sample Pack"
