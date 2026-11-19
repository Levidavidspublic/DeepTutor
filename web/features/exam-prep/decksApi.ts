import { scopedUrl } from "@/lib/workspace-scope";
import { requestJson } from "@/shared/api/client";

type DeckKind = "csv" | "anki";

export const DECK_FILE_EXTENSIONS = [".csv", ".tsv", ".txt"];
const DECK_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DeckInfo {
  id: string;
  title: string;
  source: DeckKind | "topic";
}

export interface ExamDeckSummary extends DeckInfo {
  card_count: number;
}

export interface ExamDeck extends DeckInfo {
  cards: { front: string; back: string; topic_id?: string }[];
}

function decksPath(packId: string, subjectId: string): string {
  return `/api/exam-packs/${encodeURIComponent(packId)}/subjects/${encodeURIComponent(subjectId)}/decks`;
}

export function listExamDecks(packId: string, subjectId: string): Promise<ExamDeckSummary[]> {
  return requestJson(decksPath(packId, subjectId), { method: "GET" });
}

export async function getExamDeck(packId: string, subjectId: string, deckId: string): Promise<ExamDeck | null> {
  if (!DECK_ID_PATTERN.test(deckId)) return null;
  return requestJson(`${decksPath(packId, subjectId)}/${encodeURIComponent(deckId)}`, { method: "GET" });
}

export async function importExamDeck(
  packId: string,
  subjectId: string,
  file: File,
  signal: AbortSignal,
): Promise<ExamDeck> {
  const extensionIndex = file.name.lastIndexOf(".");
  const extension = file.name.slice(extensionIndex).toLowerCase();
  if (!DECK_FILE_EXTENSIONS.includes(extension)) throw new Error("Unsupported deck file type");

  const path = scopedUrl(decksPath(packId, subjectId));
  const title = file.name.slice(0, extensionIndex);
  const kind: DeckKind = extension === ".csv" ? "csv" : "anki";
  const text = await file.text();
  signal.throwIfAborted();

  return requestJson(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, kind, text }),
    signal,
  });
}
