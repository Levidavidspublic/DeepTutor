import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const localesDir = path.join(import.meta.dirname, "../../locales");
const placeholderPattern = /\{\{\s*([^{}]+?)\s*\}\}/g;

function readCatalog(locale: "en" | "he", file: string): Record<string, string> {
  return JSON.parse(readFileSync(path.join(localesDir, locale, file), "utf8"));
}

function placeholderNames(value: string) {
  return Array.from(value.matchAll(placeholderPattern), (match) => match[1].trim()).sort();
}

function numbersInText(value: string) {
  return (value.replace(placeholderPattern, " ").match(/\d+(?:[.,:/-]\d+)*/g) ?? []).sort();
}

describe.skip("Hebrew locale catalogs KITCHEN-PENDING #189", () => {
  test("has the same catalog files as English", () => {
    const englishFiles = readdirSync(path.join(localesDir, "en")).sort();
    const hebrewFiles = readdirSync(path.join(localesDir, "he")).sort();

    expect(hebrewFiles).toEqual(englishFiles);
  });

  test.each(["app.json", "common.json"])("%s uses the English keys and values", (file) => {
    expect(readCatalog("he", file)).toEqual(readCatalog("en", file));
  });

  test("exam.json has every English exam key and uses Hebrew text for each", () => {
    const english = readCatalog("en", "exam.json");
    const hebrew = readCatalog("he", "exam.json");

    expect(Object.keys(hebrew).sort()).toEqual(Object.keys(english).sort());
    for (const [key, value] of Object.entries(hebrew)) {
      expect(value, key).toBeTypeOf("string");
      expect(value.replace(placeholderPattern, ""), key).toMatch(/[א-ת]/u);
    }
  });

  test("exam.json preserves interpolation names, numbers, and numeric paper codes", () => {
    const english = readCatalog("en", "exam.json");
    const hebrew = readCatalog("he", "exam.json");

    for (const [key, value] of Object.entries(english)) {
      const translation = hebrew[key];
      expect(translation, key).toBeTypeOf("string");
      expect(placeholderNames(translation), `${key} placeholders`).toEqual(placeholderNames(value));
      expect(numbersInText(translation), `${key} numbers`).toEqual(numbersInText(value));
    }
  });
});
