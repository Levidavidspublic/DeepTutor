import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExamSubjectDetail } from "@/features/exam-prep/types";
import { initI18n } from "@/i18n/init";

const packId = "demo pack";
const subjectId = "math#1";
const topicId = "linear + slope";
const workspaceId = "exam-practice";
const subjectPath = "/learning/exams/demo%20pack/math%231";
const subjectApi = "/api/exam-packs/demo%20pack/subjects/math%231";
const topicDeckUrl = `${subjectApi}/topics/linear%20%2B%20slope/deck?dt_workspace=${workspaceId}`;
const noCards = "No drill cards for this topic yet";

// Vite resolves literal dynamic imports during collection, even in skipped tests.
const decksModule = "@/features/exam-prep/decksApi";
const topicMapModule = "@/features/exam-prep/components/SubjectTopicMap";

const subject: ExamSubjectDetail = {
  id: subjectId,
  title: "Algebra",
  questionnaires: [],
  topics: [
    { id: topicId, title: "Slope", title_source: "Slope", weight: 1, objectives: [] },
    { id: "intercepts", title: "Intercepts", title_source: "Intercepts", weight: 1, objectives: [] },
  ],
};

const deck = {
  id: "a1c7a3c1-9b51-5b59-8c48-2f016daa565e",
  title: "Slope",
  source: "topic",
  cards: [{ front: "שיפוע", back: "Slope", topic_id: topicId }],
};

const navigate = vi.fn<(href: string) => void>();
vi.mock("next/navigation", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/navigation")>(),
  usePathname: () => subjectPath,
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: navigate, replace: navigate }),
  redirect: (href: string) => navigate(href),
}));

const fetchMock = vi.fn<typeof fetch>();
const i18n = initI18n("en");

async function topicRow(title: string) {
  const heading = await screen.findByRole("heading", { name: title });
  const row = heading.closest("li");
  if (!row) throw new Error(`Could not find the topic row for ${title}`);
  return within(row);
}

async function expectDrillNavigation() {
  await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
  const [[href]] = navigate.mock.calls;
  const url = new URL(href, window.location.origin);
  expect(url.pathname).toBe(`${subjectPath}/drill`);
  expect(url.searchParams.get("deck")).toBe(deck.id);
  expect(url.searchParams.get("dt_workspace")).toBe(workspaceId);
}

describe.skip("S3 topic Drill KITCHEN-PENDING #184", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    window.history.replaceState({}, "", `${subjectPath}?dt_workspace=${workspaceId}`);
    fetchMock.mockReset();
    navigate.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/");
  });

  it("POSTs to the encoded, workspace-scoped topic endpoint and returns the server deck", async () => {
    // @ts-expect-error KITCHEN-PENDING #184 not built yet
    const { createTopicDeck } = await import(/* @vite-ignore */ decksModule) as typeof import("@/features/exam-prep/decksApi");
    fetchMock.mockResolvedValueOnce(Response.json(deck));

    await expect(createTopicDeck(packId, subjectId, topicId)).resolves.toEqual(deck);

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(topicDeckUrl, expect.objectContaining({
      credentials: "include",
      method: "POST",
    }));
    expect(fetchMock.mock.calls[0][1]?.body).toBeFalsy();
  });

  it("disables Drill while creation is pending and opens the returned deck", async () => {
    // @ts-expect-error KITCHEN-PENDING #184 not built yet
    const { SubjectTopicMap } = await import(/* @vite-ignore */ topicMapModule) as typeof import("@/features/exam-prep/components/SubjectTopicMap");
    const pending = Promise.withResolvers<Response>();
    fetchMock.mockResolvedValueOnce(Response.json(subject)).mockReturnValueOnce(pending.promise);
    const user = userEvent.setup();
    render(<SubjectTopicMap packId={packId} subjectId={subjectId} />);
    const drill = (await topicRow("Slope")).getByRole("button", { name: "Drill" });
    const otherDrill = (await topicRow("Intercepts")).getByRole("button", { name: "Drill" });

    await user.click(drill);

    expect(drill).toBeDisabled();
    expect(otherDrill).toBeDisabled();
    expect(navigate).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(topicDeckUrl, expect.objectContaining({ method: "POST" }));

    await act(async () => pending.resolve(Response.json(deck)));
    await expectDrillNavigation();
  });

  it.each([404, 422])("shows one message by the selected topic and stays on S3 after HTTP %i", async (status) => {
    // @ts-expect-error KITCHEN-PENDING #184 not built yet
    const { SubjectTopicMap } = await import(/* @vite-ignore */ topicMapModule) as typeof import("@/features/exam-prep/components/SubjectTopicMap");
    fetchMock
      .mockResolvedValueOnce(Response.json(subject))
      .mockResolvedValueOnce(Response.json({ detail: "No terms" }, { status }));
    const user = userEvent.setup();
    render(<SubjectTopicMap packId={packId} subjectId={subjectId} />);
    const row = await topicRow("Slope");
    const drill = row.getByRole("button", { name: "Drill" });

    await user.click(drill);

    expect(await row.findByText(noCards, { exact: true })).toBeVisible();
    expect(screen.getAllByText(noCards, { exact: true })).toHaveLength(1);
    expect(row.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(drill).toBeEnabled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("offers the existing retry action for a server error", async () => {
    // @ts-expect-error KITCHEN-PENDING #184 not built yet
    const { SubjectTopicMap } = await import(/* @vite-ignore */ topicMapModule) as typeof import("@/features/exam-prep/components/SubjectTopicMap");
    fetchMock
      .mockResolvedValueOnce(Response.json(subject))
      .mockResolvedValueOnce(Response.json({ detail: "Service unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json(deck));
    const user = userEvent.setup();
    render(<SubjectTopicMap packId={packId} subjectId={subjectId} />);
    const row = await topicRow("Slope");

    await user.click(row.getByRole("button", { name: "Drill" }));

    const error = await row.findByRole("alert");
    expect(screen.queryByText(noCards, { exact: true })).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();

    await user.click(within(error).getByRole("button", { name: "Retry" }));

    expect(fetchMock.mock.calls.slice(1).map(([url, options]) => [url, options?.method]))
      .toEqual([[topicDeckUrl, "POST"], [topicDeckUrl, "POST"]]);
    await expectDrillNavigation();
  });
});
