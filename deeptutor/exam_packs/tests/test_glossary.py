from pathlib import Path

import pytest

from deeptutor.exam_packs.glossary import find_terms, terms_for_topic
from deeptutor.exam_packs.models import ExamPack, GlossaryTerm


@pytest.fixture
def pack(tmp_path: Path) -> ExamPack:
    return ExamPack(
        id="sample-pack",
        title="Sample Pack",
        exam="Sample Exam",
        source_lang="he",
        ui_lang="en",
        subjects=[],
        path=tmp_path,
        glossary=[
            GlossaryTerm("פונקציה", "Function", "One output per input", ["functions", "graphs"]),
            GlossaryTerm("גרף", "Graph", "A visual representation", ["graphs"]),
        ],
    )


def test_finds_ui_term_ignoring_case(pack: ExamPack) -> None:
    assert find_terms(pack, "Define a (FUNCTION).") == [pack.glossary[0]]


def test_finds_source_term_inside_a_word(pack: ExamPack) -> None:
    assert find_terms(pack, "הפונקציה") == [pack.glossary[0]]


def test_source_term_is_case_sensitive(pack: ExamPack) -> None:
    term = GlossaryTerm("Função", "Function", "", ["functions"])
    pack.glossary = [term]

    assert find_terms(pack, "função") == []
    assert find_terms(pack, "Uma Função") == [term]


def test_ui_term_requires_whole_word(pack: ExamPack) -> None:
    assert find_terms(pack, "A functional malfunction with a function_name") == []


def test_ui_term_matches_literal_punctuation(pack: ExamPack) -> None:
    term = GlossaryTerm("שפת תכנות", "C++", "", ["programming"])
    pack.glossary.append(term)

    assert find_terms(pack, "Use (c++).") == [term]


def test_ignores_empty_spellings(pack: ExamPack) -> None:
    pack.glossary.extend([GlossaryTerm("", "Network", "", []), GlossaryTerm("רשת", "", "", [])])

    assert find_terms(pack, "No matching terms.") == []


def test_returns_each_matching_term_once(pack: ExamPack) -> None:
    pack.glossary.append(
        GlossaryTerm("פונקציה", "Function", "One output per input", ["functions", "graphs"])
    )

    assert find_terms(pack, "Function, פונקציה, and function") == [pack.glossary[0]]


@pytest.mark.parametrize("text", ["Graph, function, גרף", "גרף, function, graph"])
def test_orders_by_first_match_in_either_language(pack: ExamPack, text: str) -> None:
    assert find_terms(pack, text) == [pack.glossary[1], pack.glossary[0]]


def test_terms_for_topic(pack: ExamPack) -> None:
    assert terms_for_topic(pack, "graphs") == pack.glossary
    assert terms_for_topic(pack, "functions") == [pack.glossary[0]]
    assert terms_for_topic(pack, "graph") == []
