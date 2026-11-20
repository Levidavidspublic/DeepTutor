import re
from pathlib import Path

import pytest

pytestmark = pytest.mark.skip(reason="KITCHEN-PENDING #223: feature not built yet")

REPO_ROOT = Path(__file__).resolve().parents[1]
IMPORT_MAP = REPO_ROOT / "fork" / "imports" / "STUDYOS-IMPORT.md"
THIRD_PARTY_NOTICES = REPO_ROOT / "THIRD_PARTY_NOTICES.md"


def test_import_map_names_each_studyos_page():
    assert IMPORT_MAP.is_file(), "Missing fork/imports/STUDYOS-IMPORT.md"
    content = IMPORT_MAP.read_text(encoding="utf-8")
    features = (
        "Tasks",
        "Subjects",
        "Notes",
        "Calendar",
        "Focus",
        "Progress",
        "Dashboard",
        "Leaderboard",
        "Groups",
        "Chats",
        "Settings",
    )
    missing = [feature for feature in features if not re.search(rf"\b{feature}\b", content)]

    assert not missing, f"Missing StudyOS features: {', '.join(missing)}"


def test_import_map_has_required_headings():
    lines = IMPORT_MAP.read_text(encoding="utf-8").splitlines()

    for heading in ("## Rules", "## Feature map", "## Licence notes"):
        assert heading in lines, f"Missing import map heading: {heading}"


def test_third_party_notices_credits_studyos():
    content = THIRD_PARTY_NOTICES.read_text(encoding="utf-8")

    for credit in ("StudyOS", "Apache-2.0", "https://github.com/Vaibh37/Studyos"):
        assert credit in content, f"Missing StudyOS attribution: {credit}"
