import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { redirect, RedirectType } from "next/navigation";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SubjectPage from "@/app/(workspace)/learning/exams/[packId]/[subjectId]/page";
import { getMock, submitMock, type MockAttempt, type MockResult } from "@/features/exam-prep/mockApi";
import type { ExamSubjectDetail } from "@/features/exam-prep/types";
import { initI18n } from "@/i18n/init";

const packId = "demo pack";
const subjectId = "math#1";
const questionnaireCode = "paper #2";
const subjectPath = "/learning/exams/demo%20pack/math%231";
const workspaceQuery = "dt_workspace=algebra+%26+geometry";
const startPath = `/api/exam-packs/demo%20pack/mock?${workspaceQuery}`;
const startOptions = {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ subject_id: subjectId, questionnaire_code: questionnaireCode }),
};
const destination = `/learning/exams/mock/attempt%20%232?${workspaceQuery}`;

vi.mock("next/navigation", () => ({
  useParams: () => ({ packId, subjectId }),
  usePathname: () => window.location.pathname,
  redirect: vi.fn(),
  RedirectType: { push: "push" },
}));

const i18n = initI18n("en");
const fetchMock = vi.fn<typeof fetch>();
const subject: ExamSubjectDetail = {
  id: subjectId,
  title: "Algebra",
  ui_lang: "en",
  questionnaires: [
    { code: "paper-1", title: "Linear models", minutes: 30, topic_weights: {} },
    { code: questionnaireCode, title: "Functions", minutes: 45, topic_weights: {} },
  ],
  topics: [],
};
const attempt: MockAttempt = {
  attempt_id: "attempt #2",
  pack_id: packId,
  subject_id: subjectId,
  questionnaire_code: questionnaireCode,
  ui_lang: "en",
  started_at: "2026-01-01T12:00:00Z",
  expires_at: "2026-01-01T12:45:00Z",
  minutes: 45,
  questions: [],
  result: null,
};

beforeEach(async () => {
  await i18n.changeLanguage("en");
  window.history.replaceState({}, "", `${subjectPath}?workspace=algebra+%26+geometry`);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

it("opens by keyboard and starts the chosen questionnaire once in the active workspace", async () => {
  const pending = Promise.withResolvers<Response>();
  fetchMock.mockResolvedValueOnce(Response.json(subject)).mockReturnValueOnce(pending.promise);
  const user = userEvent.setup();
  render(<SubjectPage />);

  const trigger = await screen.findByRole("button", { name: "Mock exam" });
  trigger.focus();
  await user.keyboard("{Enter}");
  const dialog = within(screen.getByRole("dialog", { name: "Mock exam" }));
  const picker = dialog.getByRole<HTMLSelectElement>("combobox", { name: "Select" });
  await waitFor(() => expect(picker).toHaveFocus());
  expect(dialog.getByRole("option", { name: "Linear models · 30 minutes" })).toBeVisible();
  await user.selectOptions(picker, dialog.getByRole("option", { name: "Functions · 45 minutes" }));
  expect(fetchMock).toHaveBeenCalledTimes(1);

  picker.focus();
  const form = picker.form!;
  act(() => {
    fireEvent.submit(form);
    fireEvent.submit(form);
  });
  const starting = dialog.getByRole("button", { name: "Starting..." });
  expect(starting).toHaveAttribute("aria-disabled", "true");
  expect(starting).toHaveFocus();
  expect(picker).toBeDisabled();
  await user.keyboard("{Escape}{Enter}");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock).toHaveBeenLastCalledWith(startPath, startOptions);
  expect(redirect).not.toHaveBeenCalled();

  await act(async () => pending.resolve(Response.json(attempt)));
  expect(redirect).toHaveBeenCalledWith(destination, RedirectType.push);
});

it.each([502, 503])("keeps the selection and retries after a %i response", async (status) => {
  fetchMock
    .mockResolvedValueOnce(Response.json(subject))
    .mockResolvedValueOnce(Response.json({ detail: "Unavailable" }, { status }))
    .mockResolvedValueOnce(Response.json(attempt));
  const user = userEvent.setup();
  render(<SubjectPage />);

  await user.click(await screen.findByRole("button", { name: "Mock exam" }));
  const dialog = within(screen.getByRole("dialog", { name: "Mock exam" }));
  const picker = dialog.getByRole("combobox", { name: "Select" });
  await waitFor(() => expect(picker).toHaveFocus());
  await user.selectOptions(picker, questionnaireCode);
  await user.tab();
  expect(dialog.getByRole("button", { name: "Start" })).toHaveFocus();
  await user.keyboard("{Enter}");
  const alert = await dialog.findByRole("alert");
  if (status === 503) {
    expect(alert).toHaveTextContent("No language model is configured yet.");
    const settings = within(alert).getByRole("link", { name: "Open model settings" });
    expect(settings).toHaveAttribute("href", "/settings/llm");
    expect(settings).toHaveAttribute("target", "_blank");
  } else {
    expect(alert).toHaveTextContent("Something went wrong.");
    expect(within(alert).queryByRole("link")).not.toBeInTheDocument();
  }
  expect(picker).toHaveValue(questionnaireCode);
  expect(picker).toBeEnabled();
  expect(redirect).not.toHaveBeenCalled();

  expect(dialog.getByRole("button", { name: "Retry" })).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock).toHaveBeenNthCalledWith(2, startPath, startOptions);
  expect(fetchMock).toHaveBeenNthCalledWith(3, startPath, startOptions);
  expect(redirect).toHaveBeenCalledWith(destination, RedirectType.push);
});

it("hides the subject action when there are no questionnaires", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ ...subject, questionnaires: [] }));
  render(<SubjectPage />);

  expect(await screen.findByRole("heading", { name: "Algebra" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Mock exam" })).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("scopes the reload and submit requests and encodes the attempt ID", async () => {
  const result: MockResult = {
    attempt_id: attempt.attempt_id,
    marks: { q1: { points: 100, feedback: "Correct.", skipped: false } },
    total: 100,
    max_total: 100,
    submitted_at: "2026-01-01T12:30:00Z",
  };
  fetchMock.mockResolvedValueOnce(Response.json(attempt)).mockResolvedValueOnce(Response.json(result));

  await expect(getMock(attempt.attempt_id)).resolves.toEqual(attempt);
  expect(fetchMock).toHaveBeenLastCalledWith(`/api/exam-packs/mock/attempt%20%232?${workspaceQuery}`, {
    method: "GET",
    credentials: "include",
  });
  await expect(submitMock(attempt.attempt_id, { q1: "A" })).resolves.toEqual(result);
  expect(fetchMock).toHaveBeenLastCalledWith(`/api/exam-packs/mock/attempt%20%232/submit?${workspaceQuery}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers: { q1: "A" } }),
  });
});
