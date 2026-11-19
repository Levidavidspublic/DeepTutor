import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { initI18n } from "@/i18n/init";
import {
  SETTINGS_PAGE_GROUPS,
  visibleSettingsPages,
} from "@/features/settings/navigation/settings-pages";

const storageKey = "deeptutor-study-comfort";
const localesDir = join(import.meta.dirname, "../../locales");
const settingsModule = "../../features/a11y-study/StudyComfortSettings";

const choiceFields = [
  { label: /^(?:reading )?font(?: family)?$/i, choices: [/^system/i, /^lexend$/i, /^opendyslexic$/i] },
  { label: /^letter spacing$/i, choices: [/^normal$/i, /^wide$/i] },
  { label: /^contrast$/i, choices: [/^normal$/i, /^high$/i] },
];

const sliderFields = [
  { label: /^text size\b/i, min: 100, max: 150, step: 10 },
  { label: /^line (?:height|spacing)\b/i, min: 1.5, max: 2, step: 0.1 },
  { label: /^read[ -]aloud speed\b/i, min: 0.5, max: 2, step: 0.25 },
];

const motionLabel = /^reduced motion$/i;

function readComfortMessages(locale: string): unknown {
  const file = join(localesDir, locale, "exam.json");
  return JSON.parse(readFileSync(file, "utf8")).comfort;
}

function messageKeys(messages: unknown, prefix = ""): string[] {
  if (typeof messages === "string") {
    expect(messages.trim(), prefix).not.toBe("");
    return [prefix];
  }
  expect(messages).toBeTypeOf("object");
  expect(messages).not.toBeNull();
  expect(Array.isArray(messages)).toBe(false);
  return Object.entries(messages as Record<string, unknown>).flatMap(([key, value]) =>
    messageKeys(value, prefix ? `${prefix}.${key}` : key),
  ).sort();
}

