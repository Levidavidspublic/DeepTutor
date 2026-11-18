import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

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
