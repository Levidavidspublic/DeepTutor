import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SubjectPage from "@/app/(workspace)/learning/exams/[packId]/[subjectId]/page";
import TeachBackPage from "@/app/(workspace)/learning/exams/[packId]/[subjectId]/teach-back/page";
import type { TeachBackResult } from "@/features/exam-prep/api";
import type { ExamSubjectDetail } from "@/features/exam-prep/types";
import { initI18n } from "@/i18n/init";

const packId = "demo pack";
const subjectId = "math#1";
const topicId = "slope & lines";
const workspaceId = "algebra-lab";
const subjectPath = "/learning/exams/demo%20pack/math%231";
const subjectRequest = "/api/exam-packs/demo%20pack/subjects/math%231";
const gradeRequest = `${subjectRequest}/topics/slope%20%26%20lines/teach-back?dt_workspace=${workspaceId}`;

vi.mock("next/navigation", () => ({
  useParams: () => ({ packId, subjectId }),
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const i18n = initI18n("en");
const topic = {
  id: topicId,
  title: "Slope",
  title_source: "Slope",
  weight: 1,
  objectives: ["Define rise over run.", "Explain the sign of a slope."],
};
const subject: ExamSubjectDetail = {
  id: subjectId,
  title: "Algebra",
  ui_lang: "en",
  questionnaires: [],
  topics: [{ ...topic, status: "new" }],
};
const partial: TeachBackResult = {
  verdict: "partly",
  feedback: "You explained rise over run. Include what a negative slope means.",
  missing: [topic.objectives[1]],
};
const correct: TeachBackResult = {
  verdict: "got it",
  feedback: "You explained both objectives.",
  missing: [],
};

const fetchMock = vi.fn<typeof fetch>();
const mediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");

function openTopic(id: string | null) {
  const search = new URLSearchParams({ workspace: workspaceId });
  if (id !== null) search.set("topic", id);
  window.history.replaceState({}, "", `${subjectPath}/teach-back?${search}`);
}

function expectGradeRequest(answer: string) {
  expect(fetchMock).toHaveBeenLastCalledWith(gradeRequest, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ learner_text: answer }),
  });
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  openTopic(topicId);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  if (mediaDevices) Object.defineProperty(navigator, "mediaDevices", mediaDevices);
  else Reflect.deleteProperty(navigator, "mediaDevices");
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

it("checks a typed answer once, reads the prompt and feedback, and lets the learner revise", async () => {
  const pending = Promise.withResolvers<Response>();
  fetchMock.mockResolvedValueOnce(Response.json(subject)).mockReturnValueOnce(pending.promise);
  const speak = vi.fn();
  vi.stubGlobal("speechSynthesis", { speak, cancel: vi.fn() });
  vi.stubGlobal("SpeechSynthesisUtterance", class {
    constructor(readonly text: string) {}
  });
  const user = userEvent.setup();
  render(<TeachBackPage />);

  const prompt = within(await screen.findByRole("region", { name: "Slope" }));
  for (const objective of topic.objectives) expect(prompt.getByText(objective)).toBeVisible();
  await user.click(prompt.getByRole("button", { name: "Read aloud" }));
  expect(speak).toHaveBeenCalledWith(expect.objectContaining({
    lang: "en",
    text: expect.stringContaining(`Explain this clearly in your own words\n${topic.objectives.join("\n")}`),
  }));
  expect(screen.getByText("Not checked yet")).toBeVisible();
  const answer = screen.getByRole("textbox", { name: "Your answer" });
  const check = screen.getByRole("button", { name: "Check answer" });
  await user.type(answer, "  Rise divided by run.  ");
  const form = check.closest("form")!;
  act(() => {
    fireEvent.submit(form);
    fireEvent.submit(form);
  });

  expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expectGradeRequest("Rise divided by run.");
  await act(async () => pending.resolve(Response.json(partial)));

  const result = within(screen.getByRole("region", { name: "Partially correct" }));
  expect(result.getByRole("heading", { name: "Partially correct" })).toHaveFocus();
  expect(result.getByText(partial.feedback)).toBeVisible();
  expect(result.getByText("1 remaining")).toBeVisible();
  expect(result.getByText(topic.objectives[1])).toBeVisible();
  expect(result.queryByText(topic.objectives[0])).toBeNull();
  await user.click(result.getByRole("button", { name: "Read aloud" }));
  expect(speak).toHaveBeenLastCalledWith(expect.objectContaining({
    lang: "en",
    text: expect.stringContaining(partial.feedback),
  }));

  await user.click(result.getByRole("button", { name: "Retry" }));
  const draft = screen.getByRole("textbox", { name: "Your answer" });
  expect(draft).toHaveFocus();
  expect(draft).toHaveValue("  Rise divided by run.  ");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("appends a transcription to the draft and waits for an explicit check", async () => {
  const transcription = Promise.withResolvers<Response>();
  fetchMock.mockResolvedValueOnce(Response.json(subject)).mockReturnValueOnce(transcription.promise);
  const stopTrack = vi.fn();
  const stream = { getTracks: () => [{ stop: stopTrack }] };
  const permission = Promise.withResolvers<typeof stream>();
  const getUserMedia = vi.fn().mockReturnValue(permission.promise);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  vi.stubGlobal("MediaRecorder", class {
    state = "inactive";
    mimeType = "audio/webm";
    ondataavailable?: (event: { data: Blob }) => void;
    onstop?: () => void;

    start() { this.state = "recording"; }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["sample audio"]) });
      this.onstop?.();
    }
  });
  const user = userEvent.setup();
  render(<TeachBackPage />);

  const answer = await screen.findByRole("textbox", { name: "Your answer" });
  const check = screen.getByRole("button", { name: "Check answer" });
  expect(check).toBeDisabled();
  await user.type(answer, "Slope is");
  const mic = screen.getByRole("button", { name: "Record voice" });
  await user.click(mic);
  expect(getUserMedia).toHaveBeenCalledExactlyOnceWith({ audio: true });
  expect(mic).toBeDisabled();
  expect(check).toBeDisabled();
  fireEvent.submit(check.closest("form")!);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () => permission.resolve(stream));
  expect(check).toBeDisabled();
  await user.click(await screen.findByRole("button", { name: "Stop recording" }));
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(check).toBeDisabled();
  expect(fetchMock).toHaveBeenLastCalledWith(
    expect.stringContaining(`/api/voice/stt?dt_workspace=${workspaceId}`),
    expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
  );
  await act(async () => transcription.resolve(Response.json({ text: " rise over run " })));
  expect(answer).toHaveValue("Slope is rise over run");
  expect(check).toBeEnabled();
  expect(fetchMock).toHaveBeenCalledTimes(2);

  await user.type(answer, ".");
  fetchMock.mockResolvedValueOnce(Response.json({
    verdict: "not yet",
    feedback: "Explain what rise and run measure and how the sign describes the line.",
    missing: topic.objectives,
  } satisfies TeachBackResult));
  await user.click(check);
  expectGradeRequest("Slope is rise over run.");
  expect(await screen.findByRole("heading", { name: "Not quite" })).toBeVisible();
});

