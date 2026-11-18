import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import Page from "@/app/(workspace)/learning/exams/page";
import { listExamPacks } from "@/features/exam-prep/api";
import type { ExamPackSummary } from "@/features/exam-prep/types";
import { initI18n } from "@/i18n/init";

vi.mock("@/features/exam-prep/api", () => ({ listExamPacks: vi.fn() }));

initI18n("en");

const pack: ExamPackSummary = {
  id: "demo pack",
  title: "Demo Exam Pack",
  exam: "Demo Exam",
  source_lang: "en",
  ui_lang: "en",
  subjects: [
    { id: "math#1", title: "Math", title_source: "Math" },
    { id: "science/lab", title: "Science", title_source: "Science" },
  ],
};

beforeEach(() => {
  vi.mocked(listExamPacks).mockReset();
});

it("shows loading, then one card per pack with its subject names", async () => {
  vi.mocked(listExamPacks).mockResolvedValueOnce([
    pack,
    {
      ...pack,
      id: "another",
      title: "Another Exam Pack",
      subjects: [{ id: "history", title: "History", title_source: "History" }],
    },
  ]);

  render(<Page />);

  expect(screen.getByRole("heading", { level: 1, name: "Exam prep" })).toBeVisible();
  expect(screen.getByRole("status", { name: "Loading…" })).toHaveAttribute("aria-busy", "true");
  const first = await screen.findByRole("article", { name: "Demo Exam Pack" });
  const second = screen.getByRole("article", { name: "Another Exam Pack" });
  expect(screen.getAllByRole("article")).toHaveLength(2);
  expect(within(first).getByText("Math")).toBeVisible();
  expect(within(first).getByText("Science")).toBeVisible();
  expect(within(second).getByText("History")).toBeVisible();
  expect(screen.queryByRole("status", { name: "Loading…" })).not.toBeInTheDocument();
});

it("shows the empty state with a link to the pack instructions", async () => {
  vi.mocked(listExamPacks).mockResolvedValueOnce([]);

  render(<Page />);

  expect(await screen.findByRole("heading", { name: "No exam packs yet" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Add an exam pack to get started." })).toHaveAttribute(
    "href",
    expect.stringContaining("/fork/docs/BACKEND_SCHEMA.md#storage-map"),
  );
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
});

it("gives each subject a named Continue link with both path segments encoded", async () => {
  vi.mocked(listExamPacks).mockResolvedValueOnce([pack]);

  render(<Page />);

  const card = await screen.findByRole("article", { name: "Demo Exam Pack" });
  expect(within(card).getAllByRole("link")).toHaveLength(2);
  const mathLink = within(card).getByRole("link", { name: "Continue Math" });
  const scienceLink = within(card).getByRole("link", { name: "Continue Science" });
  expect(mathLink).toHaveAttribute(
    "href",
    "/learning/exams/demo%20pack/math%231",
  );
  expect(scienceLink).toHaveAttribute(
    "href",
    "/learning/exams/demo%20pack/science%2Flab",
  );
  expect(within(mathLink).getByText("Math")).toHaveAttribute("lang", pack.ui_lang);
  expect(within(scienceLink).getByText("Science")).toHaveAttribute("lang", pack.ui_lang);
});

it("shows each subject's progress and any upcoming exam date", async () => {
  vi.mocked(listExamPacks).mockResolvedValueOnce([
    {
      ...pack,
      subjects: [
        { ...pack.subjects[0], progress: { done: 1, total: 4 }, exam_date: "2030-11-18" },
        { ...pack.subjects[1], progress: { done: 3, total: 4 }, exam_date: null },
      ],
    },
  ]);

  render(<Page />);

  const card = await screen.findByRole("article", { name: "Demo Exam Pack" });
  const [math, science] = within(card).getAllByRole("listitem");
  const mathProgress = within(math).getByRole("progressbar", { name: "Progress" });
  const scienceProgress = within(science).getByRole("progressbar", { name: "Progress" });
  expect(mathProgress).toHaveTextContent("25%");
  expect(mathProgress).toHaveAttribute("aria-valuetext", "1 / 4");
  expect(scienceProgress).toHaveTextContent("75%");
  expect(scienceProgress).toHaveAttribute("aria-valuetext", "3 / 4");
  expect(within(math).getByText("Exam date")).toBeVisible();
  expect(within(math).getByText("Nov 18, 2030")).toHaveAttribute("datetime", "2030-11-18");
  expect(within(science).queryByText("Exam date")).not.toBeInTheDocument();
});

it("omits missing dates and progress when the fields are absent or there are zero topics", async () => {
  vi.mocked(listExamPacks).mockResolvedValueOnce([
    {
      ...pack,
      subjects: [pack.subjects[0], { ...pack.subjects[1], progress: { done: 0, total: 0 } }],
    },
  ]);

  render(<Page />);

  const card = await screen.findByRole("article", { name: "Demo Exam Pack" });
  expect(within(card).getByRole("link", { name: "Continue Math" })).toBeVisible();
  expect(within(card).getByRole("link", { name: "Continue Science" })).toBeVisible();
  expect(within(card).queryByRole("progressbar")).not.toBeInTheDocument();
  expect(within(card).queryByText("Exam date")).not.toBeInTheDocument();
});

it("keeps a pack with no subjects visible without a broken Continue link", async () => {
  vi.mocked(listExamPacks).mockResolvedValueOnce([{ ...pack, subjects: [] }]);

  render(<Page />);

  const card = await screen.findByRole("article", { name: "Demo Exam Pack" });
  expect(card).toBeVisible();
  expect(within(card).queryByRole("link")).not.toBeInTheDocument();
});

it("offers Retry after a failure and shows the result of the new request", async () => {
  vi.mocked(listExamPacks)
    .mockRejectedValueOnce(new Error("Request failed"))
    .mockResolvedValueOnce([pack]);

  render(<Page />);

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Could not load the list");
  expect(screen.queryByRole("heading", { name: "No exam packs yet" })).not.toBeInTheDocument();
  fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));

  expect(await screen.findByRole("article", { name: "Demo Exam Pack" })).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(listExamPacks).toHaveBeenCalledTimes(2);
});
