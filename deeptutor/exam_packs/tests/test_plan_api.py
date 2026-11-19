"""HTTP contracts for Exam Packs plans and account-local Calendar sessions."""

from contextlib import contextmanager
from datetime import datetime, time, timedelta, timezone
import json
import re
from zoneinfo import ZoneInfo

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
import pytest

from deeptutor.api import module_routes
from deeptutor.api.router_loader import RouterLoader
from deeptutor.api.routers import auth
from deeptutor.modules import catalog
from deeptutor.multi_user import learning_access
from deeptutor.multi_user.paths import get_account_path_service
from deeptutor.services.auth import TokenPayload
from deeptutor.services.calendar.models import CreateCalendar, EventInput
from deeptutor.services.calendar.recurrence import parse_instant
from deeptutor.services.calendar.store import CalendarStore, get_calendar_store
from deeptutor.services.workspace.activity import WorkspaceActivityMiddleware
from tests.multi_user.conftest import as_user, make_user, mu_isolated_root

pytestmark = pytest.mark.skip(reason="KITCHEN-PENDING #63: feature not built yet")

PACKS_URL = "/api/exam-packs"
PLAN_URL = f"{PACKS_URL}/sample-pack/plan"


@pytest.fixture
def exam_day(tmp_path, monkeypatch):
    day = datetime.now(timezone.utc).date() + timedelta(days=20)
    root = tmp_path / "packs"
    monkeypatch.setenv("DEEPTUTOR_EXAM_PACKS_DIR", str(root))

    def subject(subject_id, title, weights):
        return {
            "id": subject_id,
            "title": title,
            "title_source": title,
            "questionnaires": [
                {"code": "001", "title": "Basics", "minutes": 60, "topic_weights": weights}
            ],
            "exam_dates": [day.isoformat()],
        }

    math = subject("math", "Math", {"functions": 0.75, "graphs": 0.25})
    science = subject("science", "Science", {"motion": 1.0})
    for pack_id in ("sample-pack", "other-pack"):
        directory = root / pack_id
        directory.mkdir(parents=True)
        metadata = {
            "id": pack_id,
            "title": "Sample Pack" if pack_id == "sample-pack" else "Other Pack",
            "exam": "Sample Exam",
            "source_lang": "en",
            "ui_lang": "en",
            "subjects": [math, science],
        }
        (directory / "pack.json").write_text(json.dumps(metadata), encoding="utf-8")
        (directory / "glossary.csv").write_text(
            "term_source,term_ui,note,topic_ids\n", encoding="utf-8"
        )
        for item in metadata["subjects"]:
            topics = directory / "topics" / item["id"]
            topics.mkdir(parents=True)
            for topic_id, weight in item["questionnaires"][0]["topic_weights"].items():
                (topics / f"{topic_id}.md").write_text(
                    f'---\nid: {topic_id}\ntitle: {topic_id.title()}\n'
                    f'title_source: {topic_id.title()}\nquestionnaire: "001"\n'
                    f"weight: {weight}\nobjectives: [Explain the topic]\n---\nSample topic.\n",
                    encoding="utf-8",
                )
    return day


@pytest.fixture
def plan_body(exam_day):
    return {
        "subject_id": "math",
        "start": (exam_day - timedelta(days=1)).isoformat(),
        "tzid": "Europe/Berlin",
        "mode": "preview",
    }


@pytest.fixture
def make_client(mu_isolated_root, monkeypatch, exam_day):
    monkeypatch.setenv("DEEPTUTOR_HOME", str(mu_isolated_root))
    monkeypatch.setattr(auth, "AUTH_ENABLED", True)
    monkeypatch.setattr(
        auth,
        "decode_token",
        lambda token: TokenPayload(username=token, role="user", user_id=token)
        if token in {"alice", "bob"}
        else None,
    )

    def client(exam_packs, *, exam_auth_only=False):
        monkeypatch.setattr(exam_packs, "_packs", None)
        manifests = catalog.manifests()
        questions = manifests["questions"]
        exam_route = next(
            route for route in questions["routes"]
            if route["reference"] == "deeptutor.api.routers.exam_packs:router"
        )
        if exam_auth_only:
            # Both routes currently share the chat surface. Let an authenticated
            # request reach the Exams handler to exercise its own Calendar gate.
            exam_route = {**exam_route, "auth": "authenticated"}
        monkeypatch.setattr(
            module_routes,
            "manifests",
            lambda: {
                "questions": {**questions, "routes": [exam_route]},
                "calendar": manifests["calendar"],
            },
        )
        app = FastAPI()
        app.add_middleware(WorkspaceActivityMiddleware)

        @app.exception_handler(catalog.ModuleUnavailable)
        async def module_unavailable(_request: Request, exc: catalog.ModuleUnavailable):
            return JSONResponse(status_code=409, content={"detail": str(exc)})

        module_routes.mount_module_routes(app, RouterLoader(app, lazy=True))
        return TestClient(app, headers=account("alice"))

    return client


