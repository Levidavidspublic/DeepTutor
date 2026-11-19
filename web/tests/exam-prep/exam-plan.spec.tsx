import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initI18n } from "@/i18n/init";
import {
  examOverride,
  math,
  now,
  packId,
  packs,
  planEndpoint,
  planPath,
  planResponse,
  sessions,
  startOverride,
  subjectId,
  timeZone,
  today,
  unscheduledTopic,
  type PlanRequest,
} from "./fixtures/plan";

vi.mock("next/navigation", () => ({
  useParams: () => ({ packId }),
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ prefetch: vi.fn() }),
}));

const i18n = initI18n("en");
const previewName = /^Preview(?: plan)?$/i;
const createName = "Create sessions";
// Vite resolves literal imports during collection, even inside a skipped suite.
const planPageModule = "../../app/(workspace)/learning/exams/[packId]/plan/page";

async function clickPreview() {
  const preview = await screen.findByRole("button", { name: previewName });
  await waitFor(() => expect(preview).toBeEnabled());
  fireEvent.click(preview);
}

describe.skip("S8 exam plan KITCHEN-PENDING #64", () => {
  let requests: PlanRequest[];
  let respondToPlan: (request: PlanRequest) => Response | Promise<Response>;
  const requestPermission = vi.fn<() => Promise<NotificationPermission>>();

  beforeEach(async () => {
    await i18n.changeLanguage("en");
    vi.stubEnv("TZ", timeZone);
    vi.setSystemTime(new Date(now));
    window.history.replaceState({}, "", `${planPath}?subject=${subjectId}`);
    requests = [];
    respondToPlan = (request) => Response.json(planResponse(request));
    requestPermission.mockResolvedValue("granted");
    vi.stubGlobal("Notification", { permission: "default", requestPermission });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      const path = new URL(url, window.location.origin).pathname;
      const method = init?.method ?? "GET";
      if (method === "GET" && path === "/api/exam-packs") return Response.json(packs);
      if (method === "POST" && path === planEndpoint && typeof init?.body === "string") {
        const request: PlanRequest = JSON.parse(init.body);
        requests.push(request);
        return respondToPlan(request);
      }
      return Response.json({ detail: `Unexpected ${method} ${path}` }, { status: 404 });
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    window.history.replaceState({}, "", "/");
  });

  it.each([
    { query: `?subject=${subjectId}`, subject: math },
    { query: "?subject=chemistry", subject: packs[1].subjects[0] },
    { query: "", subject: packs[1].subjects[0] },
  ])("defaults to local today and the date for $subject.title ($query)", async ({ query, subject }) => {
    window.history.replaceState({}, "", `${planPath}${query}`);
    const { default: PlanPage } =
      // @ts-expect-error KITCHEN-PENDING #64 not built yet
      await import(/* @vite-ignore */ planPageModule) as typeof import("@/app/(workspace)/learning/exams/[packId]/plan/page");
    render(<PlanPage />);

    const subjectSelect = await screen.findByRole("combobox", { name: "Subject" });
    await waitFor(() => expect(subjectSelect).toHaveValue(subject.id));
    expect(screen.queryByRole("option", { name: "Chemistry" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Start date")).toHaveValue(today);
    expect(screen.getByLabelText("Exam date")).toHaveValue(subject.exam_date);
    expect(screen.getByRole("checkbox", { name: "Reminders" })).not.toBeChecked();
    expect(requests).toEqual([]);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("previews overridden dates in local weeks and shows topics that did not fit", async () => {
    const { default: PlanPage } =
      // @ts-expect-error KITCHEN-PENDING #64 not built yet
      await import(/* @vite-ignore */ planPageModule) as typeof import("@/app/(workspace)/learning/exams/[packId]/plan/page");
    render(<PlanPage />);

    const start = await screen.findByLabelText("Start date");
    await waitFor(() => expect(start).toHaveValue(today));
    fireEvent.change(start, { target: { value: startOverride } });
    fireEvent.change(screen.getByLabelText("Exam date"), { target: { value: examOverride } });
    await clickPreview();

    const [firstWeek, secondWeek] = await screen.findAllByRole("region", { name: /week/i });
    expect(screen.getAllByRole("region", { name: /week/i })).toHaveLength(2);
    const [saturday, sunday, followingSaturday] = sessions;
    expect(within(firstWeek).getByText(saturday.title)).toBeVisible();
    expect(within(secondWeek).getByText(sunday.title)).toBeVisible();
    expect(within(secondWeek).getByText(followingSaturday.title)).toBeVisible();
    const unscheduled = screen.getByText(unscheduledTopic.title);
    expect(unscheduled).toBeVisible();
    expect(firstWeek).not.toContainElement(unscheduled);
    expect(secondWeek).not.toContainElement(unscheduled);
    expect(screen.getByRole("button", { name: createName })).toBeEnabled();
    expect(requests).toEqual([{
      subject_id: subjectId,
      start: startOverride,
      exam_date: examOverride,
      tzid: timeZone,
      reminders: false,
      mode: "preview",
    }]);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it.each([
    { label: "Start date", value: startOverride },
    { label: "Exam date", value: examOverride },
    { label: "Subject", value: "biology" },
    { label: "Reminders" },
  ])("invalidates the preview when $label changes", async ({ label, value }) => {
    const { default: PlanPage } =
      // @ts-expect-error KITCHEN-PENDING #64 not built yet
      await import(/* @vite-ignore */ planPageModule) as typeof import("@/app/(workspace)/learning/exams/[packId]/plan/page");
    render(<PlanPage />);

    await clickPreview();
    expect(await screen.findByText(sessions[0].title)).toBeVisible();
    const input = screen.getByLabelText(label, { exact: true });
    if (value === undefined) fireEvent.click(input);
    else fireEvent.change(input, { target: { value } });

    expect(screen.queryByText(sessions[0].title)).not.toBeInTheDocument();
    const create = screen.queryByRole("button", { name: createName });
    if (create) expect(create).toBeDisabled();
    expect(requests.map(({ mode }) => mode)).toEqual(["preview"]);
  });

  it("retries a failed preview with the same inputs", async () => {
    respondToPlan = (request) => requests.length === 1
      ? Response.json({ detail: "Preview temporarily unavailable" }, { status: 503 })
      : Response.json(planResponse(request));
    const { default: PlanPage } =
      // @ts-expect-error KITCHEN-PENDING #64 not built yet
      await import(/* @vite-ignore */ planPageModule) as typeof import("@/app/(workspace)/learning/exams/[packId]/plan/page");
    render(<PlanPage />);

    const exam = await screen.findByLabelText("Exam date");
    await waitFor(() => expect(exam).toHaveValue(math.exam_date));
    fireEvent.change(exam, { target: { value: examOverride } });
    await clickPreview();
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByText(sessions[0].title)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Exam date")).toHaveValue(examOverride);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(sessions[0].title)).toBeVisible();
    expect(requests).toEqual([requests[0], requests[0]]);
    expect(requests[1]).toMatchObject({ exam_date: examOverride, mode: "preview" });
  });

  it("saves reminders off by default, prevents a duplicate create, and opens Calendar after success", async () => {
    let finishCreate!: (response: Response) => void;
    const creating = new Promise<Response>((resolve) => { finishCreate = resolve; });
    respondToPlan = (request) => request.mode === "create"
      ? creating
      : Response.json(planResponse(request));
    const { default: PlanPage } =
      // @ts-expect-error KITCHEN-PENDING #64 not built yet
      await import(/* @vite-ignore */ planPageModule) as typeof import("@/app/(workspace)/learning/exams/[packId]/plan/page");
    render(<PlanPage />);

    await clickPreview();
    await screen.findByText(sessions[0].title);
    const create = await screen.findByRole("button", { name: createName });
    expect(create).toBeEnabled();
    fireEvent.click(create);
    expect(create).toBeDisabled();
    fireEvent.click(create);
    expect(screen.queryByRole("link", { name: "Open calendar" })).not.toBeInTheDocument();
    await waitFor(() => expect(requests).toHaveLength(2));
    const expectedCreate = {
      subject_id: subjectId,
      start: today,
      exam_date: math.exam_date,
      tzid: timeZone,
      reminders: false,
      mode: "create",
    } as const;
    expect(requests).toEqual([{ ...expectedCreate, mode: "preview" }, expectedCreate]);

    await act(async () => finishCreate(Response.json(planResponse(expectedCreate))));
    const calendar = await screen.findByRole<HTMLAnchorElement>("link", { name: "Open calendar" });
    expect(new URL(calendar.href).pathname).toBe("/calendar");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("requests browser permission only on the explicit action and retries a failed opt-in save", async () => {
    respondToPlan = (request) => request.mode === "create" && requests.length === 2
      ? Response.json({ detail: "Calendar temporarily unavailable" }, { status: 503 })
      : Response.json(planResponse(request));
    const { default: PlanPage } =
      // @ts-expect-error KITCHEN-PENDING #64 not built yet
      await import(/* @vite-ignore */ planPageModule) as typeof import("@/app/(workspace)/learning/exams/[packId]/plan/page");
    render(<PlanPage />);

    const reminders = await screen.findByRole("checkbox", { name: "Reminders" });
    await waitFor(() => expect(reminders).toBeEnabled());
    fireEvent.click(reminders);
    expect(reminders).toBeChecked();
    expect(requestPermission).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Turn on reminders" })));
    expect(requestPermission).toHaveBeenCalledTimes(1);

    await clickPreview();
    await screen.findByText(sessions[0].title);
    fireEvent.click(await screen.findByRole("button", { name: createName }));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Open calendar" })).not.toBeInTheDocument();
    expect(screen.getByText(sessions[0].title)).toBeVisible();
    expect(reminders).toBeChecked();
    const retry = screen.queryByRole("button", { name: "Retry" });
    fireEvent.click(retry ?? screen.getByRole("button", { name: createName }));

    expect(await screen.findByRole("link", { name: "Open calendar" })).toBeVisible();
    expect(requests.map(({ mode, reminders }) => ({ mode, reminders }))).toEqual([
      { mode: "preview", reminders: true },
      { mode: "create", reminders: true },
      { mode: "create", reminders: true },
    ]);
    expect(requests[1]).toEqual(requests[2]);
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });
});
