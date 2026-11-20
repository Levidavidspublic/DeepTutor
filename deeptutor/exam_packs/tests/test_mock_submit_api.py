import asyncio
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import json
from threading import Barrier
from uuid import UUID, uuid4

import pytest

from deeptutor.api.routers import exam_packs
from deeptutor.exam_packs import mock
from deeptutor.exam_packs.models import MockPaper, MockQuestion
from deeptutor.multi_user import paths

from .test_api import keep_loop_responsive as keep_loop_responsive
from .test_loader import pack_path as pack_path
from .test_mock_attempt_api import ATTEMPT_URL
from .test_mock_attempt_api import attempts_dir as attempts_dir
from .test_mock_attempt_api import client as client
from .test_mock_builder import pipeline_run as pipeline_run

pytestmark = pytest.mark.asyncio


@pytest.fixture
def clock(monkeypatch):
    class FrozenDateTime(datetime):
        current = datetime(2027, 2, 3, 12, tzinfo=timezone.utc)

        @classmethod
        def now(cls, tz=None):
            assert tz == timezone.utc
            return cls.current

    monkeypatch.setattr(mock, "datetime", FrozenDateTime)
    return FrozenDateTime


@pytest.fixture
def attempt_url(attempts_dir, clock):
    paper = MockPaper(
        attempt_id=uuid4().hex,
        pack_id="sample-pack",
        subject_id="math",
        questionnaire="001",
        started_at=clock.current,
        minutes=10,
        questions=[
            MockQuestion(
                id=f"q-{index}",
                topic_id=f"topic-{index}",
                prompt=f"Which option equals {index + 1}?",
                options={"A": "1", "B": "2", "C": "3", "D": "4"},
                correct_option=option,
                rationale=f"Option {option} equals {index + 1}.",
                points=points,
            )
            for index, (option, points) in enumerate([("B", 50), ("C", 30), ("D", 20)], start=1)
        ],
    )
    with paths.user_context(paths.local_admin_user()):
        attempt = mock.save_mock_attempt(paper, "en")
    return f"{ATTEMPT_URL}/{attempt.attempt_id}"


async def test_submit_scores_the_stored_paper_and_get_reloads_result(
    client, attempt_url, attempts_dir, clock, pipeline_run, monkeypatch
):
    attempt_id = attempt_url.rsplit("/", 1)[-1]
    initial = await client.get(attempt_url)
    assert initial.status_code == 200
    assert initial.json()["result"] is None

    clock.current += timedelta(minutes=3)
    monkeypatch.setattr(exam_packs, "_packs", [])
    answers = {"q-1": "B", "q-2": "A"}
    response = await client.post(f"{attempt_url}/submit", json={"answers": answers})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result == {
        "attempt_id": attempt_id,
        "marks": {
            "q-1": {"points": 50, "feedback": "Option B equals 2.", "skipped": False},
            "q-2": {"points": 0, "feedback": "Option C equals 3.", "skipped": False},
            "q-3": {"points": 0, "feedback": "Option D equals 4.", "skipped": True},
        },
        "total": 50,
        "max_total": 100,
        "submitted_at": result["submitted_at"],
    }
    assert datetime.fromisoformat(result["submitted_at"]) == clock.current
    record = json.loads((attempts_dir / f"{attempt_id}.json").read_text(encoding="utf-8"))
    assert record["result"] == {**result, "answers": answers}

    reloaded = await client.get(attempt_url)
    assert reloaded.status_code == 200
    assert reloaded.json() == {**initial.json(), "result": result}
    pipeline_run.assert_not_awaited()


@pytest.mark.parametrize(
    ("after_deadline", "status"),
    [(timedelta(seconds=5), 200), (timedelta(seconds=5, microseconds=1), 409)],
)
async def test_submit_enforces_server_deadline_with_transport_grace(
    client, attempt_url, clock, after_deadline, status
):
    clock.current += timedelta(minutes=10) + after_deadline
    response = await client.post(f"{attempt_url}/submit", json={"answers": {}})
    assert response.status_code == status, response.text
    reloaded = await client.get(attempt_url)
    assert reloaded.status_code == 200
    if status == 200:
        result = response.json()
        assert result["total"] == 0
        assert all(mark["skipped"] for mark in result["marks"].values())
        assert reloaded.json()["result"] == result
    else:
        assert reloaded.json()["result"] is None


@pytest.mark.parametrize(
    "body",
    [
        {"answers": {"q-unknown": "A"}},
        {"answers": {"q-1": "E"}},
        {"answers": {"q-1": "b"}},
        {"answers": {"q-1": 2}},
        {"answers": []},
        {},
    ],
)
async def test_submit_rejects_invalid_answers_without_finalizing(client, attempt_url, body):
    response = await client.post(f"{attempt_url}/submit", json=body)
    assert response.status_code == 422
    reloaded = await client.get(attempt_url)
    assert reloaded.status_code == 200
    assert reloaded.json()["result"] is None


async def test_missing_attempt_does_not_create_a_record_or_lock(client, attempt_url, attempts_dir):
    unknown = uuid4()
    response = await client.post(f"{ATTEMPT_URL}/{unknown}/submit", json={"answers": {}})
    assert response.status_code == 404
    assert list(attempts_dir.iterdir()) == [attempts_dir / f"{attempt_url.rsplit('/', 1)[-1]}.json"]


async def test_concurrent_submissions_and_late_retry_keep_first_result(
    client, attempt_url, attempts_dir, clock, monkeypatch
):
    attempt_id = UUID(attempt_url.rsplit("/", 1)[-1])
    lock = mock.exclusive_lock
    write = mock.atomic_write_json
    both_started = Barrier(2)
    writes = []

    @contextmanager
    def wait_for_both(lock_path):
        assert lock_path == attempts_dir / f"{attempt_id}.lock"
        both_started.wait(timeout=5)
        with lock(lock_path):
            yield

    def record_write(path, payload):
        write(path, payload)
        writes.append(payload["result"])

    monkeypatch.setattr(mock, "exclusive_lock", wait_for_both)
    monkeypatch.setattr(mock, "atomic_write_json", record_write)
    submit_url = f"{attempt_url}/submit"
    answers = [{"q-1": "B"}, {"q-2": "C"}]
    first, second = await asyncio.gather(
        *(client.post(submit_url, json={"answers": answer}) for answer in answers)
    )
    assert first.status_code == second.status_code == 200
    result = first.json()
    assert second.json() == result
    assert len(writes) == 1
    assert writes[0]["answers"] in answers
    assert result["total"] == (50 if writes[0]["answers"] == answers[0] else 30)
    record_path = attempts_dir / f"{attempt_id}.json"
    assert json.loads(record_path.read_text(encoding="utf-8"))["result"] == writes[0]

    monkeypatch.setattr(mock, "exclusive_lock", lock)
    clock.current += timedelta(hours=1)
    late_retry = await client.post(submit_url, json={"answers": {"q-3": "D"}})
    assert late_retry.status_code == 200
    assert late_retry.json() == result
    assert len(writes) == 1
