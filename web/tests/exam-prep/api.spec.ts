import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getExamSubject,
  getGlossary,
  listExamPacks,
  reloadExamPacks,
} from "@/features/exam-prep/api";
import type {
  ExamPackSummary,
  ExamSubjectDetail,
  GlossaryTerm,
} from "@/features/exam-prep/types";
import { ApiError } from "@/shared/api/errors";

describe("Exam Packs API", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("lists exam packs", async () => {
    const packs: ExamPackSummary[] = [
      {
        id: "demo",
        title: "Demo Exam Pack",
        exam: "Demo Exam",
        source_lang: "he",
        ui_lang: "en",
        subjects: [{ id: "math", title: "Math", title_source: "מתמטיקה" }],
      },
    ];
    fetchMock.mockResolvedValueOnce(Response.json(packs));

    await expect(listExamPacks()).resolves.toEqual(packs);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/exam-packs?dt_workspace=", {
      credentials: "include",
      method: "GET",
    });
  });

  it("gets subject details and encodes both identifiers", async () => {
    const subject: ExamSubjectDetail = {
      id: "math#1",
      title: "Math",
      questionnaires: [
        { code: "demo", title: "Algebra", minutes: 30, topic_weights: { lines: 1 } },
      ],
      topics: [
        {
          id: "lines",
          title: "Lines",
          title_source: "ישרים",
          weight: 1,
          objectives: ["Find the slope of a line"],
        },
      ],
    };
    fetchMock.mockResolvedValueOnce(Response.json(subject));

    await expect(getExamSubject("demo pack", "math#1")).resolves.toEqual(subject);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "/api/exam-packs/demo%20pack/subjects/math%231?dt_workspace=",
      { credentials: "include", method: "GET" },
    );
  });

  it("gets glossary terms with an encoded search query", async () => {
    const terms: GlossaryTerm[] = [
      { term_source: "שיפוע", term_ui: "Slope", note: "Rise over run", topic_ids: ["lines"] },
    ];
    fetchMock.mockResolvedValueOnce(Response.json(terms));

    await expect(getGlossary("demo pack", "שיפוע & slope")).resolves.toEqual(terms);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "/api/exam-packs/demo%20pack/glossary?q=%D7%A9%D7%99%D7%A4%D7%95%D7%A2+%26+slope&dt_workspace=",
      { credentials: "include", method: "GET" },
    );
  });

  it("omits the glossary search parameter when no query is supplied", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([]));

    await expect(getGlossary("demo")).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "/api/exam-packs/demo/glossary?dt_workspace=",
      { credentials: "include", method: "GET" },
    );
  });

  it("reloads exam packs with a POST and returns the count", async () => {
    const result = { count: 1 };
    fetchMock.mockResolvedValueOnce(Response.json(result));

    await expect(reloadExamPacks()).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "/api/exam-packs/reload?dt_workspace=",
      { credentials: "include", method: "POST" },
    );
  });

  it("throws the shared API error on a 404", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ detail: "Subject not found" }, { status: 404 }),
    );

    const result = getExamSubject("demo", "missing");
    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toMatchObject({
      message: "Subject not found",
      status: 404,
    });
  });
});