describe.skip("Study comfort settings KITCHEN-PENDING #182", () => {
  beforeEach(() => {
    initI18n("en");
  });

  it("exposes seven visibly labelled, keyboard-reachable controls with the supported choices and ranges", async () => {
    // @ts-expect-error KITCHEN-PENDING #182 not built yet
    const { StudyComfortSettings }: typeof import("@/features/a11y-study/StudyComfortSettings") =
      await import(/* @vite-ignore */ settingsModule);
    const user = userEvent.setup();
    render(<StudyComfortSettings />);

    const controls = new Set<HTMLElement>();
    for (const { label, choices } of choiceFields) {
      const select = screen.getByRole("combobox", { name: label });
      expect(screen.getByText(label, { selector: ":not(option)" })).toBeVisible();
      controls.add(select);
      const options = within(select).getAllByRole("option");
      expect(options).toHaveLength(choices.length);
      for (const choice of choices) {
        expect(within(select).getByRole("option", { name: choice })).toBeInTheDocument();
      }
    }
    for (const { label, min, max, step } of sliderFields) {
      const slider = screen.getByRole("slider", { name: label });
      expect(screen.getByText(label)).toBeVisible();
      expect(Number(slider.getAttribute("min")), label.source).toBe(min);
      expect(Number(slider.getAttribute("max")), label.source).toBe(max);
      expect(Number(slider.getAttribute("step")), label.source).toBe(step);
      controls.add(slider);
    }
    expect(screen.getByText(motionLabel)).toBeVisible();
    controls.add(screen.getByRole("switch", { name: motionLabel }));

    for (let step = 0; step < 20 && controls.size > 0; step++) {
      await user.tab();
      if (document.activeElement instanceof HTMLElement) {
        controls.delete(document.activeElement);
      }
    }
    expect([...controls]).toEqual([]);
  });

  it("saves each edit immediately to study comfort storage and restores all seven controls on remount", async () => {
    // @ts-expect-error KITCHEN-PENDING #182 not built yet
    const { StudyComfortSettings }: typeof import("@/features/a11y-study/StudyComfortSettings") =
      await import(/* @vite-ignore */ settingsModule);
    const user = userEvent.setup();
    const view = render(<StudyComfortSettings />);

    const font = () => screen.getByRole("combobox", { name: choiceFields[0].label });
    const spacing = () => screen.getByRole("combobox", { name: choiceFields[1].label });
    const contrast = () => screen.getByRole("combobox", { name: choiceFields[2].label });
    const textSize = () => screen.getByRole("slider", { name: sliderFields[0].label });
    const lineHeight = () => screen.getByRole("slider", { name: sliderFields[1].label });
    const readAloudSpeed = () => screen.getByRole("slider", { name: sliderFields[2].label });
    const reducedMotion = () => screen.getByRole("switch", { name: motionLabel });
    const stored = () => localStorage.getItem(storageKey);
    const savedSettings = () => JSON.parse(stored() ?? "{}");

    // #182 requires the provider to persist and restore the selected OpenDyslexic font.
    await user.selectOptions(font(), within(font()).getByRole("option", { name: /^opendyslexic$/i }));
    expect(savedSettings()).toMatchObject({ font: "opendyslexic" });
    fireEvent.change(textSize(), { target: { value: "130" } });
    expect(savedSettings()).toMatchObject({ sizePct: 130 });
    fireEvent.change(lineHeight(), { target: { value: "1.9" } });
    expect(savedSettings()).toMatchObject({ lineHeight: 1.9 });
    await user.selectOptions(spacing(), within(spacing()).getByRole("option", { name: /^wide$/i }));
    expect(savedSettings()).toMatchObject({ letterSpacing: "wide" });
    await user.selectOptions(contrast(), within(contrast()).getByRole("option", { name: /^high$/i }));
    expect(savedSettings()).toMatchObject({ contrast: "high" });

    const beforeSpeed = stored();
    fireEvent.change(readAloudSpeed(), { target: { value: "1.75" } });
    expect(stored()).not.toBe(beforeSpeed);
    expect(reducedMotion()).not.toBeChecked();
    const beforeMotion = stored();
    await user.click(reducedMotion());
    expect(stored()).not.toBe(beforeMotion);

    view.unmount();
    render(<StudyComfortSettings />);
    await waitFor(() => {
      expect(font()).toHaveDisplayValue(/^opendyslexic$/i);
      expect(textSize()).toHaveValue("130");
      expect(lineHeight()).toHaveValue("1.9");
      expect(spacing()).toHaveDisplayValue(/^wide$/i);
      expect(contrast()).toHaveDisplayValue(/^high$/i);
      expect(readAloudSpeed()).toHaveValue("1.75");
      expect(reducedMotion()).toBeChecked();
    });
  });

  it("registers Study comfort under Learning & conversation", () => {
    const pages = visibleSettingsPages({
      resolved: true,
      hideAdminOnly: true,
      showLearnerOnly: true,
      showGuardianOnly: false,
    });
    const comfortPages = pages.filter(({ key }) => key === "study-comfort");
    expect(comfortPages).toHaveLength(1);
    expect(comfortPages[0]).toMatchObject({
      label: "Study comfort",
      href: "/settings/study-comfort",
      blurb: expect.stringMatching(/\S/),
      icon: expect.anything(),
    });
    expect(SETTINGS_PAGE_GROUPS.find(({ label }) => label === "Learning & conversation")?.keys)
      .toContain("study-comfort");
  });

  it("provides the comfort translation keys in every exam locale", () => {
    const english = readComfortMessages("en");
    expect(english).toBeTypeOf("object");
    const englishKeys = messageKeys(english);
    expect(englishKeys.length).toBeGreaterThanOrEqual(7);

    const locales = readdirSync(localesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "en");
    for (const { name } of locales) {
      const messages = readComfortMessages(name);
      expect(messages, name).toBeTypeOf("object");
      expect(messageKeys(messages), name).toEqual(englishKeys);
    }
  });
});