def account(user):
    return {"Authorization": f"Bearer {user}"}


def plan(client, body, *, url=PLAN_URL, user="alice"):
    response = client.post(url, json=body, headers=account(user))
    expected_statuses = {200, 201} if body["mode"] == "create" else {200}
    assert response.status_code in expected_statuses, response.text
    return response.json()


def summaries(client, user="alice"):
    response = client.get(PACKS_URL, headers=account(user))
    assert response.status_code == 200, response.text
    return {
        (pack["id"], subject["id"]): subject
        for pack in response.json()
        for subject in pack["subjects"]
    }


def test_preview_uses_pack_exam_date_and_leaves_calendar_untouched(
    make_client, plan_body, exam_day, as_user
):
    from deeptutor.api.routers import exam_packs

    with as_user("alice"):
        calendar_path = get_account_path_service().get_runtime_state_dir() / "calendar"
    assert not calendar_path.exists()

    with make_client(exam_packs) as client:
        preview = plan(client, plan_body)

    assert preview["exam_date"] == exam_day.isoformat()
    unscheduled = preview["unscheduled"]
    assert isinstance(unscheduled, list)
    assert len(unscheduled) == 1
    (session,) = preview["sessions"]
    assert session["topic_id"] == "functions"
    assert session["title"]
    start = parse_instant(session["start"])
    local_start = start.astimezone(ZoneInfo(plan_body["tzid"]))
    assert local_start.date().isoformat() == plan_body["start"]
    assert local_start.time() == time(18)
    assert parse_instant(session["end"]) - start == timedelta(minutes=30)
    assert session["reminders"] == []
    assert session["event_id"] is None
    assert not calendar_path.exists()


def test_create_matches_preview_and_replay_preserves_calendar_rows(
    make_client, plan_body, exam_day, as_user
):
    from deeptutor.api.routers import exam_packs

    body = {
        **plan_body,
        "exam_date": (exam_day + timedelta(days=2)).isoformat(),
        "reminders": True,
    }
    with as_user("alice"):
        store = get_calendar_store()
    before = store.export()
    before_revision = store.revision()

    with make_client(exam_packs) as client:
        preview = plan(client, body)
        assert preview["exam_date"] == body["exam_date"]
        assert preview["unscheduled"] == []
        assert {session["topic_id"] for session in preview["sessions"]} == {"functions", "graphs"}
        assert all(session["event_id"] is None for session in preview["sessions"])
        assert store.export() == before
        assert store.revision() == before_revision

        created = plan(client, {**body, "mode": "create"})
        sessions_without_ids = [{**session, "event_id": None} for session in created["sessions"]]
        assert {**created, "sessions": sessions_without_ids} == preview
        event_ids = {session["event_id"] for session in created["sessions"]}
        assert len(event_ids) == 2
        assert all(event_ids)
        saved = store.export()
        events = {event.id: event for event in saved[1]}
        assert events.keys() == event_ids
        for session in created["sessions"]:
            event = events[session["event_id"]]
            assert event.calendar_id == "default"
            assert event.title == session["title"]
            assert parse_instant(event.start) == parse_instant(session["start"])
            assert parse_instant(event.end) == parse_instant(session["end"])
            assert event.tzid == body["tzid"]
            assert event.reminders == session["reminders"] == [10]

        saved_revision = store.revision()
        assert saved_revision > before_revision
        assert plan(client, {**body, "mode": "create"}) == created
        assert store.export() == saved
        assert store.revision() == saved_revision


@pytest.mark.parametrize(
    ("url", "changes", "status"),
    [
        (f"{PACKS_URL}/missing/plan", {}, 404),
        (PLAN_URL, {"subject_id": "missing"}, 404),
        (PLAN_URL, {"start": "tomorrow"}, 422),
        (PLAN_URL, {"exam_date": "yesterday"}, 422),
        (PLAN_URL, {"exam_date": "2000-01-01"}, 422),
        (PLAN_URL, {"tzid": "Not/AZone"}, 422),
        (PLAN_URL, {"mode": "replace"}, 422),
    ],
)
def test_invalid_plan_requests_leave_calendar_untouched(
    make_client, plan_body, as_user, url, changes, status
):
    from deeptutor.api.routers import exam_packs

    with as_user("alice"):
        calendar_path = get_account_path_service().get_runtime_state_dir() / "calendar"
    with make_client(exam_packs) as client:
        response = client.post(url, json={**plan_body, "mode": "create", **changes})
        assert response.status_code == status, response.text
    assert not calendar_path.exists()


