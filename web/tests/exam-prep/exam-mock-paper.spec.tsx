import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ExamsLayout from "@/app/(workspace)/learning/exams/layout";
import MockPage from "@/app/(workspace)/learning/exams/mock/[attemptId]/page";
import type { MockAttempt, MockResult } from "@/features/exam-prep/mockApi";
import { initI18n } from "@/i18n/init";

const attemptId = "attempt #2";
const mockPath = "/learning/exams/mock/attempt%20%232";
const workspaceQuery = "dt_workspace=algebra+%26+geometry";
const attemptPath = `/api/exam-packs/mock/attempt%20%232?${workspaceQuery}`;
const submitPath = `/api/exam-packs/mock/attempt%20%232/submit?${workspaceQuery}`;
const subjectHref = `/learning/exams/demo%20pack/math%231?${workspaceQuery}`;
const deadline = Date.parse("2026-01-01T12:45:00Z");

vi.mock("next/navigation", () => ({
  useParams: () => ({ attemptId }),
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const i18n = initI18n("en");
const fetchMock = vi.fn<typeof fetch>();
const attempt: MockAttempt = {
  attempt_id: attemptId,
  pack_id: "demo pack",
  subject_id: "math#1",
  questionnaire_code: "paper #2",
  ui_lang: "he",
  started_at: "2026-01-01T12:00:00Z",
  expires_at: new Date(deadline).toISOString(),
  minutes: 45,
  questions: [
    { id: "q1", topic_id: "addition", prompt: "מהו הסכום?", options: { A: "2", B: "3" }, points: 40 },
    { id: "q2", topic_id: "subtraction", prompt: "מהו ההפרש?", options: { A: "4", B: "5" }, points: 60 },
  ],
  result: null,
};
const result: MockResult = {
  attempt_id: attemptId,
  marks: {
    q1: { points: 40, feedback: "תשובה נכונה.", skipped: false },
    q2: { points: 0, feedback: "חסרו שני צעדים.", skipped: true },
  },
  total: 40,
  max_total: 100,
  submitted_at: new Date(deadline).toISOString(),
};

beforeEach(async () => {
  await i18n.changeLanguage("en");
  vi.useFakeTimers();
  vi.setSystemTime(deadline - 5_000);
  window.history.replaceState({}, "", `${mockPath}?${workspaceQuery}`);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

async function openPaper(paper = attempt) {
  fetchMock.mockResolvedValueOnce(Response.json(paper));
  await act(async () => {
    render(<ExamsLayout><MockPage /></ExamsLayout>);
  });
  expect(fetchMock).toHaveBeenNthCalledWith(1, attemptPath, { method: "GET", credentials: "include" });
}

function expectSubmission(call: number, answers: Record<string, string>) {
  expect(fetchMock).toHaveBeenNthCalledWith(call, submitPath, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
}

it("uses one deadline timer and preserves keyboard selections across focus navigation and mode changes", async () => {
  vi.useRealTimers();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(deadline - 5_000);
  await openPaper();
  const user = userEvent.setup();
  const toggle = screen.getByRole("button", { name: "Focus mode" });
  const timer = screen.getByRole("timer");
  expect(timer).toHaveTextContent("00:05");
  expect(screen.getAllByRole("group")).toHaveLength(2);

  const first = screen.getByRole("radio", { name: "A. 2" });
  first.focus();
  await user.keyboard("[Space]");
  expect(first).toBeChecked();

  await user.click(toggle);
  expect(screen.getByRole("timer")).toBe(timer);
  expect(screen.getAllByRole("group")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Previous question" })).toBeDisabled();
  const next = screen.getByRole("button", { name: "Next question" });
  next.focus();
  await user.keyboard("{Enter}");
  const secondQuestion = screen.getByRole("group", { name: `Question 2 ${attempt.questions[1].prompt}` });
  expect(secondQuestion.querySelector("legend")).toHaveFocus();
  expect(screen.getByRole("button", { name: "Next question" })).toBeDisabled();
  expect(screen.queryByRole("radio", { name: "A. 2" })).not.toBeInTheDocument();

  const second = screen.getByRole("radio", { name: "B. 5" });
  second.focus();
  await user.keyboard("[Space]");
  await user.click(screen.getByRole("button", { name: "Previous question" }));
  expect(screen.getByRole("radio", { name: "A. 2" })).toBeChecked();
  await user.click(toggle);
  expect(screen.getByRole("radio", { name: "B. 5" })).toBeChecked();
  expect(screen.getByRole("timer")).toBe(timer);

  fetchMock.mockResolvedValueOnce(Response.json({
    ...result,
    marks: { ...result.marks, q2: { ...result.marks.q2, skipped: false } },
  }));
  await user.click(screen.getByRole("button", { name: "Submit answers" }));
  expectSubmission(2, { q1: "A", q2: "B" });
  expect(screen.getByRole("heading", { name: "Results" })).toHaveFocus();
  expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("freezes editing and submits the current answers once when the deadline passes", async () => {
  await openPaper();
  const pending = Promise.withResolvers<Response>();
  fetchMock.mockReturnValueOnce(pending.promise);
  const radio = screen.getByRole("radio", { name: "A. 2" });
  fireEvent.click(radio);

  act(() => vi.advanceTimersByTime(1_000));
  expect(screen.getByRole("timer")).toHaveTextContent("00:04");
  vi.setSystemTime(deadline - 1_000);
  act(() => vi.advanceTimersByTime(1_000));

  expect(screen.getByRole("timer")).toHaveTextContent("00:00");
  expect(radio).toBeDisabled();
  expectSubmission(2, { q1: "A" });
  act(() => vi.advanceTimersByTime(10_000));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await act(async () => pending.resolve(Response.json(result)));
  expect(screen.getByText("Total 40 / 100")).toBeVisible();
});

it("opens an already expired attempt as read-only and links back to its scoped subject", async () => {
  vi.setSystemTime(deadline);
  await openPaper();

  expect(screen.getByRole("alert")).toHaveTextContent("Expired");
  expect(screen.getByRole("link", { name: "Back to topics" })).toHaveAttribute("href", subjectHref);
  for (const option of screen.getAllByRole("radio")) expect(option).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Submit answers" })).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(10_000));
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("keeps a manual submission in flight at expiry and offers a retry for a recoverable error", async () => {
  await openPaper();
  const pending = Promise.withResolvers<Response>();
  fetchMock.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(Response.json(result));
  const radio = screen.getByRole("radio", { name: "A. 2" });
  fireEvent.click(radio);
  const form = screen.getByRole("button", { name: "Submit answers" }).closest("form")!;
  act(() => {
    fireEvent.submit(form);
    fireEvent.submit(form);
    vi.advanceTimersByTime(5_000);
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expectSubmission(2, { q1: "A" });

  await act(async () => pending.resolve(Response.json({ detail: "Unavailable" }, { status: 503 })));
  expect(radio).toBeDisabled();
  expect(radio).toBeChecked();
  act(() => vi.advanceTimersByTime(10_000));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await act(async () => fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Retry" })));
  expectSubmission(3, { q1: "A" });
  expect(screen.getByText("Total 40 / 100")).toBeVisible();
});

it("shows the scoped return link and Expired after a submission conflict", async () => {
  await openPaper();
  fetchMock.mockResolvedValueOnce(Response.json({ detail: "Mock attempt has expired." }, { status: 409 }));
  await act(async () => vi.advanceTimersByTime(5_000));

  expectSubmission(2, {});
  expect(screen.getByRole("alert")).toHaveTextContent("Expired");
  expect(screen.getByRole("link", { name: "Back to topics" })).toHaveAttribute("href", subjectHref);
  expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  expect(screen.queryByRole("timer")).not.toBeInTheDocument();
});

it("renders the saved result directly from GET, with marks and read-aloud feedback in the paper language", async () => {
  vi.setSystemTime(deadline + 10_000);
  localStorage.setItem("deeptutor.focusMode", JSON.stringify({ focusOn: true }));
  const speak = vi.fn();
  vi.stubGlobal("speechSynthesis", { speak, cancel: vi.fn() });
  vi.stubGlobal("SpeechSynthesisUtterance", class {
    constructor(public text: string) {}
  });
  await openPaper({ ...attempt, result });

  expect(screen.getByRole("heading", { name: "Results" })).toBeVisible();
  expect(screen.getByText("Total 40 / 100")).toBeVisible();
  expect(screen.getByText("40 / 40")).toBeVisible();
  expect(screen.getByText("0 / 60 · Skipped")).toBeVisible();
  const feedback = screen.getByText("תשובה נכונה.");
  expect(feedback).toHaveAttribute("lang", "he");
  expect(feedback).toHaveAttribute("dir", "auto");
  const firstMark = screen.getAllByRole("listitem")[0];
  fireEvent.click(within(firstMark).getByRole("button", { name: "Read aloud" }));
  expect(speak).toHaveBeenCalledWith(expect.objectContaining({ text: result.marks.q1.feedback, lang: "he" }));
  fireEvent.click(within(firstMark).getByRole("button", { name: "Stop reading aloud" }));
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("keeps the study timer available in focus mode on other exam routes", () => {
  window.history.replaceState({}, "", "/learning/exams/demo/math");
  localStorage.setItem("deeptutor.focusMode", JSON.stringify({ focusOn: true, minutes: 15 }));
  render(<ExamsLayout><p>Subject</p></ExamsLayout>);

  expect(screen.getByRole("timer", { name: "Study timer" })).toHaveTextContent("15:00");
});