it("recovers from a missing provider and returns to a freshly loaded, scoped topic map", async () => {
  fetchMock
    .mockResolvedValueOnce(Response.json(subject))
    .mockResolvedValueOnce(Response.json({ detail: "Tutor model is not configured" }, { status: 503 }))
    .mockResolvedValueOnce(Response.json(correct));
  const user = userEvent.setup();
  const { unmount } = render(<TeachBackPage />);

  const answer = await screen.findByRole("textbox", { name: "Your answer" });
  const draft = "Slope is rise over run. A negative slope decreases as x increases.";
  await user.type(answer, draft);
  await user.click(screen.getByRole("button", { name: "Check answer" }));
  const alert = within(await screen.findByRole("alert"));
  expect(alert.getByText("No language model is configured yet.")).toBeVisible();
  const settings = alert.getByRole("link", { name: "Open model settings" });
  expect(settings).toHaveAttribute("href", "/settings/llm");
  expect(settings).toHaveAttribute("target", "_blank");
  expect(answer).toHaveValue(draft);

  await user.click(screen.getByRole("button", { name: "Check answer" }));
  const result = within(await screen.findByRole("region", { name: "Correct" }));
  expectGradeRequest(draft);
  expect(result.getByText(correct.feedback)).toBeVisible();
  expect(result.queryByRole("list")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  const next = result.getByRole<HTMLAnchorElement>("link", { name: "Next" });
  expect(next).toHaveAttribute("href", `${subjectPath}?dt_workspace=${workspaceId}`);

  // Simulate the route transition in jsdom, which has no Next App Router.
  window.history.pushState({}, "", next.href);
  unmount();
  fetchMock.mockResolvedValueOnce(Response.json({ ...subject, topics: [{ ...topic, status: "done" }] }));
  render(<SubjectPage />);

  expect(await screen.findByText("Done")).toBeVisible();
  expect(fetchMock).toHaveBeenLastCalledWith(`${subjectRequest}?dt_workspace=${workspaceId}`, {
    credentials: "include",
    method: "GET",
  });
});

it.each([null, "unknown-topic"])("offers a scoped way back when the topic is %s", async (id) => {
  openTopic(id);
  fetchMock.mockResolvedValueOnce(Response.json(subject));
  render(<TeachBackPage />);

  expect(await screen.findByRole("heading", { name: "Not found" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Back to topics" }))
    .toHaveAttribute("href", `${subjectPath}?dt_workspace=${workspaceId}`);
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(id === null ? 0 : 1);
});

it("retries a failed topic load", async () => {
  fetchMock.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(Response.json(subject));
  const user = userEvent.setup();
  render(<TeachBackPage />);

  const alert = within(await screen.findByRole("alert"));
  await user.click(alert.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("textbox", { name: "Your answer" })).toBeVisible();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