def test_list_selects_earliest_future_plan_per_account_pack_and_subject(
    make_client, plan_body, exam_day, as_user, monkeypatch
):
    from deeptutor.api.routers import exam_packs

    def save(client, days_before_exam, *, url=PLAN_URL, user="alice", subject="math"):
        body = {
            **plan_body,
            "start": (exam_day - timedelta(days=days_before_exam)).isoformat(),
            "mode": "create",
            "subject_id": subject,
        }
        return plan(client, body, url=url, user=user)["sessions"]

    with make_client(exam_packs) as client:
        alice_plan = save(client, 5)
        assert len(alice_plan) == 2
        alice_first = min(alice_plan, key=lambda item: parse_instant(item["start"]))
        (science,) = save(client, 6, subject="science")
        other_pack_first = min(
            save(client, 7, url=f"{PACKS_URL}/other-pack/plan"),
            key=lambda item: parse_instant(item["start"]),
        )
        bob_first = min(save(client, 8, user="bob"), key=lambda item: parse_instant(item["start"]))

        with as_user("alice"):
            store = get_calendar_store()
        # Use a saved session to preserve the real marker when making the past
        # session and the matching session in a non-default calendar.
        original = next(event for event in store.export()[1] if event.id == alice_first["event_id"])
        store.create(
            EventInput(
                title=original.title,
                notes=original.notes,
                start="2000-01-01T18:00:00Z",
                end="2000-01-01T18:30:00Z",
            )
        )
        alternate = store.create_calendar(CreateCalendar(name="Other Calendar", color="#112233"))
        earlier = {
            "title": original.title,
            "start": f"{exam_day - timedelta(days=9)}T18:00:00Z",
            "end": f"{exam_day - timedelta(days=9)}T18:30:00Z",
        }
        store.create(EventInput(**earlier))
        store.create(
            EventInput(**earlier, notes=original.notes, calendar_id=alternate["calendar"].id)
        )

        calendar_queries = []
        connect = CalendarStore.connect

        @contextmanager
        def trace_calendar_reads(self, **kwargs):
            with connect(self, **kwargs) as connection:
                connection.set_trace_callback(calendar_queries.append)
                yield connection

        monkeypatch.setattr(CalendarStore, "connect", trace_calendar_reads)
        alice = summaries(client)
        assert sum(
            bool(re.search(r"\bfrom\s+events\b", sql, re.IGNORECASE)) for sql in calendar_queries
        ) == 1
        bob = summaries(client, "bob")

    def next_session(session):
        return {key: session[key] for key in ("event_id", "title", "start")}

    assert alice[("sample-pack", "math")] == {
        "id": "math",
        "title": "Math",
        "title_source": "Math",
        "progress": {"done": 0, "total": 2},
        "exam_date": exam_day.isoformat(),
        "next_session": next_session(alice_first),
    }
    assert alice[("sample-pack", "science")]["next_session"] == next_session(science)
    assert alice[("other-pack", "math")]["next_session"] == next_session(other_pack_first)
    assert alice[("other-pack", "science")]["next_session"] is None
    assert bob[("sample-pack", "math")]["next_session"] == next_session(bob_first)
    assert bob[("sample-pack", "science")]["next_session"] is None
    assert bob[("other-pack", "math")]["next_session"] is None


@pytest.mark.parametrize("gate", ["module", "account"])
def test_calendar_gates_reject_planning_and_leave_next_session_null(
    make_client, plan_body, monkeypatch, gate
):
    from deeptutor.api.routers import exam_packs

    def unexpected_store(*args, **kwargs):
        pytest.fail("Calendar access reached the store before checking permissions")

    monkeypatch.setattr(CalendarStore, "__init__", unexpected_store)
    if gate == "module":
        monkeypatch.setattr(catalog, "selection", lambda: {"calendar": False})
        expected_status = 409
    else:
        monkeypatch.setattr(
            learning_access, "current_learning_policy", lambda: {"allowed_surfaces": ["reading"]}
        )
        expected_status = 403

    with make_client(exam_packs, exam_auth_only=gate == "account") as client:
        calendar = client.get("/api/calendar/calendars")
        assert calendar.status_code == (404 if gate == "module" else 403), calendar.text
        for mode in ("preview", "create"):
            response = client.post(PLAN_URL, json={**plan_body, "mode": mode})
            assert response.status_code == expected_status, response.text
        packs = summaries(client)
        assert len(packs) == 4
        assert all(subject["next_session"] is None for subject in packs.values())
