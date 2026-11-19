import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

it.each([
  { font: "lexend", family: "Lexend" },
  { font: "opendyslexic", family: "OpenDyslexic" },
] as const)("declares and restores the bundled $family preference", async ({ font, family }) => {
  function ComfortControls() {
    const { settings, updateSettings } = useStudyComfort();
    return (
      <button
        onClick={() => {
          updateSettings({ font, sizePct: 170 });
          updateSettings({ lineHeight: 1.8, letterSpacing: "wide", contrast: "high" });
        }}
      >
        Text size {settings.sizePct}%
      </button>
    );
  }

  const view = render(
    <StudyComfortProvider>
      <ComfortControls />
    </StudyComfortProvider>,
  );
  const button = screen.getByRole("button", { name: "Text size 100%" });
  const face = Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .find(
      (rule): rule is CSSFontFaceRule =>
        rule.type === CSSRule.FONT_FACE_RULE &&
        (rule as CSSFontFaceRule).style.getPropertyValue("font-family") === family,
    );
  expect(face).toBeDefined();
  // jsdom parses the font-face rule but drops the src descriptor from the CSSOM.
  expect(view.container.querySelector("style")).toHaveTextContent(
    `font-family: ${family}; src: url("/study-fonts/${font}.woff") format("woff");`,
  );
  const asset = readFileSync(resolve("public", "study-fonts", `${font}.woff`));
  expect(asset.toString("ascii", 0, 4)).toBe("wOFF");

  fireEvent.click(button);
  expect(button).toHaveAccessibleName("Text size 150%");
  expect(button.parentElement).toHaveStyle({
    "--study-font": `${family}, system-ui, sans-serif`,
    "--study-size": "150%",
    "--study-line-height": "1.8",
    "--study-letter-spacing": "0.05em",
  });
  expect(button.parentElement).toHaveAttribute("data-contrast", "high");

  view.unmount();
  render(
    <StudyComfortProvider>
      <ComfortControls />
    </StudyComfortProvider>,
  );
  const restored = await screen.findByRole("button", { name: "Text size 150%" });
  expect(restored.parentElement).toHaveStyle({
    "--study-font": `${family}, system-ui, sans-serif`,
    "--study-size": "150%",
    "--study-line-height": "1.8",
    "--study-letter-spacing": "0.05em",
  });
  expect(restored.parentElement).toHaveAttribute("data-contrast", "high");
});
