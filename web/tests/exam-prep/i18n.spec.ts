import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

import { initI18n } from "@/i18n/init";
import frExam from "@/locales/fr/exam.json";

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

test("fr/exam.json provides French copy for Exams home", () => {
  expect(frExam).toMatchObject({
    title: "Préparation aux examens",
    "empty.title": "Aucun pack de préparation pour le moment",
    "empty.body": "Ajoutez un pack de préparation pour commencer.",
    subjects: "Matières",
    continue: "Continuer",
  });
});

test("the exam namespace resolves a Phase 1 string through the English fallback", () => {
  const i18n = initI18n("fr");

  expect(i18n.options.ns).toContain("exam");
  expect(i18n.t("empty.title", { ns: "exam" })).toBe("No exam packs yet");
});
