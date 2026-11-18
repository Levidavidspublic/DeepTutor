import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FocusFrame, FocusModeProvider, FocusModeToggle } from "@/features/a11y-study/FocusMode";
import { initI18n } from "@/i18n/init";

initI18n("en");

const STORAGE_KEY = "deeptutor.focusMode";

function renderFocusMode() {
  return render(
    <FocusModeProvider>
      <FocusModeToggle />
      <FocusFrame>
        <textarea aria-label="Study task" />
      </FocusFrame>
    </FocusModeProvider>,
  );
}

afterEach(() => vi.useRealTimers());

it("switches the frame and restores the persisted focus preference", () => {
  const { unmount } = renderFocusMode();
  const toggle = screen.getByRole("button", { name: "Focus mode" });
  const task = screen.getByRole("textbox", { name: "Study task" });
  fireEvent.change(task, { target: { value: "Work in progress" } });
  expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByRole("timer")).not.toBeInTheDocument();

  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-pressed", "true");
  const frame = screen.getByRole("region", { name: "Focus mode" });
  expect(within(frame).getByRole("textbox", { name: "Study task" })).toBe(task);
  expect(task).toHaveValue("Work in progress");
  expect(within(frame).getByRole("timer", { name: "Study timer" })).toHaveTextContent("20:00");
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toEqual({ focusOn: true, minutes: 20 });

  unmount();
  renderFocusMode();
  const restoredToggle = screen.getByRole("button", { name: "Focus mode" });
  expect(restoredToggle).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("timer")).toHaveTextContent("20:00");

  fireEvent.click(restoredToggle);
  expect(restoredToggle).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toEqual({ focusOn: false, minutes: 20 });
});

it("counts down from the stored duration and announces completion after resuming", () => {
  vi.useFakeTimers();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ focusOn: true, minutes: 1 }));
  renderFocusMode();

  const timer = screen.getByRole("timer", { name: "Study timer" });
  const announcement = screen.getByRole("status");
  expect(timer).toHaveTextContent("01:00");
  expect(announcement).toHaveAttribute("aria-live", "polite");
  expect(announcement).toBeEmptyDOMElement();

  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  act(() => vi.advanceTimersByTime(1_500));
  expect(timer).toHaveTextContent("00:59");

  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  act(() => vi.advanceTimersByTime(60_000));
  expect(timer).toHaveTextContent("00:59");
  expect(announcement).toBeEmptyDOMElement();

  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  act(() => vi.advanceTimersByTime(58_499));
  expect(timer).toHaveTextContent("00:01");
  expect(announcement).toBeEmptyDOMElement();
  act(() => vi.advanceTimersByTime(1));
  expect(timer).toHaveTextContent("00:00");
  expect(announcement).toHaveTextContent("Time is up.");

  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  act(() => vi.advanceTimersByTime(60_000));
  expect(timer).toHaveTextContent("01:00");
  expect(announcement).toBeEmptyDOMElement();
});
