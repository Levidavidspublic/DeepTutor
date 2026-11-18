import { requestJson } from "@/shared/api/client";

const EXAM_PACKS_PATH = "/api/exam-packs";

interface MockQuestion {
  id: string;
  topic_id: string;
  prompt: string;
  options: Record<string, string>;
  points: number;
}

interface MockMark {
  points: number;
  feedback: string;
  skipped: boolean;
}

export interface MockResult {
  attempt_id: string;
  marks: Record<string, MockMark>;
  total: number;
  max_total: number;
  submitted_at: string;
}

export interface MockAttempt {
  attempt_id: string;
  pack_id: string;
  subject_id: string;
  questionnaire_code: string;
  ui_lang: string;
  started_at: string;
  expires_at: string;
  minutes: number;
  questions: MockQuestion[];
  result: MockResult | null;
}

export function startMock(
  packId: string,
  subjectId: string,
  questionnaireCode: string,
): Promise<MockAttempt> {
  return requestJson(`${EXAM_PACKS_PATH}/${encodeURIComponent(packId)}/mock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject_id: subjectId, questionnaire_code: questionnaireCode }),
  });
}

function mockAttemptPath(attemptId: string): string {
  return `${EXAM_PACKS_PATH}/mock/${encodeURIComponent(attemptId)}`;
}

export function getMock(attemptId: string): Promise<MockAttempt> {
  return requestJson(mockAttemptPath(attemptId), { method: "GET" });
}

export function submitMock(attemptId: string, answers: Record<string, string>): Promise<MockResult> {
  return requestJson(`${mockAttemptPath(attemptId)}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
}
