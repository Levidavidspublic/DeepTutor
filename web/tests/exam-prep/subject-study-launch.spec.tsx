import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { redirect, RedirectType } from "next/navigation";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SubjectPage from "@/app/(workspace)/learning/exams/[packId]/[subjectId]/page";
import type { ExamSubjectDetail } from "@/features/exam-prep/types";
import { initI18n } from "@/i18n/init";

const packId = "demo pack";
const subjectId = "math#1";
const subjectPath = "/learning/exams/demo%20pack/math%231";
const workspaceQuery = "dt_workspace=algebra+%26+geometry";
const topicRequest = "/api/exam-packs/demo%20pack/subjects/math%231/topics";
const postOptions = { method: "POST", credentials: "include" };

vi.mock("next/navigation", () => ({
  useParams: () => ({ packId, subjectId }),
  usePathname: () => window.location.pathname,
  redirect: vi.fn(),
  RedirectType: { push: "push" },
}));

const i18n = initI18n("en");
const fetchMock = vi.fn<typeof fetch>();
const subject: ExamSubjectDetail = {
  id: subjectId,
  title: "Algebra",
  questionnaires: [],
  topics: [
    {
      id: "slope + lines",
      title: "Slope",
      title_source: "Slope",
      weight: 1,
      objectives: ["Calculate slope."],
    },
    {
      id: "slope & graphs",
      title: "Slope",
      title_source: "Slope",
      weight: 1,
      objectives: ["Read slope from a graph."],
    },
  ],
};

beforeEach(async () => {
  await i18n.changeLanguage("en");
  window.history.replaceState({}, "", `${subjectPath}?workspace=algebra+%26+geometry`);
  fetchMock.mockReset().mockResolvedValueOnce(Response.json(subject));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

it("uses the chosen topic ID for Study and Teach back when titles match", async () => {
  const pending = Promise.withResolvers<Response>();
  fetchMock.mockReturnValueOnce(pending.promise);
  render(<SubjectPage />);

  const group = within(await screen.findByRole("region", { name: "Other" }));
  const [lines, graphs] = group.getAllByRole("heading", { level: 3, name: "Slope" })
    .map((heading) => within(heading.closest("li")!));
  expect(lines.getByRole("link", { name: "Teach back" })).toHaveAttribute(
    "href", `${subjectPath}/teach-back?topic=slope+%2B+lines&${workspaceQuery}`,
  );
  expect(graphs.getByRole("link", { name: "Teach back" })).toHaveAttribute(
    "href", `${subjectPath}/teach-back?topic=slope+%26+graphs&${workspaceQuery}`,
  );

  const study = graphs.getByRole("button", { name: "Study" });
  act(() => {
    fireEvent.click(study);
    fireEvent.click(study);
  });
  expect(study).toBeDisabled();
  expect(study).toHaveAttribute("aria-busy", "true");
  expect(lines.getByRole("button", { name: "Study" })).toBeDisabled();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock).toHaveBeenLastCalledWith(
    `${topicRequest}/slope%20%26%20graphs/mastery-link?${workspaceQuery}`, postOptions,
  );
  expect(redirect).not.toHaveBeenCalled();

  await act(async () => pending.resolve(Response.json({ path_id: "graph path#1" })));
  expect(redirect).toHaveBeenCalledWith(
    `/learning/mastery/graph%20path%231/sessions?${workspaceQuery}`, RedirectType.push,
  );
});

it("keeps the subject visible and retries Study for the same topic after a failure", async () => {
  fetchMock
    .mockResolvedValueOnce(Response.json({ detail: "Unavailable" }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ path_id: "line-path" }));
  const user = userEvent.setup();
  render(<SubjectPage />);

  const objective = await screen.findByText("Calculate slope.");
  const topic = within(objective.closest("ul")!.closest("li")!);
  const study = topic.getByRole("button", { name: "Study" });
  await user.click(study);
  const alert = await topic.findByRole("alert");
  expect(screen.getByRole("alert")).toBe(alert);
  expect(screen.getByRole("heading", { level: 1, name: "Algebra" })).toBeVisible();
  expect(redirect).not.toHaveBeenCalled();
  expect(study).toBeEnabled();
  await user.click(within(alert).getByRole("button", { name: "Retry" }));

  const expectedRequest = `${topicRequest}/slope%20%2B%20lines/mastery-link?${workspaceQuery}`;
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock).toHaveBeenNthCalledWith(2, expectedRequest, postOptions);
  expect(fetchMock).toHaveBeenNthCalledWith(3, expectedRequest, postOptions);
  expect(screen.queryByRole("alert")).toBeNull();
  await waitFor(() => expect(redirect).toHaveBeenCalledWith(
    `/learning/mastery/line-path/sessions?${workspaceQuery}`, RedirectType.push,
  ));
});
