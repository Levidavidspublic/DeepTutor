import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

import { initI18n } from "@/i18n/init";
import ukExam from "@/locales/uk/exam.json";

const localesDir = path.join(import.meta.dirname, "../../locales");
const otherLocales = readdirSync(localesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "en")
  .map((entry) => entry.name)
  .sort();

function examKeys(locale: string) {
  const file = path.join(localesDir, locale, "exam.json");
  return Object.keys(JSON.parse(readFileSync(file, "utf8"))).sort();
}

const englishKeys = examKeys("en");

test("en/exam.json contains the Phase 1 keys", () => {
  expect(englishKeys).toEqual([
    "continue",
    "drill",
    "empty.body",
    "empty.title",
    "examDate",
    "focus.off",
    "focus.on",
    "glossary",
    "mock",
    "nextSession",
    "progress",
    "readAloud",
    "rtlNote",
    "study",
    "subjects",
    "teachBack",
    "title",
  ]);
});

test.each(otherLocales)("%s/exam.json matches the English key set", (locale) => {
  expect(examKeys(locale)).toEqual(englishKeys);
});

test("uk/exam.json has no English-only labels", () => {
  for (const [key, label] of Object.entries(ukExam)) {
    expect(label, key).toMatch(/\p{Script=Cyrillic}/u);
  }
});

test("the exam namespace resolves a Phase 1 string through the English fallback", () => {
  const i18n = initI18n("fr");

  expect(i18n.options.ns).toContain("exam");
  expect(i18n.t("empty.title", { ns: "exam" })).toBe("No exam packs yet");
});
