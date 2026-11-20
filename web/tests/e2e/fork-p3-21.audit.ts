import { expect, test } from "@playwright/test";

import { feedEndpoint, feedFileText, pastedFeedText, type FeedRequest } from "../exam-prep/fixtures/feed";
import {
  now,
  packs,
  planEndpoint,
  planPath,
  planResponse,
  sessions,
  subjectId,
  timeZone,
  type PlanRequest,
} from "../exam-prep/fixtures/plan";
import { sourceModuleInventory } from "./fixtures/modules";
import { emptyTaskBoard } from "./fixtures/task-board";

test.describe.skip("S8 calendar feed import KITCHEN-PENDING #187", () => {
  test.use({ locale: "en-US", timezoneId: timeZone, serviceWorkers: "block" });

  test("imports pasted and uploaded calendars using the current plan reminder setting", async ({ page, baseURL }) => {
    await page.clock.setFixedTime(new Date(now));
    const webOrigin = new URL(baseURL ?? "http://localhost:3000").origin;
    const requests: FeedRequest[] = [];
    const planModes: PlanRequest["mode"][] = [];
    const ui = { language: "en", theme: "light" };
    const bootstrap: Record<string, unknown> = {
      "/api/auth/status": { enabled: false, authenticated: true },
      "/api/modules": sourceModuleInventory,
      "/api/settings": { ui, catalog: {} },
      "/api/settings/ui": { ui },
      "/api/settings/display": {},
      "/api/settings/page-customization": {},
      "/api/system/status": { backend: { status: "online" } },
      "/api/task-board": emptyTaskBoard,
      "/api/calendar/events": { occurrences: [], revision: 0 },
      "/api/exam-packs": packs,
    };

    await page.routeWebSocket(
      (url) => /^\/ws(?:\/|$)/.test(url.pathname) || url.origin.replace(/^ws/, "http") !== webOrigin,
      (socket) => socket.close(),
    );
    await page.route("**/*", (route) => {
      const request = route.request();
      const { origin, pathname } = new URL(request.url());
      if (origin !== webOrigin) return route.abort();
      if (!/^\/(?:api|files|ws)(?:\/|$)/.test(pathname)) return route.continue();

      const method = request.method();
      if (method === "GET") {
        if (pathname === "/api/calendar/stream") {
          return route.fulfill({
            contentType: "text/event-stream",
            body: 'data: {"revision":0}\n\n',
          });
        }
        if (Object.hasOwn(bootstrap, pathname))
          return route.fulfill({ json: bootstrap[pathname] });
      }
      if (method === "POST" && pathname === planEndpoint) {
        const payload: PlanRequest = request.postDataJSON();
        planModes.push(payload.mode);
        if (payload.mode === "preview") return route.fulfill({ json: planResponse(payload) });
      }
      if (method === "POST" && pathname === feedEndpoint) {
        requests.push(request.postDataJSON());
        return route.fulfill({
          json: requests.length === 1 ? { created: 2, skipped: 1 } : { created: 0, skipped: 3 },
        });
      }
      return route.fulfill({ status: 404, json: { detail: `Unstubbed ${method} ${pathname}` } });
    });

    await page.goto(`${planPath}?subject=${subjectId}`);
    const reminders = page.getByRole("checkbox", { name: "Reminders" });
    const importButton = page.getByRole("button", { name: "Import", exact: true });
    const pasteField = page.locator("textarea").and(page.getByLabel(/\S/));
    const fileField = page.locator('input[type="file"]').and(page.getByLabel(/\S/));
    const announcement = page.locator('[aria-live="polite"]');
    await expect(reminders).not.toBeChecked();
    await expect(importButton).toBeDisabled();

    await page.getByRole("button", { name: /^Preview(?: plan)?$/i }).click();
    await expect(page.getByText(sessions[0].title)).toBeVisible();
    const finalWeek = page.getByRole("region", { name: /week/i }).last();
    await expect(finalWeek.locator("xpath=following::*").and(importButton)).toHaveCount(1);

    await pasteField.fill(pastedFeedText);
    expect(requests).toEqual([]);
    await importButton.click();
    await expect(announcement.getByText("2 added, 1 already in your calendar", { exact: true }))
      .toBeVisible();
    await expect(pasteField).toHaveValue("");
    await expect(importButton).toBeDisabled();
    await expect(page.getByText(sessions[0].title)).toBeVisible();

    await reminders.check();
    await fileField.setInputFiles({
      name: "classes.ics",
      mimeType: "text/calendar",
      buffer: Buffer.from(feedFileText),
    });
    await expect(importButton).toBeEnabled();
    expect(requests).toHaveLength(1);
    await importButton.click();
    await expect(announcement.getByText("0 added, 3 already in your calendar", { exact: true }))
      .toBeVisible();
    await expect(fileField).toHaveValue("");
    await expect(importButton).toBeDisabled();

    expect(requests).toEqual([
      { ics_text: pastedFeedText, tzid: timeZone, remind: false },
      { ics_text: feedFileText, tzid: timeZone, remind: true },
    ]);
    expect(planModes).toEqual(["preview"]);
  });
});
