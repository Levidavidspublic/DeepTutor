import { requestJson } from "@/shared/api/client";

import type { ExamPackSummary, ExamSubjectDetail, GlossaryTerm } from "./types";

const EXAM_PACKS_PATH = "/api/exam-packs";

export function listExamPacks(): Promise<ExamPackSummary[]> {
  return requestJson(EXAM_PACKS_PATH, { method: "GET" });
}

export function getExamSubject(
  packId: string,
  subjectId: string,
): Promise<ExamSubjectDetail> {
  const path = `${EXAM_PACKS_PATH}/${encodeURIComponent(packId)}/subjects/${encodeURIComponent(subjectId)}`;
  return requestJson(path, { method: "GET" });
}

export function getGlossary(packId: string, q?: string): Promise<GlossaryTerm[]> {
  const path = `${EXAM_PACKS_PATH}/${encodeURIComponent(packId)}/glossary`;
  const query = q === undefined ? "" : `?${new URLSearchParams({ q })}`;
  return requestJson(`${path}${query}`, { method: "GET" });
}

export function reloadExamPacks(): Promise<{ count: number }> {
  return requestJson(`${EXAM_PACKS_PATH}/reload`, { method: "POST" });
}
