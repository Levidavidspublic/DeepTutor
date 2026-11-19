import { expect, test } from "@playwright/test";

import type { Occurrence } from "../../features/calendar/transport/api";
import {
  examOverride,
  math,
  now,
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
} from "../exam-prep/fixtures/plan";
import { sourceModuleInventory } from "./fixtures/modules";
import { emptyTaskBoard } from "./fixtures/task-board";

test.describe.skip("S8 weekly exam plan KITCHEN-PENDING #64", () => {
  test.use({ locale: "en-US", timezoneId: timeZone, serviceWorkers: "block" });

  test("previews an exam plan, opts in to reminders, and opens the saved sessions in Calendar", async ({ page }) => {
    await page.clock.setFixedTime(new Date(now));
    await page.addInitScript(() => {
      localStorage.setItem("deeptutor-language", "en");
      let permission: NotificationPermission = "default";
      Object.defineProperty(window, "Notification", {
        configurable: true,
        value: {
          get permission() { return permission; },
          async requestPermission() { return (permission = "granted"); },
        },
      });
    });

    const requests: PlanRequest[] = [];
    let occurrences: Occurrence[] = [];
    const calendar = {
      id: "default",
      name: "",
      color: "#2f6fde",
      is_default: true,
      visible: true,
      position: 0,
      created_at: now,
      updated_at: now,
    };
    await page.routeWebSocket((url) => /^\/ws(?:\/|$)/.test(url.pathname), (socket) => socket.close());
    await page.route((url) => /^\/(?:api|ws)(?:\/|$)/.test(url.pathname), async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      if (method === "POST" && path === planEndpoint) {
        const payload: PlanRequest = request.postDataJSON();
        requests.push(payload);
        const response = planResponse(payload);
        if (payload.mode === "create") {
          occurrences = response.sessions.map((session) => ({
            id: session.event_id!,
            event_id: session.event_id!,
            calendar_id: calendar.id,
            title: session.title,
            start: session.start,
            end: session.end,
            tzid: payload.tzid,
            reminders: session.reminders,
            reminder_times: session.reminders.map((minutes) =>
              new Date(Date.parse(session.start) - minutes * 60_000).toISOString()),
            notes: "",
            location: "",
            all_day: false,
            color: null,
            rrule: null,
            task_id: null,
            task_workspace_id: null,
            series_id: null,
            occurrence: session.start,
            recurring: false,
            source: "user",
          }));
        }
        return route.fulfill({ json: response });
      }
      if (method === "GET") {
        const revision = occurrences.length ? 1 : 0;
        switch (path) {
          case "/api/exam-packs": return route.fulfill({ json: packs });
          case "/api/auth/status": return route.fulfill({ json: { enabled: false, authenticated: true } });
          case "/api/modules": return route.fulfill({ json: sourceModuleInventory });
          case "/api/settings":
          case "/api/settings/ui": return route.fulfill({ json: { ui: { language: "en", theme: "light" } } });
          case "/api/system/status": return route.fulfill({ json: { backend: { status: "online" } } });
          case "/api/settings/page-customization": return route.fulfill({ json: {} });
          case "/api/task-board": return route.fulfill({ json: emptyTaskBoard });
          case "/api/calendar/calendars": return route.fulfill({ json: { calendars: [calendar], revision } });
          case "/api/calendar/events": return route.fulfill({ json: { occurrences, revision } });
          case "/api/calendar/layers": return route.fulfill({
            json: { workspace_id: "", reviews: [], automations: [], footprints: [] },
          });
          case "/api/calendar/task-blocks": return route.fulfill({ json: {} });
          case "/api/calendar/stream": return route.fulfill({
            contentType: "text/event-stream",
            body: `data: ${JSON.stringify({ revision })}\n\n`,
          });
        }
      }
      return route.fulfill({ status: 404, json: { detail: `Unstubbed ${method} ${path}` } });
    });

    await page.goto(`${planPath}?subject=${subjectId}`);
    await expect(page.getByRole("combobox", { name: "Subject" })).toHaveValue(subjectId);
    await expect(page.getByLabel("Start date")).toHaveValue(today);
    await expect(page.getByLabel("Exam date")).toHaveValue(math.exam_date);
    const reminders = page.getByRole("checkbox", { name: "Reminders" });
    await expect(reminders).not.toBeChecked();
    await page.getByLabel("Start date").fill(startOverride);
    await page.getByLabel("Exam date").fill(examOverride);
    await reminders.check();
    expect(await page.evaluate(() => Notification.permission)).toBe("default");
    await page.getByRole("button", { name: "Turn on reminders" }).click();
    await expect.poll(() => page.evaluate(() => Notification.permission)).toBe("granted");

    await page.getByRole("button", { name: /^Preview(?: plan)?$/i }).click();
    for (const session of sessions) await expect(page.getByText(session.title)).toBeVisible();
    await expect(page.getByText(unscheduledTopic.title)).toBeVisible();
    expect(occurrences).toEqual([]);

    await page.getByRole("button", { name: "Create sessions" }).click();
    await page.getByRole("link", { name: "Open calendar" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/calendar");
    for (const session of sessions) {
      await expect(page.getByRole("button", { name: new RegExp(session.title) })).toBeVisible();
    }
    const expectedCreate = {
      subject_id: subjectId,
      start: startOverride,
      exam_date: examOverride,
      tzid: timeZone,
      reminders: true,
      mode: "create",
    };
    expect(requests).toEqual([{ ...expectedCreate, mode: "preview" }, expectedCreate]);
  });
});
