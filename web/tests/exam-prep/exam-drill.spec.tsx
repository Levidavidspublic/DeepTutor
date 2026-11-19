import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SubjectPage from "@/app/(workspace)/learning/exams/[packId]/[subjectId]/page";
import DrillPage from "@/app/(workspace)/learning/exams/[packId]/[subjectId]/drill/page";
import type { ExamDeck, ExamDeckSummary } from "@/features/exam-prep/decksApi";
import type { ExamSubjectDetail } from "@/features/exam-prep/types";
import { initI18n } from "@/i18n/init";

const packId = "demo pack";
const subjectId = "math#1";
const workspaceId = "geometry-lab";
const subjectPath = "/learning/exams/demo%20pack/math%231";
const drillPath = `${subjectPath}/drill`;
const subjectApi = "/api/exam-packs/demo%20pack/subjects/math%231";
const decksApi = `${subjectApi}/decks`;
const workspaceQuery = `dt_workspace=${workspaceId}`;

const push = vi.fn((href: string) => window.history.pushState({}, "", href));
vi.mock("next/navigation", () => ({
  useParams: () => ({ packId, subjectId }),
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push }),
}));

const i18n = initI18n("en");
const subject: ExamSubjectDetail = { id: subjectId, title: "Geometry", questionnaires: [], topics: [] };
const importedDeck: ExamDeck = {
  id: "47700f06-dc82-492d-ae82-989c862603fc",
  title: "Graphs.review",
  source: "csv",
  cards: [{ front: "Translate curve into Hebrew.", back: "<b>עקומה</b>" }],
};
const savedDeck: ExamDeck = {
  id: "4922601e-2857-4338-8cdf-1a51ac5351d4",
  title: "Shapes",
  source: "anki",
  cards: [
    { front: "Name a shape with four equal sides and four right angles.", back: "Square" },
    { front: "How many sides does a triangle have?", back: "Three" },
  ],
};
const csv = `front,back\n${importedDeck.cards[0].front},${importedDeck.cards[0].back}\n`;
const fetchMock = vi.fn<typeof fetch>();

function deckUrl(id: string) {
  return `${drillPath}?deck=${id}&${workspaceQuery}`;
}

