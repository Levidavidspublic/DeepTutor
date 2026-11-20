import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { I18nextProvider } from "react-i18next";
import { beforeEach, expect, it, vi } from "vitest";
import Page from "@/app/(workspace)/learning/exams/page";
import { getExamSubject, listExamPacks } from "@/features/exam-prep/api";
import type { ExamPackSummary } from "@/features/exam-prep/types";
import { initI18n } from "@/i18n/init";
import deApp from "@/locales/de/app.json";
import deExam from "@/locales/de/exam.json";
import viExam from "@/locales/vi/exam.json";

vi.mock("@/features/exam-prep/api", () => ({ getExamSubject: vi.fn(), listExamPacks: vi.fn() }));

const i18n = initI18n("en");

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
  vi.mocked(getExamSubject).mockReset();
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

it("encodes both IDs in each subject link and keeps Continue pointed to the first subject", async () => {
  vi.mocked(listExamPacks).mockResolvedValueOnce([pack]);

  await act(async () => {
    render(<Page />);
  });

  const card = screen.getByRole("article", { name: "Demo Exam Pack" });
  const subjects = within(card).getByRole("list", { name: "Subjects" });
  expect(within(subjects).getAllByRole("link")).toHaveLength(2);
  expect(within(card).getAllByRole("link")).toHaveLength(3);
  const mathLink = within(subjects).getByRole("link", { name: "Continue Math" });
  const scienceLink = within(subjects).getByRole("link", { name: "Continue Science" });
  expect(mathLink).toHaveAttribute("href", "/learning/exams?pack=demo+pack&subject=math%231");
  expect(scienceLink).toHaveAttribute("href", "/learning/exams?pack=demo+pack&subject=science%2Flab");
  expect(within(mathLink).getByText("Math")).toHaveAttribute("lang", pack.ui_lang);
  expect(within(scienceLink).getByText("Science")).toHaveAttribute("lang", pack.ui_lang);
  expect(within(card).getByRole("link", { name: "Continue" })).toHaveAttribute(
    "href",
    "/learning/exams?pack=demo+pack&subject=math%231",
  );
});

it("shows the linked subject's topics in the selected pack on the Exams page", async () => {
  const science = { id: "science+review", title: "Science", title_source: "Science" };
  vi.mocked(listExamPacks).mockResolvedValueOnce([
    { ...pack, subjects: [pack.subjects[0], science] },
    { ...pack, id: "another", title: "Another Exam Pack", subjects: [science] },
  ]);
  vi.mocked(getExamSubject).mockResolvedValueOnce({
    id: science.id,
    title: science.title,
    questionnaires: [],
    topics: [{ id: "motion", title: "Motion", title_source: "Motion", objectives: [], weight: 1 }],
  });

  const pageAt = (searchParams: URLSearchParams) => (
    <SearchParamsContext.Provider value={searchParams}>
      <Page />
    </SearchParamsContext.Provider>
  );
  const { rerender } = render(pageAt(new URLSearchParams({ dt_workspace: "study room" })));
  const card = await screen.findByRole("article", { name: pack.title });
  const link = within(card).getByRole("link", { name: "Continue Science" }) as HTMLAnchorElement;
  const destination = new URL(link.href);
  expect(destination.pathname).toBe("/learning/exams");
  expect(destination.searchParams.get("dt_workspace")).toBe("study room");
  expect(getExamSubject).not.toHaveBeenCalled();

  rerender(pageAt(destination.searchParams));

  const subject = await within(card).findByRole("region", { name: science.title });
  expect(await within(subject).findByText("Motion")).toBeVisible();
  expect(link).toHaveAttribute("aria-current", "true");
  expect(getExamSubject).toHaveBeenCalledExactlyOnceWith(pack.id, science.id);
  const otherPack = screen.getByRole("article", { name: "Another Exam Pack" });
  expect(within(otherPack).queryByRole("region", { name: science.title })).not.toBeInTheDocument();

  const math = pack.subjects[0];
  vi.mocked(getExamSubject).mockResolvedValueOnce({
    id: math.id,
    title: math.title,
    questionnaires: [],
    topics: [{ id: "algebra", title: "Algebra", title_source: "Algebra", objectives: [], weight: 1 }],
  });
  const continueLink = within(card).getByRole<HTMLAnchorElement>("link", { name: "Continue" });
  rerender(pageAt(new URL(continueLink.href).searchParams));

  const mathTopics = await within(card).findByRole("region", { name: math.title });
  expect(await within(mathTopics).findByText("Algebra")).toBeVisible();
  expect(within(card).queryByRole("region", { name: science.title })).not.toBeInTheDocument();
  expect(getExamSubject).toHaveBeenNthCalledWith(2, pack.id, math.id);
});

