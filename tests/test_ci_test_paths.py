"""Check that the Python CI job covers the configured pytest test paths."""

from pathlib import Path
import re
import shlex
import tomllib

import pytest

ROOT = Path(__file__).resolve().parents[1]
pytestmark = pytest.mark.skip(reason="KITCHEN-PENDING #217: feature not built yet")


def test_python_ci_runs_all_configured_test_paths():
    config = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    testpaths = config["tool"]["pytest"]["ini_options"]["testpaths"]
    workflow = (ROOT / ".github/workflows/tests.yml").read_text(encoding="utf-8")

    flags = re.MULTILINE | re.DOTALL
    job = re.search(r"^  python-tests:[ \t]*\n(.*?)(?=^  \S|\Z)", workflow, flags)
    assert job is not None, "Missing python-tests job in .github/workflows/tests.yml"

    step = re.search(r"^      - name: Run Python tests[ \t]*\n(.*?)(?=^      - |\Z)", job[1], flags)
    assert step is not None, "Missing Run Python tests step in the python-tests job"

    commands = [
        line for line in step[1].splitlines() if line.lstrip().startswith("pytest -q tests")
    ]
    assert len(commands) == 1, "Expected one pytest command in the Run Python tests step"
    ci_paths = shlex.split(commands[0], comments=True)[2:]
    assert set(ci_paths) == set(testpaths), "The CI pytest command must match pyproject.toml testpaths"
