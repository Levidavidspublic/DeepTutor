import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import ExamsLayout from "@/app/(workspace)/learning/exams/layout";
import { initI18n } from "@/i18n/init";

vi.mock("next/font/google", () => ({
  Lexend: () => ({ style: { fontFamily: "__Lexend_test, system-ui, sans-serif" } }),
}));

initI18n("en");

it("applies saved reading comfort to the exam route on mount", async () => {
  localStorage.setItem(
    "deeptutor-study-comfort",
    JSON.stringify({
      font: "lexend",
      sizePct: 125,
      lineHeight: 1.8,
      letterSpacing: "wide",
      contrast: "high",
    }),
  );

  render(
    <ExamsLayout>
      <p>Exam material</p>
    </ExamsLayout>,
  );

  const content = screen.getByText("Exam material").parentElement;
  const comfort = content?.closest("[data-contrast]");
  await waitFor(() => expect(comfort).toHaveAttribute("data-contrast", "high"));
  expect(comfort).toHaveStyle({
    "--study-font": "__Lexend_test, system-ui, sans-serif",
    "--study-size": "125%",
    "--study-line-height": "1.8",
    "--study-letter-spacing": "0.05em",
  });
  expect(content).toHaveStyle({
    "--exam-reading-size": "1.25rem",
    fontFamily: "var(--study-font)",
    fontSize: "var(--exam-reading-size)",
    lineHeight: "var(--study-line-height)",
    letterSpacing: "var(--study-letter-spacing)",
  });
  expect(content).toHaveClass(
    "[&_.dt-page-title]:[font-size:calc(var(--exam-reading-size)*1.75)]",
    "[&_.dt-page-action]:[font-size:calc(var(--exam-reading-size)*0.78125)]",
    "[&_.text-xs]:[font-size:calc(var(--exam-reading-size)*0.75)]",
    "[&_.text-sm]:[font-size:calc(var(--exam-reading-size)*0.875)]",
    "[&_.text-base]:[font-size:var(--exam-reading-size)]",
    "[&_.text-lg]:[font-size:calc(var(--exam-reading-size)*1.125)]",
  );
});

it("opens and closes focus with the keyboard and shows exactly one study timer", async () => {
  localStorage.setItem("deeptutor.focusMode", JSON.stringify({ focusOn: false, minutes: 35 }));
  const user = userEvent.setup();
  render(
    <ExamsLayout>
      <textarea aria-label="Exam answer" />
    </ExamsLayout>,
  );

  const toggle = screen.getByRole("button", { name: "Focus mode" });
  const answer = screen.getByRole("textbox", { name: "Exam answer" });
  expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByRole("timer")).not.toBeInTheDocument();

  await user.tab();
  expect(toggle).toHaveFocus();
  await user.keyboard("{Enter}");

  expect(toggle).toHaveAttribute("aria-pressed", "true");
  const frame = screen.getByRole("region", { name: "Focus mode" });
  expect(frame).not.toContainElement(toggle);
  expect(frame).toContainElement(answer);
  const timer = within(frame).getByRole("timer", { name: "Study timer" });
  expect(screen.getAllByRole("timer")).toEqual([timer]);
  expect(timer).toHaveTextContent("35:00");

  expect(toggle).toHaveFocus();
  await user.keyboard("[Space]");
  expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Exam answer" })).toBe(answer);
});

it("restores enabled focus on mount and keeps its timer when the exam route changes", () => {
  localStorage.setItem("deeptutor.focusMode", JSON.stringify({ focusOn: true, minutes: 15 }));
  const { rerender } = render(
    <ExamsLayout>
      <p>Exam packs</p>
    </ExamsLayout>,
  );
  expect(screen.getByRole("button", { name: "Focus mode" })).toHaveAttribute("aria-pressed", "true");
  const timer = screen.getByRole("timer", { name: "Study timer" });
  expect(timer).toHaveTextContent("15:00");

  rerender(
    <ExamsLayout>
      <p>Exam topics</p>
    </ExamsLayout>,
  );
  expect(screen.getByRole("timer", { name: "Study timer" })).toBe(timer);
  expect(screen.getByRole("region", { name: "Focus mode" })).toContainElement(
    screen.getByText("Exam topics"),
  );
});
