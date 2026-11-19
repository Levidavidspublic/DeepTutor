import { expect, test } from "@playwright/test";
import { emptyLearningIndex } from "./fixtures/learning-index";
import { sourceModuleInventory } from "./fixtures/modules";
import { emptyTaskBoard } from "./fixtures/task-board";

const settingsPath = "/settings/study-comfort";
const storageKey = "deeptutor-study-comfort";

test.describe.skip("S10 Study comfort KITCHEN-PENDING #182", () => {
  test.use({ serviceWorkers: "block" });

  test("opens from Settings and applies saved reading preferences on the Exams page", async ({ page }) => {
    const writes: string[] = [];
    const ui = { language: "en", response_language: "en", theme: "light" };
    await page.route((url) => /^\/(api|files|ws)(\/|$)/.test(url.pathname), async (route) => {
      const request = route.request();
      const { pathname } = new URL(request.url());
      if (request.method() !== "GET") {
        writes.push(`${request.method()} ${pathname}`);
        return route.fulfill({ status: 405, json: {} });
      }
      switch (pathname) {
        case "/api/auth/status":
          return route.fulfill({ json: { enabled: false, authenticated: true, is_admin: true } });
        case "/api/modules":
          return route.fulfill({ json: sourceModuleInventory });
        case "/api/settings":
          return route.fulfill({ json: { ui } });
        case "/api/settings/ui":
          return route.fulfill({ json: ui });
        case "/api/settings/draft":
          return route.fulfill({ json: { draft: null } });
        case "/api/settings/readiness":
          return route.fulfill({
            json: { schema_version: "deeptutor.settings-readiness/v2", ok: true, summary: {}, rows: [], notices: [] },
          });
        case "/api/system/status":
          return route.fulfill({ json: { backend: { status: "online" } } });
        case "/api/dashboard/learning-index":
          return route.fulfill({ json: emptyLearningIndex });
        case "/api/task-board":
          return route.fulfill({ json: emptyTaskBoard });
        case "/api/partners":
        case "/api/partner-groups":
        case "/api/exam-packs":
          return route.fulfill({ json: [] });
        default:
          return route.fulfill({ status: 404, json: {} });
      }
    });
    await page.routeWebSocket((url) => /^\/ws(\/|$)/.test(url.pathname), (socket) => socket.close());

    const examContent = page.getByRole("heading", { name: "No exam packs yet" });
    const examFontSize = () => examContent.evaluate((heading) => parseFloat(getComputedStyle(heading).fontSize));
    await page.goto("/learning/exams");
    await expect(examContent).toBeVisible();
    const originalSize = await examFontSize();

    await page.goto("/settings/general");
    const link = page.getByRole("navigation", { name: "Settings sections" })
      .getByRole("link", { name: "Study comfort", exact: true });
    await expect(link).toHaveAttribute("href", settingsPath);
    await link.press("Enter");
    await expect(page).toHaveURL((url) => url.pathname === settingsPath);

    const settings = page.getByRole("main");
    const size = settings.getByRole("slider", { name: /^text size\b/i });
    await expect(size).toHaveValue("100");
    for (let step = 0; step < 60 && !(await size.evaluate((control) => control === document.activeElement)); step++) {
      await page.keyboard.press("Tab");
    }
    await expect(size).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(size).toHaveValue("110");

    const font = settings.getByRole("combobox", { name: /^(?:reading )?font(?: family)?$/i });
    const contrast = settings.getByRole("combobox", { name: "Contrast", exact: true });
    await font.selectOption({ label: "Lexend" });
    await contrast.selectOption({ label: "High" });

    await expect.poll(() =>
      page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), storageKey),
    ).toMatchObject({ font: "lexend", sizePct: 110, contrast: "high" });

    await page.reload();
    await expect(size).toHaveValue("110");
    await expect(font.locator("option:checked")).toHaveText("Lexend");
    await expect(contrast.locator("option:checked")).toHaveText("High");

    await page.goto("/learning/exams");
    await expect(examContent).toHaveCSS("font-family", /Lexend/);
    await expect.poll(examFontSize).toBeCloseTo(originalSize * 1.1, 1);
    await expect.poll(() =>
      examContent.evaluate((heading) => heading.closest("[data-contrast]")?.getAttribute("data-contrast")),
    ).toBe("high");
    expect(writes).toEqual([]);
  });
});
