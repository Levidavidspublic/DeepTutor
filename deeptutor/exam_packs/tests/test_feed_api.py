"""HTTP contracts for importing pasted class feeds into the account Calendar."""

import socket

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from deeptutor.api import module_routes
from deeptutor.api.router_loader import DeferredRouter, RouterLoader
from deeptutor.api.routers import auth
from deeptutor.multi_user import learning_access
from deeptutor.services.auth import TokenPayload
from deeptutor.services.calendar.models import CreateCalendar
from deeptutor.services.calendar.store import get_calendar_store
from deeptutor.services.workspace.activity import WorkspaceActivityMiddleware
from tests.multi_user.conftest import as_user, make_user, mu_isolated_root

pytestmark = pytest.mark.skip(reason="KITCHEN-PENDING #186: feature not built yet")

EXAM_ROUTER = "deeptutor.api.routers.exam_packs:router"
IMPORT_URL = "/api/exam-packs/feed/import"
TZID = "Europe/Berlin"
CLASS_EVENT = "\r\n".join(
    (
        "BEGIN:VEVENT",
        "UID:sample-maths",
        "SUMMARY:Sample maths class",
        "DTSTART:20270708T093000",
        "DTEND:20270708T104500",
        "END:VEVENT",
    )
)
LAB_EVENT = "\r\n".join(
    (
        "BEGIN:VEVENT",
        "UID:sample-lab",
        "SUMMARY:Sample lab",
        "DTSTART:20270708T120000Z",
        "DTEND:20270708T130000Z",
        "END:VEVENT",
    )
)


def _feed(*lines: str) -> str:
    return "\r\n".join(("BEGIN:VCALENDAR", "VERSION:2.0", *lines, "END:VCALENDAR", ""))


