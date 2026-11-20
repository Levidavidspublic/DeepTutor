import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useParams } from "next/navigation";
import { beforeEach, expect, it, vi } from "vitest";
import Page from "@/app/(workspace)/learning/exams/[packId]/[subjectId]/page";
import { getExamSubject, getGlossary } from "@/features/exam-prep/api";
import type { ExamSubjectDetail, GlossaryTerm } from "@/features/exam-prep/types";
import { ensureLanguage, initI18n } from "@/i18n/init";

vi.mock("next/navigation", () => ({
  useParams: vi.fn(),
  usePathname: () => "/learning/exams/demo/math",
}));
vi.mock("@/features/exam-prep/api", () => ({
  getExamSubject: vi.fn(),
  getGlossary: vi.fn(),
}));

const i18n = initI18n("en");

const subject: ExamSubjectDetail = {
  id: "math",
  title: "Algebra",
  questionnaires: [
    { code: "lines", title: "Linear models", minutes: 30, topic_weights: { slope: 0 } },
    { code: "values", title: "Values", minutes: 20, topic_weights: { roots: 0.5, graphs: 0.5 } },
  ],
  topics: [
    { id: "ratios", title: "Ratios", title_source: "יחסים", weight: 1, objectives: [], status: "done" },
    {
      id: "slope",
      title: "Slope",
      title_source: "שיפוע",
      weight: 0,
      objectives: ["Find the slope of a line."],
    },
    { id: "roots", title: "Roots", title_source: "שורשים", weight: 0.5, objectives: [], status: "learning" },
    { id: "graphs", title: "Graphs", title_source: "גרפים", weight: 0.5, objectives: [], status: "review" },
  ],
};
const term: GlossaryTerm = {
  term_source: "שיפוע",
  term_ui: "Slope",
  note: "Change in height per unit of width.",
  topic_ids: ["slope"],
};
const generalTerm: GlossaryTerm = {
  term_source: "משתנה",
  term_ui: "Variable",
  note: "",
  topic_ids: [],
};

beforeEach(async () => {
  await i18n.changeLanguage("en");
  vi.mocked(useParams).mockReturnValue({ packId: "demo", subjectId: "math" });
  vi.mocked(getExamSubject).mockReset();
  vi.mocked(getGlossary).mockReset();
});

it("groups topics by questionnaire membership and puts unassigned topics last", async () => {
  vi.mocked(getExamSubject).mockResolvedValueOnce(subject);
  render(<Page />);

  expect(screen.getByRole("status", { name: "Loading…" })).toHaveAttribute("aria-busy", "true");
  expect(await screen.findByRole("heading", { level: 1, name: "Algebra" })).toBeVisible();
  expect(getExamSubject).toHaveBeenCalledWith("demo", "math");
  expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent))
    .toEqual(["Linear models", "Values", "Other"]);
  const lines = within(screen.getByRole("region", { name: "Linear models" }));
  expect(lines.getByRole("heading", { level: 3, name: "Slope" })).toBeVisible();
  expect(lines.getByText("Find the slope of a line.")).toBeVisible();
  expect(lines.getByText("New")).toBeVisible();
  expect(lines.getByText("שיפוע")).toHaveAttribute("dir", "rtl");
  expect(lines.getByText("שיפוע")).toHaveAttribute("lang", "he");
  const values = within(screen.getByRole("region", { name: "Values" }));
  expect(values.getByText("Learning", { selector: "span" })).toBeVisible();
  expect(values.getByText("Review")).toBeVisible();
  const other = within(screen.getByRole("region", { name: "Other" }));
  expect(other.getByRole("heading", { name: "Ratios" })).toBeVisible();
  expect(other.getByText("Done")).toBeVisible();
});

it("uses the app locale for statuses and tags content with the pack languages", async () => {
  await ensureLanguage("fr");
  await i18n.changeLanguage("fr");
  vi.mocked(getExamSubject).mockResolvedValueOnce({ ...subject, source_lang: "he-IL", ui_lang: "en" });
  render(<Page />);

  expect(await screen.findByRole("heading", { name: "Algebra" })).toBeVisible();
  expect(screen.getByText("Algebra")).toHaveAttribute("lang", "en");
  expect(screen.getByText("שיפוע")).toHaveAttribute("lang", "he-IL");
  expect(screen.getByText("Find the slope of a line.")).toHaveAttribute("lang", "en");
  for (const label of ["Nouveau", "Apprentissage", "Révision", "Terminé"]) {
    expect(screen.getByText(label, { selector: "span" })).toBeVisible();
  }
});

