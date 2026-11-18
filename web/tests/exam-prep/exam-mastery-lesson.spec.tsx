import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { MasteryStudy } from "@/components/space/learning/MasteryStudy";
import type { ChatState } from "@/features/chat/ChatStateAdapter";
import { initI18n } from "@/i18n/init";
import type { TopicSource } from "@/lib/learning-api";

initI18n("en");

const pathId = "slope-path";
const sessionId = "slope-session";
const firstReply = "Slope measures change in height over change in distance.";
const secondReply = "A horizontal line has slope zero.";
const workspaceQuery = "dt_workspace=exam+practice";
const glossaryPath = `/api/exam-packs/demo%20pack/glossary?${workspaceQuery}`;
const examMetadata = {
  exam_pack_id: "demo pack",
  exam_subject_id: "math#1",
  exam_topic_id: "slope + lines",
  exam_ui_lang: "fr",
};

const state = {
  messages: [
    { id: 1, role: "user", content: "Explain slope.", parentMessageId: null },
    { id: 2, role: "assistant", content: firstReply, parentMessageId: 1 },
    { id: 3, role: "user", content: "What about horizontal lines?", parentMessageId: 2 },
    { id: 4, role: "assistant", content: secondReply, parentMessageId: 3 },
  ] as ChatState["messages"],
  isStreaming: false,
  sessionId,
  selectedBranches: {},
  activeCapability: "mastery_path",
  enabledTools: [] as string[],
  language: "en",
  knowledgeBases: [] as string[],
  llmSelection: null,
  personaSelection: "",
  resourceSelection: { skills: [], mcp: [] },
  workspaceId: "exam practice",
};

let sourceMetadata: TopicSource["metadata"];
const sendMessage = vi.fn();
const submitUserReply = vi.fn();

vi.mock("@/features/chat/ChatStateAdapter", () => ({
  useChatStateAdapter: () => ({ state, sendMessage, submitUserReply }),
}));

vi.mock("@/hooks/useMasteryStudySession", () => ({
  useMasteryStudySession: () => ({
    topic: {
      path_id: pathId,
      name: "Slope",
      next: { knowledge_point_name: "Slope" },
      map: { modules: [], counts: { mastered: 0, total: 1 } },
      sources: [{ kind: "file", metadata: sourceMetadata }],
    },
    knowledgeBases: [],
    sessionLoading: false,
    sessionMode: "study",
  }),
}));

vi.mock("@/components/chat/home/ChatViewerBridges", () => ({ ChatViewerBridges: () => null }));
vi.mock("@/components/chat/home/LazySessionViewerPanel", () => ({ default: () => null }));

class MockUtterance {
  lang = "";
  rate = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly text: string) {}
}

const speechSynthesis = {
  speak: vi.fn<(utterance: MockUtterance) => void>(),
  cancel: vi.fn(),
};

const fetchMock = vi.fn<typeof fetch>(async (input) => {
  const url = String(input);
  if (url === glossaryPath) {
    return Response.json([
      { term_source: "שיפוע", term_ui: "Slope", note: "Rise over run", topic_ids: ["slope + lines"] },
      { term_source: "זווית", term_ui: "Angle", note: "", topic_ids: ["angles"] },
      { term_source: "נקודה", term_ui: "Point", note: "", topic_ids: [] },
    ]);
  }
  if (url.includes("/ask-hint?")) return Response.json({ hint: "" });
  return new Response(null, { status: 404 });
});

beforeEach(() => {
  sourceMetadata = examMetadata;
  state.isStreaming = false;
  window.history.replaceState({}, "", `/learning/mastery/${pathId}/sessions/${sessionId}?${workspaceQuery}`);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("speechSynthesis", speechSynthesis);
  vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

const lesson = () => <MasteryStudy pathId={pathId} routeSessionId={sessionId} />;

it("reads completed replies and stops the active reply before focusing the draft", async () => {
  const user = userEvent.setup();
  state.isStreaming = true;
  const { rerender, unmount } = render(lesson());
  const composer = await screen.findByRole("textbox", undefined, { timeout: 5000 });
  const first = await screen.findByRole("button", { name: "Read aloud" });
  expect(screen.getAllByRole("button", { name: "Read aloud" })).toEqual([first]);

  state.isStreaming = false;
  rerender(lesson());
  const [, second] = screen.getAllByRole("button", { name: "Read aloud" });
  expect(speechSynthesis.speak).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Play aloud" })).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "Playback speed" })).not.toBeInTheDocument();

  const draft = "How does this work for a vertical line?";
  await user.type(composer, draft);
  await user.click(first);
  expect(speechSynthesis.speak).toHaveBeenLastCalledWith(expect.objectContaining({ text: firstReply, lang: "fr" }));
  await user.click(second);
  expect(speechSynthesis.speak).toHaveBeenLastCalledWith(expect.objectContaining({ text: secondReply, lang: "fr" }));
  expect(speechSynthesis.cancel).toHaveBeenCalledTimes(1);
  expect(screen.getAllByRole("button", { name: "Stop reading aloud" })).toEqual([second]);

  const onFocus = vi.fn();
  composer.addEventListener("focus", onFocus);
  await user.click(screen.getByRole("button", { name: "Ask a question" }));

  expect(speechSynthesis.cancel).toHaveBeenCalledTimes(2);
  expect(speechSynthesis.cancel.mock.invocationCallOrder[1]).toBeLessThan(onFocus.mock.invocationCallOrder[0]);
  expect(screen.getAllByRole("button", { name: "Read aloud" })).toHaveLength(2);
  expect(composer).toHaveFocus();
  expect(composer).toHaveValue(draft);
  expect(sendMessage).not.toHaveBeenCalled();
  expect(submitUserReply).not.toHaveBeenCalled();

  await user.click(screen.getAllByRole("button", { name: "Read aloud" })[0]);
  unmount();
  expect(speechSynthesis.cancel).toHaveBeenCalledTimes(3);
});

it("links to Teach back for the same topic and shows only the glossary terms tagged with it", async () => {
  render(lesson());
  expect(screen.getByRole("link", { name: "Teach back" })).toHaveAttribute(
    "href", `/learning/exams/demo%20pack/math%231/teach-back?topic=slope+%2B+lines&${workspaceQuery}`,
  );

  const glossary = within(await screen.findByRole("list", { name: "Glossary" }));
  expect(glossary.getByRole("group", { name: "שיפוע Slope" })).toBeVisible();
  expect(glossary.getAllByRole("listitem")).toHaveLength(1);
  expect(fetchMock).toHaveBeenCalledWith(glossaryPath, { credentials: "include", method: "GET" });
  await screen.findByRole("textbox");
});

it.each([{}, { exam_pack_id: "demo pack" }])("keeps ordinary mastery playback for source metadata %j", async (metadata) => {
  sourceMetadata = metadata;
  render(lesson());

  expect(await screen.findAllByRole("button", { name: "Play aloud" })).toHaveLength(2);
  expect(screen.getByRole("combobox", { name: "Playback speed" })).toBeEnabled();
  expect(await screen.findByRole("textbox")).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Read aloud" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Ask a question" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Teach back" })).not.toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Glossary" })).not.toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/glossary"), expect.anything());
});
