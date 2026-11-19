"""Look up bilingual terms in an exam pack."""

import re

from .models import ExamPack, GlossaryTerm


def find_terms(pack: ExamPack, text: str) -> list[GlossaryTerm]:
    """Return matching glossary records in order of first appearance."""
    matches: list[tuple[int, GlossaryTerm]] = []
    for term in pack.glossary:
        position = text.find(term.term_source) if term.term_source else -1
        if term.term_ui:
            pattern = rf"(?<!\w){re.escape(term.term_ui)}(?!\w)"
            ui_match = re.search(pattern, text, re.IGNORECASE)
            if ui_match is not None and (position == -1 or ui_match.start() < position):
                position = ui_match.start()
        if position >= 0:
            matches.append((position, term))

    matches.sort(key=lambda match: match[0])
    terms: list[GlossaryTerm] = []
    for _, term in matches:
        if term not in terms:
            terms.append(term)
    return terms


def terms_for_topic(pack: ExamPack, topic_id: str) -> list[GlossaryTerm]:
    """Return the glossary records associated with a topic in pack order."""
    return [term for term in pack.glossary if topic_id in term.topic_ids]
