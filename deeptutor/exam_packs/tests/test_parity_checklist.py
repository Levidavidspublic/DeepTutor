"""Acceptance checks for the fork's desk parity sign-off document."""

from collections import Counter
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

from markdown_it import MarkdownIt
from markdown_it.tree import SyntaxTreeNode
import pytest

pytestmark = pytest.mark.skip(reason="KITCHEN-PENDING #69: feature not built yet")

ROOT = Path(__file__).resolve().parents[3]
DOCS = ROOT / "fork" / "docs"
CHECKLIST = DOCS / "PARITY_CHECKLIST.md"
BOX = re.compile(r"^\[([ xX])\](?=\s|$)")


def _markdown(path: Path) -> SyntaxTreeNode:
    parser = MarkdownIt().enable("table")
    return SyntaxTreeNode(parser.parse(path.read_text(encoding="utf-8")))


def _text(node: SyntaxTreeNode) -> str:
    return "".join(part.content for part in node.walk() if part.type in {"text", "code_inline"})


@pytest.fixture
def f3_tools() -> list[str]:
    in_f3 = False
    for block in _markdown(DOCS / "PRD.md").children:
        if block.type == "heading":
            if in_f3:
                break
            in_f3 = _text(block).startswith("F3 ")
        if in_f3 and block.type == "table":
            # The source file citations in the first column are separate from the tool names.
            names = [
                _text(row.children[0]).partition(" (")[0].strip()
                for row in block.walk()
                if row.type == "tr" and row.children[0].type == "td"
            ]
            assert names, "The PRD's F3 table has no study-tool rows"
            return names
    pytest.fail("The PRD's F3 study-tool table is missing")


@pytest.fixture
def checklist() -> SyntaxTreeNode:
    return _markdown(CHECKLIST)


@pytest.fixture
def sign_off_rows(
    checklist: SyntaxTreeNode, f3_tools: list[str]
) -> list[tuple[str, list[SyntaxTreeNode]]]:
    rows = []
    for row in checklist.walk():
        # Accept table rows or task-list items and keep nested items separate.
        fields = [child for child in row.children if child.type in {"td", "paragraph"}]
        if row.type not in {"tr", "list_item"} or not fields:
            continue
        labels = [BOX.sub("", _text(field).strip()).lstrip() for field in fields]
        names = [
            name
            for name in f3_tools
            if any(re.match(rf"{re.escape(name)}\b", label, re.IGNORECASE) for label in labels)
        ]
        assert len(names) <= 1, f"Give each F3 tool its own sign-off row: {names}"
        if names:
            rows.append((names[0], fields))
    return rows


def _local_hrefs(node: SyntaxTreeNode) -> list[str]:
    hrefs = []
    for link in node.walk():
        if link.type == "link":
            href = link.attrs["href"]
            url = urlsplit(href)
            if not url.scheme and not url.netloc:
                hrefs.append(href)
    return hrefs


def test_each_f3_tool_has_one_sign_off_row(f3_tools, sign_off_rows) -> None:
    assert Counter(name for name, _ in sign_off_rows) == Counter(f3_tools)


def test_sign_off_boxes_start_unchecked(f3_tools, sign_off_rows) -> None:
    assert len(sign_off_rows) == len(f3_tools)
    for name, fields in sign_off_rows:
        boxes = [match[1] for field in fields if (match := BOX.match(_text(field).strip()))]
        assert boxes == [" "], f"{name} needs one unchecked [ ] box, found {boxes!r}"


def test_each_sign_off_row_links_to_local_evidence(f3_tools, sign_off_rows) -> None:
    assert len(sign_off_rows) == len(f3_tools)
    for name, fields in sign_off_rows:
        assert any(urlsplit(href).path for field in fields for href in _local_hrefs(field)), (
            f"{name} needs a relative link to repository evidence"
        )


def test_local_checklist_links_resolve(checklist) -> None:
    for href in _local_hrefs(checklist):
        path = Path(unquote(urlsplit(href).path))
        assert not path.is_absolute(), f"Use a relative repository link for {href}"
        target = (DOCS / path).resolve() if path.parts else CHECKLIST
        assert target.is_relative_to(ROOT) and target.exists(), f"Broken local link: {href}"