it("retries a failed subject request and shows an empty topic map", async () => {
  const user = userEvent.setup();
  vi.mocked(getExamSubject)
    .mockRejectedValueOnce(new Error("Request failed"))
    .mockResolvedValueOnce({ ...subject, topics: [] });
  render(<Page />);

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Could not load the list");
  await user.click(within(alert).getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("heading", { name: "Nothing here yet" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Glossary" })).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(getExamSubject).toHaveBeenCalledTimes(2);
});

it("opens the subject glossary with the keyboard, traps focus, and restores it on Escape", async () => {
  const user = userEvent.setup();
  const request = Promise.withResolvers<GlossaryTerm[]>();
  vi.mocked(getExamSubject).mockResolvedValueOnce(subject);
  vi.mocked(getGlossary).mockReturnValueOnce(request.promise);
  render(<Page />);

  const trigger = await screen.findByRole("button", { name: "Glossary" });
  expect(getGlossary).not.toHaveBeenCalled();
  await user.tab();
  await user.tab();
  expect(trigger).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(getGlossary).toHaveBeenCalledWith("demo");
  const dialog = screen.getByRole("dialog", { name: "Glossary" });
  expect(within(dialog).getByRole("status", { name: "Loading…" })).toBeVisible();
  await act(async () => request.resolve([
    term,
    generalTerm,
    { ...term, term_ui: "Unrelated term", topic_ids: ["another-subject"] },
  ]));

  const chip = within(dialog).getByRole("group", { name: "שיפוע Slope" });
  expect(within(chip).getByText("שיפוע")).toHaveAttribute("dir", "rtl");
  expect(within(chip).getByText("שיפוע")).toHaveAttribute("lang", "he");
  expect(within(dialog).getByText(term.note)).toBeVisible();
  expect(within(dialog).queryByText("Unrelated term")).not.toBeInTheDocument();
  const close = within(dialog).getByRole("button", { name: "Close" });
  await waitFor(() => expect(close).toHaveFocus());
  await user.tab({ shift: true });
  expect(within(dialog).getByRole("group", { name: "משתנה Variable" })).toHaveFocus();
  await user.tab();
  expect(close).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it("retries a failed glossary request with the keyboard and renders an empty glossary", async () => {
  const user = userEvent.setup();
  vi.mocked(getExamSubject).mockResolvedValueOnce(subject);
  vi.mocked(getGlossary)
    .mockRejectedValueOnce(new Error("Request failed"))
    .mockResolvedValueOnce([]);
  render(<Page />);

  await user.click(await screen.findByRole("button", { name: "Glossary" }));
  const dialog = within(screen.getByRole("dialog", { name: "Glossary" }));
  const retry = within(await dialog.findByRole("alert")).getByRole("button", { name: "Retry" });
  const close = dialog.getByRole("button", { name: "Close" });
  await waitFor(() => expect(close).toHaveFocus());
  await user.tab();
  expect(retry).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(await dialog.findByText("Nothing here yet")).toBeVisible();
  expect(close).toHaveFocus();
  expect(getGlossary).toHaveBeenCalledTimes(2);
});

it("displays only the current subject after a previous subject response arrives late", async () => {
  const previous = Promise.withResolvers<ExamSubjectDetail>();
  vi.mocked(getExamSubject).mockReturnValueOnce(previous.promise).mockResolvedValueOnce({
    ...subject,
    id: "geometry",
    title: "Geometry",
    topics: [],
  });
  const { rerender } = render(<Page />);
  vi.mocked(useParams).mockReturnValue({ packId: "demo", subjectId: "geometry" });
  rerender(<Page />);

  expect(await screen.findByRole("heading", { name: "Geometry" })).toBeVisible();
  expect(getExamSubject).toHaveBeenLastCalledWith("demo", "geometry");
  await act(async () => previous.resolve(subject));
  expect(screen.getByRole("heading", { name: "Geometry" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Algebra" })).not.toBeInTheDocument();
});

it("closes the glossary on subject change and discards its previous request", async () => {
  const user = userEvent.setup();
  const previous = Promise.withResolvers<GlossaryTerm[]>();
  const current = Promise.withResolvers<GlossaryTerm[]>();
  vi.mocked(getExamSubject).mockResolvedValueOnce(subject).mockResolvedValueOnce({
    ...subject,
    id: "geometry",
    title: "Geometry",
    topics: [],
  });
  vi.mocked(getGlossary).mockReturnValueOnce(previous.promise).mockReturnValueOnce(current.promise);
  const { rerender } = render(<Page />);
  await user.click(await screen.findByRole("button", { name: "Glossary" }));
  expect(screen.getByRole("dialog")).toBeVisible();

  vi.mocked(useParams).mockReturnValue({ packId: "demo", subjectId: "geometry" });
  rerender(<Page />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Algebra" })).not.toBeInTheDocument();
  await user.click(await screen.findByRole("button", { name: "Glossary" }));
  const dialog = within(screen.getByRole("dialog", { name: "Glossary" }));
  await act(async () => previous.resolve([generalTerm]));
  expect(dialog.getByRole("status", { name: "Loading…" })).toBeVisible();
  expect(dialog.queryByText("Variable")).not.toBeInTheDocument();
  await act(async () => current.resolve([]));
  expect(dialog.getByText("Nothing here yet")).toBeVisible();
});