it("shows each subject's progress and any upcoming exam date", async () => {
  vi.mocked(listExamPacks).mockResolvedValueOnce([
    {
      ...pack,
      subjects: [
        { ...pack.subjects[0], progress: { done: 1, total: 4 }, exam_date: "2030-11-18" },
        { ...pack.subjects[1], progress: { done: 3, total: 4 }, exam_date: null },
        {
          id: "history",
          title: "History",
          title_source: "History",
          progress: { done: 0, total: 2 },
        },
      ],
    },
  ]);

  await act(async () => {
    render(<Page />);
  });

  const card = screen.getByRole("article", { name: "Demo Exam Pack" });
  const [math, science, history] = within(card).getAllByRole("listitem");
  const mathProgress = within(math).getByRole("progressbar", {
    name: "Progress",
    value: { min: 0, max: 4, now: 1 },
  });
  const scienceProgress = within(science).getByRole("progressbar", {
    name: "Progress",
    value: { min: 0, max: 4, now: 3 },
  });
  const historyProgress = within(history).getByRole("progressbar", {
    name: "Progress",
    value: { min: 0, max: 2, now: 0 },
  });
  expect(mathProgress).toHaveTextContent("25%");
  expect(mathProgress).toHaveAttribute("aria-valuetext", "1 / 4");
  expect(scienceProgress).toHaveTextContent("75%");
  expect(scienceProgress).toHaveAttribute("aria-valuetext", "3 / 4");
  expect(historyProgress).toHaveTextContent("0%");
  expect(historyProgress).toHaveAttribute("aria-valuetext", "0 / 2");
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

  await act(async () => {
    render(<Page />);
  });

  const card = screen.getByRole("article", { name: "Demo Exam Pack" });
  expect(within(card).getByRole("link", { name: "Continue Math" })).toBeVisible();
  expect(within(card).getByRole("link", { name: "Continue Science" })).toBeVisible();
  expect(within(card).queryByRole("progressbar")).not.toBeInTheDocument();
  expect(within(card).queryByText("Exam date")).not.toBeInTheDocument();
});

it("uses German copy and date formatting when the German resource is loaded", async () => {
  const germanI18n = i18n.cloneInstance({ lng: "de", forkResourceStore: true });
  germanI18n.addResourceBundle("de", "app", deApp);
  germanI18n.addResourceBundle("de", "exam", deExam);
  const page = (
    <I18nextProvider i18n={germanI18n}>
      <Page />
    </I18nextProvider>
  );
  vi.mocked(listExamPacks).mockResolvedValueOnce([]).mockResolvedValueOnce([
    {
      ...pack,
      subjects: [
        { ...pack.subjects[0], progress: { done: 1, total: 4 } },
        {
          ...pack.subjects[1],
          progress: { done: 0, total: 0 },
          exam_date: "2030-11-18",
        },
      ],
    },
  ]);

  const { unmount } = render(page);
  expect(await screen.findByRole("heading", { name: "Noch keine Prüfungspakete" })).toBeVisible();
  expect(screen.getByRole("heading", { level: 1, name: "Prüfungsvorbereitung" })).toBeVisible();
  expect(screen.getByText("Füge ein Prüfungspaket hinzu, um loszulegen.")).toBeVisible();
  unmount();

  render(page);
  const card = await screen.findByRole("article", { name: "Demo Exam Pack" });
  const subjects = within(card).getByRole("list", { name: "Fächer" });
  expect(within(card).getByText("Fächer")).toBeVisible();
  expect(within(subjects).getByRole("link", { name: "Weiter mit Math" })).toBeVisible();
  expect(within(subjects).getByRole("link", { name: "Weiter mit Science" })).toBeVisible();
  expect(within(card).getByRole("link", { name: "Weiter" })).toBeVisible();
  const [math, science] = within(subjects).getAllByRole("listitem");
  expect(within(math).getByRole("progressbar", { name: "Fortschritt" })).toBeVisible();
  expect(within(science).queryByRole("progressbar")).not.toBeInTheDocument();
  expect(within(science).getByText("Prüfungstermin")).toBeVisible();
  expect(within(science).getByText("18.11.2030")).toHaveAttribute("datetime", "2030-11-18");
});

it("uses Vietnamese copy for the heading, empty state, and subject navigation when the resource is loaded", async () => {
  const vietnameseI18n = i18n.cloneInstance({ lng: "vi", forkResourceStore: true });
  vietnameseI18n.addResourceBundle("vi", "exam", viExam);
  const page = (
    <I18nextProvider i18n={vietnameseI18n}>
      <Page />
    </I18nextProvider>
  );
  vi.mocked(listExamPacks).mockResolvedValueOnce([]).mockResolvedValueOnce([pack]);

  const { unmount } = render(page);
  expect(await screen.findByRole("heading", { name: "Chưa có gói ôn thi nào" })).toBeVisible();
  expect(screen.getByRole("heading", { level: 1, name: "Ôn thi" })).toBeVisible();
  expect(screen.getByText("Thêm một gói ôn thi để bắt đầu.")).toBeVisible();
  unmount();

  render(page);
  const card = await screen.findByRole("article", { name: "Demo Exam Pack" });
  const subjects = within(card).getByRole("list", { name: "Môn học" });
  expect(within(subjects).getByRole("link", { name: "Tiếp tục Math" })).toBeVisible();
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
