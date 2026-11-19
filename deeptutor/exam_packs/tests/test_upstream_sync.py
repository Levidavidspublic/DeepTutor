"""Offline acceptance checks for the upstream release dry-run report.

The report uses labeled fields for Release tag, Fork main commit, Upstream
release commit, and Result (Clean, Conflicts, or Already contained). Record
the command on its own line and list paths under Conflicted paths and
Unexpected conflicts, using None for an empty list.
"""

from pathlib import Path, PurePosixPath
import re
import shlex

import pytest

pytestmark = pytest.mark.skip(reason="KITCHEN-PENDING #70: feature not built yet")

FORK = Path(__file__).resolve().parents[3] / "fork"
REPORT = FORK / "docs" / "UPSTREAM_SYNC.md"
GUIDE = FORK / "UPSTREAM.md"
MERGE_PROBE = ["git", "merge-tree", "--write-tree", "--name-only"]
CODE_MAPPED_TOUCH_POINTS = {
    "Learning tab list (file found by code map)": "web/components/learning/surfaces.ts",
    "Settings section registry (file found by code map)": (
        "web/features/settings/navigation/settings-nav.ts"
    ),
}


@pytest.fixture
def report() -> str:
    assert REPORT.is_file(), f"Missing upstream dry-run report: {REPORT}"
    return REPORT.read_text(encoding="utf-8")


def _field(report: str, label: str) -> str:
    matches = re.findall(rf"^(?:- )?{re.escape(label)}:[ \t]*(\S[^\n]*)$", report, re.M)
    assert len(matches) == 1, f"Expected one {label} field"
    return matches[0].strip().strip("`")


def _path_list(report: str, heading: str) -> set[str]:
    match = re.search(rf"^## {re.escape(heading)}\n(.*?)(?=^#+ |\Z)", report, re.M | re.S)
    assert match, f"Missing {heading} section"
    body = match[1].strip()
    if body.casefold() in {"none", "none."}:
        return set()

    paths = set()
    for line in body.splitlines():
        if line.strip():
            path = re.fullmatch(r"- `([^`]+)`", line.strip())
            assert path, f"Expected a repository path in {heading}: {line!r}"
            assert path[1] not in paths, f"Duplicate path in {heading}: {path[1]}"
            paths.add(path[1])
    assert paths, f"Use None when {heading} is empty"
    return paths


def _documented_touch_points(guide: str) -> tuple[str, ...]:
    _, heading, section = guide.partition("## Upstream files the fork is allowed to touch\n")
    assert heading, "Missing documented upstream touch points"
    table = section.split("\n## ", 1)[0]
    cells = re.findall(r"^\|\s*([^|]+?)\s*\|", table, re.M)
    points = tuple(
        CODE_MAPPED_TOUCH_POINTS.get(cell, cell.strip("`"))
        for cell in cells
        if cell.startswith("`") or cell in CODE_MAPPED_TOUCH_POINTS
    )
    assert points, "The upstream touch point table is empty"
    return points


def _unexpected_conflicts(paths: set[str], touch_points: tuple[str, ...]) -> set[str]:
    # Root the match so a touch point cannot also match inside another directory.
    return {
        path
        for path in paths
        if not any(PurePosixPath(f"/{path}").match(f"/{pattern}") for pattern in touch_points)
    }


def test_report_pins_release_and_merge_command(report: str) -> None:
    tag = _field(report, "Release tag")
    base = _field(report, "Fork main commit")
    release = _field(report, "Upstream release commit")
    assert re.fullmatch(r"v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?", tag), tag
    for commit in (base, release):
        assert re.fullmatch(r"[0-9a-f]{40}", commit) and commit != "0" * 40, commit

    commands = re.findall(r"^[ \t]*`?(git merge-tree [^`\n]+)`?[ \t]*$", report, re.M)
    assert len(commands) == 1, "Record one merge-tree command"
    assert shlex.split(commands[0]) == [*MERGE_PROBE, base, release]
    if base == release:
        assert _field(report, "Result").casefold() == "already contained"


def test_report_result_and_follow_ups_match_conflicted_paths(report: str) -> None:
    result = _field(report, "Result").casefold()
    assert result in {"clean", "conflicts", "already contained"}

    paths = _path_list(report, "Conflicted paths")
    assert bool(paths) == (result == "conflicts")

    touch_points = _documented_touch_points(GUIDE.read_text(encoding="utf-8"))
    assert _path_list(report, "Unexpected conflicts") == _unexpected_conflicts(paths, touch_points)


@pytest.mark.parametrize(
    ("paths", "unexpected"),
    [
        pytest.param(set(), set(), id="clean"),
        pytest.param(
            {"pyproject.toml", "web/locales/en/exam.json", "web/components/learning/surfaces.ts"},
            set(),
            id="allowlisted-only",
        ),
        pytest.param(
            {
                "deeptutor/api/router_loader.py",
                "deeptutor/api/router_loader.py.bak",
                "vendor/pyproject.toml",
                "web/locales/en/common.json",
                "web/locales/en/extra/exam.json",
                "web/features/settings/navigation/settings-nav.ts",
            },
            {
                "deeptutor/api/router_loader.py.bak",
                "vendor/pyproject.toml",
                "web/locales/en/common.json",
                "web/locales/en/extra/exam.json",
            },
            id="unexpected-alongside-allowlisted",
        ),
    ],
)
def test_conflict_comparison_with_controlled_paths(paths: set[str], unexpected: set[str]) -> None:
    guide = """\
## Upstream files the fork is allowed to touch
| File | Change |
| --- | --- |
| `deeptutor/api/router_loader.py` | Register the exam packs router |
| `pyproject.toml` | Add a pytest test path |
| Learning tab list (file found by code map) | Add Exams |
| Settings section registry (file found by code map) | Add Study comfort |
| `web/locales/*/exam.json` | New files only |

## Other notes
| `web/locales/en/common.json` | Outside the touch point table |
"""
    assert _unexpected_conflicts(paths, _documented_touch_points(guide)) == unexpected
