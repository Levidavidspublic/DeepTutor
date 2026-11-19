import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import {
  StudyComfortProvider,
  useStudyComfort,
} from "@/features/a11y-study/StudyComfortProvider";
import { clampStudyComfort } from "@/features/a11y-study/studyComfort";

it("applies the default study comfort settings to the wrapper", () => {
  render(
    <StudyComfortProvider>
      <p>Study material</p>
    </StudyComfortProvider>,
  );

  const wrapper = screen.getByText("Study material").parentElement;
  expect(wrapper).toHaveStyle({
    "--study-font": "system-ui, sans-serif",
    "--study-size": "100%",
    "--study-line-height": "1.6",
    "--study-letter-spacing": "normal",
  });
  expect(wrapper).toHaveAttribute("data-contrast", "normal");
});

it("clamps both numeric ranges and uses defaults for invalid settings", () => {
  expect(clampStudyComfort({ sizePct: 80, lineHeight: 3 })).toMatchObject({
    sizePct: 100,
    lineHeight: 2,
  });
  expect(clampStudyComfort({ sizePct: 200, lineHeight: 1 })).toMatchObject({
    sizePct: 150,
    lineHeight: 1.5,
  });
  expect(
    clampStudyComfort({
      font: "unknown",
      sizePct: "120",
      lineHeight: Number.NaN,
      letterSpacing: "tight",
      contrast: "low",
    }),
  ).toEqual({
    font: "system",
    sizePct: 100,
    lineHeight: 1.6,
    letterSpacing: "normal",
    contrast: "normal",
  });
});

it.each(["lexend", "opendyslexic"] as const)(
  "uses the system font for %s while applying and restoring other preferences",
  async (font) => {
    const storageKey = "deeptutor-study-comfort";

    function ComfortControls() {
      const { settings, updateSettings } = useStudyComfort();
      return (
        <button
          onClick={() => {
            updateSettings({ font, sizePct: 170 });
            updateSettings({ lineHeight: 1.8, letterSpacing: "wide", contrast: "high" });
          }}
        >
          {settings.font}, text size {settings.sizePct}%
        </button>
      );
    }

    const view = render(
      <StudyComfortProvider>
        <ComfortControls />
      </StudyComfortProvider>,
    );
    const button = screen.getByRole("button", { name: "system, text size 100%" });
    fireEvent.click(button);
    expect(button).toHaveAccessibleName("system, text size 150%");
    expect(button.parentElement).toHaveStyle({
      "--study-font": "system-ui, sans-serif",
      "--study-size": "150%",
      "--study-line-height": "1.8",
      "--study-letter-spacing": "0.05em",
    });
    expect(button.parentElement).toHaveAttribute("data-contrast", "high");
    const savedSettings = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    expect(savedSettings).toEqual({
      font: "system",
      sizePct: 150,
      lineHeight: 1.8,
      letterSpacing: "wide",
      contrast: "high",
    });

    view.unmount();
    localStorage.setItem(storageKey, JSON.stringify({ ...savedSettings, font }));
    render(
      <StudyComfortProvider>
        <ComfortControls />
      </StudyComfortProvider>,
    );
    const restored = await screen.findByRole("button", { name: "system, text size 150%" });
    expect(restored.parentElement).toHaveStyle({
      "--study-font": "system-ui, sans-serif",
      "--study-size": "150%",
      "--study-line-height": "1.8",
      "--study-letter-spacing": "0.05em",
    });
    expect(restored.parentElement).toHaveAttribute("data-contrast", "high");
  },
);
