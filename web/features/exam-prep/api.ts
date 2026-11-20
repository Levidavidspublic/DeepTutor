import { requestJson } from "@/shared/api/client";

import type { ExamPackSummary, ExamSubjectDetail, GlossaryTerm } from "./types";

const EXAM_PACKS_PATH = "/api/exam-packs";

export interface TeachBackResult {
  verdict: "got it" | "partly" | "not yet";
  missing: string[];
  feedback: string;
}

function examSubjectPath(packId: string, subjectId: string): string {
  return `${EXAM_PACKS_PATH}/${encodeURIComponent(packId)}/subjects/${encodeURIComponent(subjectId)}`;
}

export function listExamPacks(): Promise<ExamPackSummary[]> {
  return requestJson(EXAM_PACKS_PATH, { method: "GET" });
}

export function getExamSubject(
  packId: string,
  subjectId: string,
): Promise<ExamSubjectDetail> {
  return requestJson(examSubjectPath(packId, subjectId), { method: "GET" });
}

export function createMasteryLink(
  packId: string,
  subjectId: string,
  topicId: string,
): Promise<{ path_id: string }> {
  const path = `${examSubjectPath(packId, subjectId)}/topics/${encodeURIComponent(topicId)}/mastery-link`;
  return requestJson(path, { method: "POST" });
}

export function submitTeachBack(
  packId: string,
  subjectId: string,
  topicId: string,
  learnerText: string,
): Promise<TeachBackResult> {
  const path = `${examSubjectPath(packId, subjectId)}/topics/${encodeURIComponent(topicId)}/teach-back`;
  return requestJson(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ learner_text: learnerText }),
  });
}

export function getGlossary(packId: string, q?: string): Promise<GlossaryTerm[]> {
  const path = `${EXAM_PACKS_PATH}/${encodeURIComponent(packId)}/glossary`;
  const query = q === undefined ? "" : `?${new URLSearchParams({ q })}`;
  return requestJson(`${path}${query}`, { method: "GET" });
}

export function reloadExamPacks(): Promise<{ count: number }> {
  return requestJson(`${EXAM_PACKS_PATH}/reload`, { method: "POST" });
}
