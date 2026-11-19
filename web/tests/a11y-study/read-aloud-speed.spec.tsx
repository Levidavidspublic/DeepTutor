import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReadAloudButton } from "@/features/a11y-study/ReadAloudButton";
import { StudyComfortProvider, useStudyComfort } from "@/features/a11y-study/StudyComfortProvider";
import { clampStudyComfort, DEFAULT_STUDY_COMFORT } from "@/features/a11y-study/studyComfort";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const storageKey = "deeptutor-study-comfort";
const defaults = { readAloudRate: 1, reducedMotion: false };
const studyText = "Review the slope of a line.";

class MockUtterance {
  rate = 1;

  constructor(readonly text: string) {}
}

const speechSynthesis = { speak: vi.fn(), cancel: vi.fn() };

describe("Study comfort speech and motion settings", () => {
  it("defaults to 1x speech with reduced motion off", () => {
    expect(DEFAULT_STUDY_COMFORT).toMatchObject(defaults);
    expect(clampStudyComfort({})).toMatchObject(defaults);
  });

  it.each([
    { rate: 0.25, expectedRate: 0.5 },
    { rate: 0.5, expectedRate: 0.5 },
    { rate: 1.25, expectedRate: 1.25 },
    { rate: 2, expectedRate: 2 },
    { rate: 3, expectedRate: 2 },
    { rate: "1.25", expectedRate: 1 },
    { rate: Number.NaN, expectedRate: 1 },
    { rate: Number.POSITIVE_INFINITY, expectedRate: 1 },
  ])("normalizes read-aloud speed $rate to $expectedRate", ({ rate, expectedRate }) => {
    expect(clampStudyComfort({ readAloudRate: rate })).toMatchObject({ readAloudRate: expectedRate });
  });

  it.each([
    { value: true, expected: true },
    { value: false, expected: false },
    { value: "true", expected: false },
    { value: 1, expected: false },
    { value: null, expected: false },
  ])("normalizes reduced motion $value to $expected", ({ value, expected }) => {
    expect(clampStudyComfort({ reducedMotion: value })).toMatchObject({ reducedMotion: expected });
  });

  it("restores legacy preferences with defaults for the two new fields", async () => {
    const legacySettings = { font: "lexend", sizePct: 120, contrast: "high" };
    localStorage.setItem(storageKey, JSON.stringify(legacySettings));

    const { result } = renderHook(useStudyComfort, { wrapper: StudyComfortProvider });

    await waitFor(() => expect(result.current.settings).toMatchObject({ ...legacySettings, ...defaults }));
  });

  it("reads the provider context optionally and returns null outside the provider", async () => {
    const { useOptionalStudyComfort } = await import("@/features/a11y-study/StudyComfortProvider");

    const outside = renderHook(() => useOptionalStudyComfort());
    expect(outside.result.current).toBeNull();

    const inside = renderHook(() => ({
      optional: useOptionalStudyComfort(),
      required: useStudyComfort(),
    }), { wrapper: StudyComfortProvider });
    expect(inside.result.current.optional).toBe(inside.result.current.required);
  });

  it("saves preference updates and removes the motion attribute when switched off", async () => {
    const enabled = { contrast: "high", readAloudRate: 1.75, reducedMotion: true } as const;
    const disabled = { ...enabled, reducedMotion: false };

    function Controls() {
      const { updateSettings } = useStudyComfort();
      return (
        <>
          <button onClick={() => updateSettings(enabled)}>Enable reduced motion</button>
          <button onClick={() => updateSettings(disabled)}>Disable reduced motion</button>
        </>
      );
    }

    const tree = <StudyComfortProvider><Controls /></StudyComfortProvider>;
    const view = render(tree);
    const enable = screen.getByRole("button", { name: "Enable reduced motion" });
    expect(enable.parentElement).not.toHaveAttribute("data-reduced-motion");

    fireEvent.click(enable);
    expect(enable.parentElement).toHaveAttribute("data-reduced-motion", "true");
    expect(JSON.parse(localStorage.getItem(storageKey) ?? "null")).toMatchObject(enabled);

    view.unmount();
    render(tree);
    const disable = screen.getByRole("button", { name: "Disable reduced motion" });
    await waitFor(() => expect(disable.parentElement).toHaveAttribute("data-reduced-motion", "true"));

    fireEvent.click(disable);
    expect(disable.parentElement).not.toHaveAttribute("data-reduced-motion");
    expect(JSON.parse(localStorage.getItem(storageKey) ?? "null")).toMatchObject(disabled);
  });

  describe("ReadAloudButton playback", () => {
    beforeEach(() => {
      vi.stubGlobal("speechSynthesis", speechSynthesis);
      vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);
    });

    afterEach(() => vi.unstubAllGlobals());

    it.each([
      { rate: undefined, expectedRate: 1.75 },
      { rate: 0.75, expectedRate: 0.75 },
    ])("uses $expectedRate with a saved preference of 1.75 and explicit rate $rate", async ({ rate, expectedRate }) => {
      localStorage.setItem(storageKey, JSON.stringify({ readAloudRate: 1.75, contrast: "high" }));
      render(
        <StudyComfortProvider>
          <ReadAloudButton text={studyText} rate={rate} />
        </StudyComfortProvider>,
      );
      const button = screen.getByRole("button", { name: "Read aloud" });
      await waitFor(() => expect(button.closest("[data-contrast]")).toHaveAttribute("data-contrast", "high"));

      fireEvent.click(button);
      expect(speechSynthesis.speak).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ text: studyText, rate: expectedRate }),
      );
    });

    it("reads at 1x when there is no provider or explicit rate", () => {
      localStorage.setItem(storageKey, JSON.stringify({ readAloudRate: 1.75 }));
      render(<ReadAloudButton text={studyText} />);

      fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));
      expect(speechSynthesis.speak).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ text: studyText, rate: 1 }),
      );
    });
  });
});