function summary(deck: ExamDeck): ExamDeckSummary {
  return { id: deck.id, title: deck.title, source: deck.source, card_count: deck.cards.length };
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  window.history.replaceState({}, "", `${drillPath}?${workspaceQuery}`);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

it("links from the subject and opens an imported CSV deck with read-aloud on each side", async () => {
  window.history.replaceState({}, "", `${subjectPath}?${workspaceQuery}`);
  fetchMock.mockResolvedValueOnce(Response.json(subject));
  const { rerender } = render(<SubjectPage />);
  const drill = await screen.findByRole<HTMLAnchorElement>("link", { name: "Drill" });
  expect(drill).toHaveAttribute("href", `${drillPath}?${workspaceQuery}`);

  // jsdom has no Next App Router, so follow the rendered link with history.
  window.history.pushState({}, "", drill.href);
  fetchMock.mockResolvedValueOnce(Response.json([]));
  rerender(<DrillPage />);
  expect(await screen.findByRole("heading", { name: "Nothing here yet" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Back to topics" })).toHaveAttribute("href", `${subjectPath}?${workspaceQuery}`);

  fetchMock
    .mockResolvedValueOnce(Response.json(importedDeck))
    .mockResolvedValueOnce(Response.json([summary(importedDeck)]))
    .mockResolvedValueOnce(Response.json(importedDeck));
  const speak = vi.fn();
  vi.stubGlobal("speechSynthesis", { speak, cancel: vi.fn() });
  vi.stubGlobal("SpeechSynthesisUtterance", class {
    constructor(readonly text: string) {}
  });
  const user = userEvent.setup();
  const picker = screen.getByLabelText<HTMLInputElement>(/^Import/);
  expect(picker).toHaveAttribute("accept", ".csv,.tsv,.txt");
  await user.upload(picker, new File([csv], "Graphs.review.CSV", { type: "text/csv" }));

  await waitFor(() => expect(push).toHaveBeenCalledWith(deckUrl(importedDeck.id), { scroll: false }));
  expect(fetchMock).toHaveBeenCalledWith(`${decksApi}?${workspaceQuery}`, expect.objectContaining({
    credentials: "include",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Graphs.review", kind: "csv", text: csv }),
  }));
  rerender(<DrillPage />);
  const deck = within(await screen.findByRole("region", { name: importedDeck.title }));
  const [{ front, back }] = importedDeck.cards;

  expect(deck.getByText(front)).toHaveAttribute("dir", "auto");
  expect(deck.queryByText(back)).not.toBeInTheDocument();
  await user.click(deck.getByRole("button", { name: "Read aloud" }));
  expect(speak).toHaveBeenLastCalledWith(expect.objectContaining({ text: front }));
  await user.click(deck.getByRole("button", { name: "Reveal answer" }));
  expect(deck.getByText(back)).toHaveAttribute("dir", "auto");
  await user.click(deck.getByRole("button", { name: "Read aloud" }));
  expect(speak).toHaveBeenLastCalledWith(expect.objectContaining({ text: back, lang: "he" }));
  expect(await screen.findByRole("link", { name: importedDeck.title })).toHaveAttribute("aria-current", "page");
});

it("reopens a saved deck through its URL and moves with buttons and arrow shortcuts", async () => {
  fetchMock.mockResolvedValueOnce(Response.json([summary(savedDeck)]));
  const { unmount } = render(<DrillPage />);
  const saved = await screen.findByRole<HTMLAnchorElement>("link", { name: savedDeck.title });
  expect(saved).toHaveAttribute("href", deckUrl(savedDeck.id));

  window.history.pushState({}, "", saved.href);
  unmount();
  fetchMock.mockImplementation(async (url) => Response.json(
    url === `${decksApi}/${savedDeck.id}?${workspaceQuery}` ? savedDeck : [summary(savedDeck)],
  ));
  render(<DrillPage />);
  const deck = within(await screen.findByRole("region", { name: savedDeck.title }));
  const [first, second] = savedDeck.cards;
  const user = userEvent.setup();

  expect(fetchMock).toHaveBeenCalledWith(`${decksApi}/${savedDeck.id}?${workspaceQuery}`, {
    credentials: "include", method: "GET",
  });
  expect(deck.getByText(first.front)).toBeVisible();
  const previous = deck.getByRole("button", { name: "Previous" });
  const next = deck.getByRole("button", { name: "Next" });
  expect(previous).toBeDisabled();
  await user.click(deck.getByRole("button", { name: "Reveal answer" }));
  await user.keyboard("{ArrowRight}");
  expect(deck.getByText(second.front)).toBeVisible();
  expect(deck.queryByText(first.back)).not.toBeInTheDocument();
  expect(deck.queryByText(second.back)).not.toBeInTheDocument();
  expect(next).toBeDisabled();
  await user.click(previous);
  expect(deck.getByText(first.front)).toBeVisible();
  await user.click(next);
  await user.keyboard("{ArrowLeft}");
  expect(deck.getByText(first.front)).toBeVisible();
  expect(deck.getByRole("button", { name: "Reveal answer" })).toBeEnabled();
});

it("checks a trimmed, case-insensitive quiz answer and resets it on the next card", async () => {
  window.history.replaceState({}, "", deckUrl(savedDeck.id));
  fetchMock.mockImplementation(async (url) => Response.json(
    url === `${decksApi}/${savedDeck.id}?${workspaceQuery}` ? savedDeck : [summary(savedDeck)],
  ));
  render(<DrillPage />);
  const deck = within(await screen.findByRole("region", { name: savedDeck.title }));
  const [first, second] = savedDeck.cards;
  const user = userEvent.setup();
  await user.click(deck.getByRole("button", { name: "Quiz" }));
  const answer = deck.getByRole("textbox", { name: "Your answer" });
  const check = deck.getByRole("button", { name: "Check answer" });
  expect(check).toBeDisabled();
  await user.type(answer, "  sQuArE  ");
  await user.keyboard("{ArrowRight}");
  expect(deck.getByText(first.front)).toBeVisible();
  expect(deck.queryByText(first.back)).not.toBeInTheDocument();
  await user.click(check);
  expect(deck.getByText("Correct")).toBeVisible();
  expect(deck.getByText(first.back)).toBeVisible();

  await user.click(deck.getByRole("button", { name: "Next" }));
  expect(deck.getByText(second.front)).toBeVisible();
  expect(answer).toHaveValue("");
  expect(check).toBeDisabled();
  expect(deck.queryByText("Correct")).not.toBeInTheDocument();
  expect(deck.queryByText(second.back)).not.toBeInTheDocument();
  await user.type(answer, "Four{Enter}");
  expect(deck.getByText("Not quite")).toBeVisible();
  expect(deck.getByText(second.back)).toBeVisible();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("checks multiline answers from saved decks with Windows line endings", async () => {
  const multilineDeck: ExamDeck = {
    ...savedDeck,
    cards: [{ front: "List the two coordinate axes.", back: "X axis\r\nY axis" }],
  };
  window.history.replaceState({}, "", deckUrl(multilineDeck.id));
  fetchMock.mockImplementation(async (url) => Response.json(
    url === `${decksApi}/${multilineDeck.id}?${workspaceQuery}` ? multilineDeck : [summary(multilineDeck)],
  ));
  render(<DrillPage />);
  const deck = within(await screen.findByRole("region", { name: multilineDeck.title }));
  const user = userEvent.setup();
  await user.click(deck.getByRole("button", { name: "Quiz" }));
  const answer = deck.getByRole("textbox", { name: "Your answer" });

  await user.type(answer, "x axis{Shift>}{Enter}{/Shift}y axis");
  expect(answer).toHaveValue("x axis\ny axis");
  expect(deck.queryByText("Correct")).not.toBeInTheDocument();
  await user.keyboard("{Enter}");
  expect(deck.getByText("Correct")).toBeVisible();
  expect(deck.getByText("X axis Y axis")).toBeVisible();
});

it("offers localized retries when the list and file import fail", async () => {
  fetchMock
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce(Response.json([]))
    .mockResolvedValueOnce(Response.json({ detail: "Invalid deck" }, { status: 422 }));
  const user = userEvent.setup();
  render(<DrillPage />);

  const listError = await screen.findByRole("alert");
  expect(listError).toHaveTextContent("Could not load the list");
  await user.click(within(listError).getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("heading", { name: "Nothing here yet" })).toBeVisible();

  const picker = screen.getByLabelText<HTMLInputElement>(/^Import/);
  await user.upload(picker, new File(["invalid"], "invalid.txt", { type: "text/plain" }));
  const importError = await screen.findByRole("alert");
  expect(importError).toHaveTextContent("Import failed.");
  expect(fetchMock).toHaveBeenLastCalledWith(`${decksApi}?${workspaceQuery}`, expect.objectContaining({
    method: "POST",
    body: JSON.stringify({ title: "invalid", kind: "anki", text: "invalid" }),
  }));
  const reopenPicker = vi.spyOn(picker, "click");
  await user.click(within(importError).getByRole("button", { name: "Retry" }));
  expect(reopenPicker).toHaveBeenCalledOnce();
  expect(picker).toHaveValue("");
  expect(push).not.toHaveBeenCalled();
});
