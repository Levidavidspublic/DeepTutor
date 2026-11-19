import { expect, test } from "@playwright/test";
import { jsPDF } from "jspdf";
import { sourceModuleInventory } from "./fixtures/modules";
import { emptyTaskBoard } from "./fixtures/task-board";

const packId = "demo-pack";
const catalogPath = `/api/exam-packs/${packId}/materials`;
const notes = [
  { id: "Algebra review.pdf", title: "Algebra review" },
  { id: "Functions #1.pdf", title: "Functions #1" },
];

test.describe.skip("S9 pack PDF notes KITCHEN-PENDING #67", () => {
  test.use({ serviceWorkers: "block" });

  test("opens the selected notes in the browser viewer and downloads the original PDF", async ({ page }) => {
    const [first, second] = notes;
    const pdfFiles = new Map(notes.map((note) => {
      const pdf = new jsPDF();
      pdf.text(note.title, 20, 20);
      return [`${catalogPath}/${encodeURIComponent(note.id)}`, {
        filename: note.id,
        body: Buffer.from(pdf.output("arraybuffer")),
      }];
    }));

    await page.route((url) => /^\/(api|files|ws)(\/|$)/.test(url.pathname), async (route) => {
      const request = route.request();
      const { pathname, searchParams } = new URL(request.url());
      if (request.method() !== "GET") return route.fulfill({ status: 405, json: {} });
      if (pathname === "/api/modules") return route.fulfill({ json: sourceModuleInventory });
      if (pathname === "/api/task-board") return route.fulfill({ json: emptyTaskBoard });
      if (pathname === "/api/auth/status") {
        return route.fulfill({ json: { enabled: false, authenticated: true, is_admin: true } });
      }
      if (pathname === "/api/settings/ui") {
        return route.fulfill({ json: { language: "en", response_language: "en" } });
      }
      if (pathname === catalogPath) return route.fulfill({ json: notes });
      const pdf = pdfFiles.get(pathname);
      if (pdf) {
        const disposition = searchParams.get("download") === "true" ? "attachment" : "inline";
        return route.fulfill({
          contentType: "application/pdf",
          headers: { "content-disposition": `${disposition}; filename="${pdf.filename}"` },
          body: pdf.body,
        });
      }
      return route.fulfill({ status: 404, json: {} });
    });
    await page.routeWebSocket((url) => /^\/ws(\/|$)/.test(url.pathname), (socket) => socket.close());

    await page.goto(`/learning/reading/materials?pack=${packId}`, { waitUntil: "domcontentloaded" });
    const list = page.getByRole("list", { name: /\S/ }).filter({
      has: page.getByRole("button", { name: first.title, exact: true }),
    });
    await list.getByRole("button", { name: first.title, exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(list.getByRole("button", { name: second.title, exact: true })).toBeFocused();
    await page.keyboard.press("Enter");

    const viewer = page.locator("iframe, embed, object").and(page.getByTitle(/Functions #1/));
    await expect(viewer).toBeVisible();
    const viewerSrc = await viewer.getAttribute("src") ?? await viewer.getAttribute("data");
    const inline = new URL(viewerSrc ?? "", page.url());
    expect(inline.origin).toBe(new URL(page.url()).origin);
    expect(inline.pathname).toBe(`${catalogPath}/${encodeURIComponent(second.id)}`);
    expect(inline.searchParams.has("download")).toBe(false);
    expect(inline.hash).not.toMatch(/(?:#|&)toolbar=0(?:&|$)/i);

    const open = page.getByRole("link", { name: "Open in new tab", exact: true });
    await expect(open).toHaveAttribute("target", "_blank");
    const openUrl = new URL(await open.getAttribute("href") ?? "", page.url());
    expect(openUrl.origin + openUrl.pathname + openUrl.search).toBe(inline.origin + inline.pathname + inline.search);

    const downloadLink = page.getByRole("link", { name: "Download", exact: true });
    const [download] = await Promise.all([page.waitForEvent("download"), downloadLink.click()]);
    const attachment = new URL(download.url());
    expect(attachment.origin).toBe(inline.origin);
    expect(attachment.pathname).toBe(inline.pathname);
    expect(attachment.searchParams.get("download")).toBe("true");
    expect(download.suggestedFilename()).toBe(second.id);
    expect(await download.failure()).toBeNull();
  });
});
