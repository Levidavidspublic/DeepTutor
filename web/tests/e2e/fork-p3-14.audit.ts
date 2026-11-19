import { expect, test, type Page } from "@playwright/test";
import { jsPDF } from "jspdf";
import { emptyLearningIndex } from "./fixtures/learning-index";
import { sourceModuleInventory } from "./fixtures/modules";
import { emptyTaskBoard } from "./fixtures/task-board";

const packId = "algebra + graphs & review=100% #2";
const workspaceId = "exam-practice";
const subject = {
  id: "math",
  title: "Algebra",
  questionnaires: [],
  topics: [
    { id: "slope", title: "Slope", title_source: "Slope", weight: 1, objectives: [] },
  ],
};
const encodedPackId = encodeURIComponent(packId);
const packApiPath = `/api/exam-packs/${encodedPackId}`;
const catalogPath = `${packApiPath}/materials`;
const materialsPath = "/learning/reading/materials";
const note = { id: "Algebra review.pdf", title: "Algebra review" };

async function mockBackend(page: Page, withNotes: boolean) {
  const pdf = new jsPDF();
  pdf.text(note.title, 20, 20);
  await page.route((url) => /^\/(api|files|ws)(\/|$)/.test(url.pathname), async (route) => {
    const { pathname, searchParams } = new URL(route.request().url());
    if (route.request().method() !== "GET") {
      return route.fulfill({ status: 405, json: {} });
    }
    switch (pathname) {
      case "/api/modules":
        return route.fulfill({ json: sourceModuleInventory });
      case "/api/auth/status":
        return route.fulfill({ json: { enabled: false, authenticated: true, is_admin: true } });
      case "/api/settings/ui":
        return route.fulfill({ json: { language: "en", response_language: "en" } });
      case "/api/system/status":
        return route.fulfill({ json: { backend: { status: "online" } } });
      case "/api/task-board":
        return route.fulfill({ json: emptyTaskBoard });
      case "/api/dashboard/learning-index":
        return route.fulfill({ json: emptyLearningIndex });
      case "/api/partners":
      case "/api/partner-groups":
        return route.fulfill({ json: [] });
      case `${packApiPath}/subjects/${subject.id}`:
        return route.fulfill({ json: subject });
      case catalogPath:
        if (searchParams.get("dt_workspace") !== workspaceId) break;
        return route.fulfill({ json: withNotes ? [note] : [] });
      case `${catalogPath}/${encodeURIComponent(note.id)}`:
        if (!withNotes) break;
        return route.fulfill({
          contentType: "application/pdf",
          body: Buffer.from(pdf.output("arraybuffer")),
        });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.routeWebSocket((url) => /^\/ws(\/|$)/.test(url.pathname), (socket) => socket.close());
}

test.describe.skip("S3 to pack Materials KITCHEN-PENDING #68", () => {
  test.use({ serviceWorkers: "block" });

  for (const withNotes of [true, false]) {
    test(`opens scoped Reading Materials by keyboard ${withNotes ? "with the pack's PDF notes" : "for a pack with no PDFs"}`, async ({ page }) => {
      await mockBackend(page, withNotes);
      await page.goto(`/learning/exams/${encodedPackId}/${subject.id}?dt_workspace=${workspaceId}`);
      await expect(page.getByRole("heading", { name: subject.title, level: 1 })).toBeVisible();

      const materials = page.getByRole("link", { name: "Materials", exact: true });
      await expect(materials).toHaveCount(1);
      for (let step = 0; step < 40 && !(await materials.evaluate((link) => link === document.activeElement)); step++) {
        await page.keyboard.press("Tab");
      }
      await expect(materials).toBeFocused();
      await page.keyboard.press("Enter");

      await expect(page).toHaveURL((url) =>
        url.pathname === materialsPath &&
        url.searchParams.get("pack") === packId &&
        url.searchParams.get("dt_workspace") === workspaceId,
      );
      if (withNotes) {
        await expect(page.getByRole("button", { name: note.title, exact: true })).toBeVisible();
      } else {
        await expect(page.getByRole("heading", { name: /no .*(?:notes?|pdfs?|materials?)|nothing here yet/i })).toBeVisible();
      }
    });
  }
});
