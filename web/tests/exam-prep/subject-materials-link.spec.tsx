import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pageActionClass } from "@/components/layout/FeaturePage";
import type { ExamSubjectDetail } from "@/features/exam-prep/types";
import { initI18n } from "@/i18n/init";

type SubjectTopicMapModule = {
  SubjectTopicMap: ComponentType<{ packId: string; subjectId: string }>;
};

// Keep Vite from resolving the component while collecting the pending tests.
const subjectTopicMapPath = "../../features/exam-prep/components/SubjectTopicMap";
const materialsPath = "/learning/reading/materials";
const packId = "algebra + graphs & review=100% #2";
const workspaceId = "exam practice & review";
const previousLocation = window.location.href;
const i18n = initI18n("en");

const subject: ExamSubjectDetail = {
  id: "math",
  title: "Algebra",
  questionnaires: [],
  topics: [
    { id: "slope", title: "Slope", title_source: "Slope", weight: 1, objectives: [] },
    { id: "graphs", title: "Graphs", title_source: "Graphs", weight: 1, objectives: [] },
  ],
};

function expectMaterialsDestination(
  link: HTMLElement,
  expectedPackId: string,
  expectedWorkspaceId: string,
) {
  const destination = new URL(link.getAttribute("href") ?? "", window.location.origin);
  expect(destination.origin).toBe(window.location.origin);
  expect(destination.pathname).toBe(materialsPath);
  expect([...destination.searchParams]).toHaveLength(2);
  expect(destination.searchParams.get("pack")).toBe(expectedPackId);
  expect(destination.searchParams.get("dt_workspace")).toBe(expectedWorkspaceId);
  expect(destination.hash).toBe("");
}

describe.skip("S3 Materials link KITCHEN-PENDING #68", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", previousLocation);
  });

  it("adds one keyboard-reachable secondary Materials link in the loaded subject header", async () => {
    const { SubjectTopicMap } = (await import(
      /* @vite-ignore */ subjectTopicMapPath
    )) as SubjectTopicMapModule;
    window.history.replaceState(
      {},
      "",
      `/learning/exams/${encodeURIComponent(packId)}/${subject.id}?dt_workspace=${encodeURIComponent(workspaceId)}`,
    );
    const request = Promise.withResolvers<Response>();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockReturnValue(request.promise));

    const user = userEvent.setup();
    render(<SubjectTopicMap packId={packId} subjectId={subject.id} />);

    expect(screen.getByRole("status", { name: "Loading…" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Materials" })).toBeNull();
    await act(async () => request.resolve(Response.json(subject)));

    const heading = await screen.findByRole("heading", { level: 1, name: subject.title });
    const header = heading.closest("header")!;
    const materials = within(header).getByRole("link", { name: "Materials" });
    expect(screen.getAllByRole("link", { name: "Materials" })).toEqual([materials]);
    expect(materials).toHaveClass(pageActionClass("secondary"));
    expectMaterialsDestination(materials, packId, workspaceId);

    for (let step = 0; step < 5 && document.activeElement !== materials; step++) {
      await user.tab();
    }
    expect(materials).toHaveFocus();

    const topicGroup = within(screen.getByRole("region", { name: "Other" }));
    for (const topic of subject.topics) {
      const row = within(topicGroup.getByRole("heading", { name: topic.title }).closest("li")!);
      expect(row.getByRole("button", { name: "Study" })).toBeVisible();
      expect(row.getByRole("link", { name: "Teach back" })).toBeVisible();
    }
  });

  it("offers the pack's Materials link for a loaded subject with no topics in General", async () => {
    const { SubjectTopicMap } = (await import(
      /* @vite-ignore */ subjectTopicMapPath
    )) as SubjectTopicMapModule;
    const anotherPackId = "geometry-pack";
    const emptySubject = { ...subject, id: "geometry", title: "Geometry", topics: [] };
    window.history.replaceState(
      {},
      "",
      `/learning/exams/${anotherPackId}/${emptySubject.id}?dt_workspace=`,
    );
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json(emptySubject)));

    render(<SubjectTopicMap packId={anotherPackId} subjectId={emptySubject.id} />);

    const heading = await screen.findByRole("heading", { level: 1, name: emptySubject.title });
    const materials = within(heading.closest("header")!).getByRole("link", { name: "Materials" });
    expectMaterialsDestination(materials, anotherPackId, "");
  });
});