def _account(user: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {user}"}


def _import_feed(client, *events, user="alice", **options):
    response = client.post(
        IMPORT_URL,
        headers=_account(user),
        json={"ics_text": _feed(*events), "tzid": TZID, **options},
    )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def packs_dir(tmp_path, monkeypatch):
    directory = tmp_path / "packs"
    directory.mkdir()
    monkeypatch.setenv("DEEPTUTOR_EXAM_PACKS_DIR", str(directory))
    return directory


@pytest.fixture
def client(mu_isolated_root, monkeypatch, packs_dir):
    monkeypatch.setenv("DEEPTUTOR_HOME", str(mu_isolated_root))
    monkeypatch.setattr(auth, "AUTH_ENABLED", True)
    monkeypatch.setattr(
        auth,
        "decode_token",
        lambda token: (
            TokenPayload(username=token, role="user", user_id=token)
            if token in {"alice", "bob"}
            else None
        ),
    )

    def unexpected_dns(*args, **kwargs):
        pytest.fail("The feed import attempted a network lookup")

    monkeypatch.setattr(socket, "getaddrinfo", unexpected_dns)
    questions = module_routes.manifests()["questions"]
    exam_route = next(route for route in questions["routes"] if route["reference"] == EXAM_ROUTER)
    monkeypatch.setattr(
        module_routes, "manifests", lambda: {"questions": {**questions, "routes": [exam_route]}}
    )
    app = FastAPI()
    app.add_middleware(WorkspaceActivityMiddleware)
    module_routes.mount_module_routes(app, RouterLoader(app, lazy=True))
    with TestClient(app) as test_client:
        yield test_client


def test_import_saves_parser_event_in_default_calendar(client, as_user, packs_dir, caplog):
    from deeptutor.exam_packs.feed import parse_feed

    (parsed,) = parse_feed(_feed(CLASS_EVENT), tzid=TZID)
    with as_user("alice"):
        store = get_calendar_store()
    alternate = store.create_calendar(CreateCalendar(name="Other Calendar", color="#112233"))

    with caplog.at_level("DEBUG"):
        assert _import_feed(client, CLASS_EVENT) == {"created": 1, "skipped": 0}

    _, events = store.export()
    (saved,) = events
    assert saved.calendar_id == "default"
    assert store.export(calendar_id=alternate["calendar"].id)[1] == []
    assert saved.id == parsed.event_id
    assert saved.title == "Sample maths class"
    assert saved.start == "2027-07-08T07:30:00Z"
    assert saved.end == "2027-07-08T08:45:00Z"
    assert saved.reminders == []
    assert "UID:sample-maths" not in caplog.text
    assert list(packs_dir.iterdir()) == []


def test_import_counts_existing_ids_without_rewriting_them(client, as_user):
    with as_user("alice"):
        store = get_calendar_store()

    assert _import_feed(client, CLASS_EVENT) == {"created": 1, "skipped": 0}
    (original,) = store.export()[1]
    edited_class = CLASS_EVENT.replace("Sample maths class", "Renamed maths class")

    assert _import_feed(client, edited_class, LAB_EVENT, remind=True) == {"created": 1, "skipped": 1}
    saved = store.export()
    events = {event.id: event for event in saved[1]}
    assert events.pop(original.id) == original
    (lab,) = events.values()
    assert lab.title == "Sample lab"
    assert lab.reminders == [10]

    revision = store.revision()
    assert _import_feed(client, edited_class, LAB_EVENT, remind=True) == {"created": 0, "skipped": 2}
    assert store.export() == saved
    assert store.revision() == revision


def test_same_feed_imports_independently_for_each_account(client, as_user):
    with as_user("alice"):
        alice = get_calendar_store()
    with as_user("bob"):
        bob = get_calendar_store()

    assert _import_feed(client, CLASS_EVENT) == {"created": 1, "skipped": 0}
    (alice_event,) = alice.export()[1]
    assert bob.export()[1] == []

    assert _import_feed(client, CLASS_EVENT, user="bob", remind=True) == {"created": 1, "skipped": 0}
    (bob_event,) = bob.export()[1]
    assert bob_event.id == alice_event.id
    assert bob_event.reminders == [10]
    assert alice.export()[1] == [alice_event]


def test_import_requires_plan_route_authentication_and_learning_access(client, as_user, monkeypatch):
    body = {"ics_text": _feed(CLASS_EVENT), "tzid": TZID}
    assert client.post(IMPORT_URL, json=body).status_code == 401

    monkeypatch.setattr(
        learning_access, "current_learning_policy", lambda: {"allowed_surfaces": ["reading"]}
    )
    response = client.post(IMPORT_URL, headers=_account("alice"), json=body)
    assert response.status_code == 403, response.text
    with as_user("alice"):
        assert get_calendar_store().export()[1] == []


@pytest.mark.parametrize(
    "changes",
    [
        pytest.param({"ics_text": CLASS_EVENT}, id="missing-calendar-header"),
        pytest.param({"ics_text": "https://calendar.example.invalid/classes.ics"}, id="url-as-text"),
        pytest.param({"tzid": "Invalid/StudyZone"}, id="unknown-request-timezone"),
    ],
)
def test_invalid_feed_or_timezone_returns_plain_422_without_writing(client, as_user, changes):
    body = {"ics_text": _feed(LAB_EVENT), "tzid": TZID, **changes}
    response = client.post(IMPORT_URL, headers=_account("alice"), json=body)

    assert response.status_code == 422, response.text
    detail = response.json()["detail"]
    assert isinstance(detail, str) and detail.strip()
    with as_user("alice"):
        assert get_calendar_store().export()[1] == []


def test_import_requires_ics_text_instead_of_a_url_field(client):
    response = client.post(
        IMPORT_URL,
        headers=_account("alice"),
        json={"url": "https://calendar.example.invalid/classes.ics", "tzid": TZID},
    )
    assert response.status_code == 422, response.text


def test_import_limits_ics_text_to_one_million_characters(client, as_user):
    with as_user("alice"):
        store = get_calendar_store()
    padding = "é" * (1_000_000 - len(_feed("X-PADDING:", CLASS_EVENT)))
    at_limit = _feed(f"X-PADDING:{padding}", CLASS_EVENT)
    over_limit = _feed(f"X-PADDING:{padding}é", CLASS_EVENT)

    response = client.post(
        IMPORT_URL, headers=_account("alice"), json={"ics_text": over_limit, "tzid": TZID}
    )
    assert response.status_code == 422
    assert store.export()[1] == []

    response = client.post(
        IMPORT_URL, headers=_account("alice"), json={"ics_text": at_limit, "tzid": TZID}
    )
    assert response.status_code == 200
    assert response.json() == {"created": 1, "skipped": 0}


def test_literal_import_route_is_registered_before_pack_routes_and_in_lazy_index(client):
    from deeptutor.api.routers import exam_packs

    paths = [route.path for route in exam_packs.router.routes]
    first_pack_route = next(path for path in paths if path.startswith("/{pack}"))
    assert paths.index("/feed/import") < paths.index(first_pack_route)
    assert any(
        isinstance(route, DeferredRouter) and route.reference == EXAM_ROUTER
        for route in client.app.routes
    ), "The Exam Packs router index is stale. Run scripts/build_router_index.py."

    assert _import_feed(client) == {"created": 0, "skipped": 0}
