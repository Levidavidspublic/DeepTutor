"""Keep private content out of the fork-owned source tree."""

from pathlib import Path
import re

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
FORK_DIRECTORIES = (
    "fork",
    "deeptutor/exam_packs",
    "web/features/exam-prep",
    "web/features/a11y-study",
)

# Assemble the patterns so this file can be scanned along with the rest of the fork.
EMAIL_LOCAL_CHARACTER = r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]"
PRIVATE_CONTENT = re.compile(
    "|".join(
        (
            rf"(?<!{EMAIL_LOCAL_CHARACTER}){EMAIL_LOCAL_CHARACTER}+"
            + "@"
            + r"[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+",
            r"BEGIN(?: [A-Z0-9]+)*" + " PRIVATE KEY",
            r"(?:sk" + r"-|gh[po]" + r"_)[A-Za-z0-9]{20,}",
            re.escape("SOUL" + ".md"),
            re.escape("config/" + "amit"),
        )
    )
)


def _private_content_locations(root: Path) -> list[str]:
    root = root.resolve()
    locations = []
    for name in FORK_DIRECTORIES:
        directory = root / name
        if not directory.is_dir() or directory.resolve() != directory:
            continue
        for path in sorted(directory.rglob("*")):
            if path.is_symlink() or not path.is_file():
                continue
            data = path.read_bytes()
            if b"\0" in data:
                continue
            # Preserve ASCII matches in text files that are not valid UTF-8.
            lines = data.decode("utf-8", errors="surrogateescape").splitlines()
            for line_number, line in enumerate(lines, start=1):
                if PRIVATE_CONTENT.search(line):
                    locations.append(f"{path.relative_to(root)}:{line_number}")
    return locations


def test_fork_files_contain_no_private_content() -> None:
    locations = _private_content_locations(REPOSITORY_ROOT)
    if locations:
        pytest.fail("\n".join(locations), pytrace=False)


def test_guard_reports_fake_key_location(tmp_path: Path) -> None:
    path = tmp_path / "fork" / "example.txt"
    path.parent.mkdir()
    path.write_text("Example\n" + "sk" + "-" + "x" * 20 + "\n", encoding="utf-8")

    assert _private_content_locations(tmp_path) == ["fork/example.txt:2"]
