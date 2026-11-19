import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
  const { promise, resolve } = Promise.withResolvers<ExamPackSummary[]>();
  vi.mocked(listExamPacks).mockReturnValueOnce(promise);

  render(<Page />);

  expect(screen.getByRole("heading", { level: 1, name: "Exam prep" })).toBeVisible();
  expect(screen.getByRole("status", { name: "Loading…" })).toHaveAttribute("aria-busy", "true");

  await act(async () => {
    resolve([
      pack,
      {
        ...pack,
        id: "another",
        title: "Another Exam Pack",
        subjects: [{ id: "history", title: "History", title_source: "History" }],
      },
    ]);
  });

  const first = screen.getByRole("article", { name: "Demo Exam Pack" });
  const second = screen.getByRole("article", { name: "Another Exam Pack" });
  expect(screen.getAllByRole("article")).toHaveLength(2);
  expect(within(first).getByText("Math")).toBeVisible();
  expect(within(first).getByText("Science")).toBeVisible();
  expect(within(second).getByText("History")).toBeVisible();
  expect(screen.queryByRole("status", { name: "Loading…" })).not.toBeInTheDocument();
});

it("shows the empty state with a plain next step", async () => {
  vi.mocked(listExamPacks).mockResolvedValueOnce([]);

  await act(async () => {
    render(<Page />);
  });

  expect(screen.getByRole("heading", { name: "No exam packs yet" })).toBeVisible();
  expect(screen.getByText("Add an exam pack to get started.")).toBeVisible();
  expect(screen.queryByRole("link", { name: "Add an exam pack to get started." })).not.toBeInTheDocument();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
});

it("gives each subject a named Continue link with both path segments encoded", async () => {
  vi.mocked(listExamPacks).mockResolvedValueOnce([pack]);

  await act(async () => {
    render(<Page />);
  });

  const card = screen.getByRole("article", { name: "Demo Exam Pack" });
  expect(within(card).getAllByRole("link")).toHaveLength(2);
  const mathLink = within(card).getByRole("link", { name: "Continue Math" });
  const scienceLink = within(card).getByRole("link", { name: "Continue Science" });
  expect(mathLink).toHaveAttribute("href", "/learning/exams/demo%20pack/math%231");
  expect(scienceLink).toHaveAttribute("href", "/learning/exams/demo%20pack/science%2Flab");
  expect(within(mathLink).getByText("Math")).toHaveAttribute("lang", pack.ui_lang);
  expect(within(scienceLink).getByText("Science")).toHaveAttribute("lang", pack.ui_lang);
});

it("keeps a pack with no subjects visible without a broken Continue link", async () => {
  vi.mocked(listExamPacks).mockResolvedValueOnce([{ ...pack, subjects: [] }]);

  await act(async () => {
    render(<Page />);
  });

  const card = screen.getByRole("article", { name: "Demo Exam Pack" });
  expect(card).toBeVisible();
  expect(within(card).queryByRole("link")).not.toBeInTheDocument();
});

it("offers Retry after a failure and shows the result of the new request", async () => {
  vi.mocked(listExamPacks)
    .mockRejectedValueOnce(new Error("Request failed"))
    .mockResolvedValueOnce([pack]);

  await act(async () => {
    render(<Page />);
  });

  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent("Could not load the list");
  expect(screen.queryByRole("heading", { name: "No exam packs yet" })).not.toBeInTheDocument();
  await act(async () => {
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
  });

  expect(screen.getByRole("article", { name: "Demo Exam Pack" })).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(listExamPacks).toHaveBeenCalledTimes(2);
});
