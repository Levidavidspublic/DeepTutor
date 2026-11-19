import { expect, test } from "@playwright/test";
import { emptyLearningIndex } from "./fixtures/learning-index";
import { sourceModuleInventory } from "./fixtures/modules";
import { emptyTaskBoard } from "./fixtures/task-board";

const storageKey = "deeptutor-study-comfort";
const pack = {
  id: "study-demo",
  title: "Demo Study Pack",
  exam: "Demo Exam",
  source_lang: "en",
  ui_lang: "en",
  subjects: [],
};

test.describe("Saved comfort on exam screens", () => {
  test.use({ locale: "en-US", serviceWorkers: "block" });

  test("applies saved reduced motion to exam content and removes it after the preference is turned off", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const ui = { language: "en", response_language: "en", theme: "light" };
    await page.route((url) => /^\/(api|files|ws)(\/|$)/.test(url.pathname), async (route) => {
      const request = route.request();
      const { pathname } = new URL(request.url());
      if (request.method() === "GET") {
        switch (pathname) {
          case "/api/exam-packs":
            return route.fulfill({ json: [pack] });
          case "/api/auth/status":
            return route.fulfill({ json: { enabled: false, authenticated: true, is_admin: true } });
          case "/api/modules":
            return route.fulfill({ json: sourceModuleInventory });
          case "/api/settings":
          case "/api/settings/ui":
            return route.fulfill({ json: { ...ui, ui } });
          case "/api/system/status":
            return route.fulfill({ json: { backend: { status: "online" } } });
          case "/api/settings/page-customization":
            return route.fulfill({ json: {} });
          case "/api/task-board":
            return route.fulfill({ json: emptyTaskBoard });
          case "/api/dashboard/learning-index":
            return route.fulfill({ json: emptyLearningIndex });
          case "/api/partners":
          case "/api/partner-groups":
            return route.fulfill({ json: [] });
        }
      }
      return route.fulfill({ status: 404, json: { detail: `Unstubbed ${request.method()} ${pathname}` } });
    });
    await page.routeWebSocket((url) => /^\/ws(\/|$)/.test(url.pathname), (socket) => socket.close());

    await page.addInitScript((key) => {
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, JSON.stringify({ contrast: "high", readAloudRate: 1.5, reducedMotion: true }));
      }
    }, storageKey);

    await page.goto("/learning/exams");
    const card = page.getByRole("article", { name: pack.title });
    const wrapper = page.locator("[data-contrast]").filter({ has: card });
    await expect(card).toBeVisible();
    await expect(wrapper).toHaveAttribute("data-reduced-motion", "true");

    await page.evaluate((key) => {
      const saved = JSON.parse(localStorage.getItem(key) ?? "{}");
      localStorage.setItem(key, JSON.stringify({ ...saved, reducedMotion: false }));
    }, storageKey);
    await page.reload();

    await expect(card).toBeVisible();
    await expect(wrapper).toHaveAttribute("data-contrast", "high");
    await expect(wrapper).not.toHaveAttribute("data-reduced-motion");
  });
});
