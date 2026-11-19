import { expect, test } from "@playwright/test";

import type { ExamSubjectDetail } from "../../features/exam-prep/types";
import type { NotebookRecordItem } from "../../lib/notebook-api";
import { sourceModuleInventory } from "./fixtures/modules";
import { emptyTaskBoard } from "./fixtures/task-board";

const packId = "demo-pack";
const subject: ExamSubjectDetail = {
  id: "math",
  title: "Algebra and graphs",
  questionnaires: [],
  topics: [{
    id: "slope",
    title: "Slope of a line",
    title_source: "Slope of a line",
    weight: 1,
    objectives: [],
  }],
};
const notebooks = [
  { id: "general", name: "General notes" },
  { id: "revision", name: "Revision notebook" },
];
const target = notebooks[1];
const notebooksPath = "/api/notebooks";
const savePath = `${notebooksPath}/actions/add-record`;

interface AddRecordPayload {
  notebook_ids: string[];
  record_type: string;
  title: string;
  user_query: string;
  output: string;
  summary?: string;
}

test.describe("S3 quick capture", () => {
  test.use({ locale: "en-US", serviceWorkers: "block" });

  test("saves a note below the topic map and opens it in the chosen notebook", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("deeptutor-language", "en"));
    const records = new Map<string, NotebookRecordItem[]>(notebooks.map(({ id }) => [id, []]));
    const writes: { method: string; path: string; body: unknown }[] = [];

    await page.routeWebSocket((url) => /^\/ws(?:\/|$)/.test(url.pathname), (socket) => socket.close());
    await page.route((url) => /^\/(?:api|files|ws)(?:\/|$)/.test(url.pathname), async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      if (method !== "GET" && method !== "HEAD") {
        writes.push({ method, path, body: request.postDataJSON() });
      }
      if (method === "POST" && path === savePath) {
        const payload: AddRecordPayload = request.postDataJSON();
        const record: NotebookRecordItem = {
          id: "quick-note",
          type: payload.record_type,
          title: payload.title,
          user_query: payload.user_query,
          output: payload.output,
          summary: payload.summary ?? "",
        };
        const addedTo = payload.notebook_ids.filter((id) => records.has(id));
        for (const id of addedTo) records.get(id)!.push(record);
        return route.fulfill({ json: {
          success: true,
          summary: record.summary,
          record,
          added_to_notebooks: addedTo,
        } });
      }
      if (method === "GET") {
        switch (path) {
          case `/api/exam-packs/${packId}/subjects/${subject.id}`:
            return route.fulfill({ json: subject });
          case "/api/auth/status":
            return route.fulfill({ json: { enabled: false, authenticated: true, is_admin: true } });
          case "/api/modules":
            return route.fulfill({ json: sourceModuleInventory });
          case "/api/settings":
            return route.fulfill({ json: { ui: { language: "en", theme: "light" } } });
          case "/api/settings/ui":
            return route.fulfill({ json: { language: "en", response_language: "en" } });
          case "/api/system/status":
            return route.fulfill({ json: { backend: { status: "online" } } });
          case "/api/settings/page-customization":
            return route.fulfill({ json: {} });
          case "/api/task-board":
            return route.fulfill({ json: emptyTaskBoard });
          case notebooksPath:
            return route.fulfill({ json: {
              notebooks: notebooks.map((notebook) => ({
                ...notebook,
                record_count: records.get(notebook.id)?.length ?? 0,
              })),
            } });
        }
        const notebook = notebooks.find(({ id }) => path === `${notebooksPath}/${id}`);
        if (notebook) {
          return route.fulfill({ json: { ...notebook, records: records.get(notebook.id) } });
        }
      }
      return route.fulfill({ status: 404, json: { detail: `Unstubbed ${method} ${path}` } });
    });

    await page.goto(`/learning/exams/${packId}/${subject.id}`);
    await expect(page.getByRole("heading", { name: subject.title, exact: true })).toBeVisible();
    const topic = page.getByRole("heading", { name: subject.topics[0].title, exact: true });
    await expect(topic).toBeVisible();
    const quickNote = page.getByRole("button", { name: "Quick note", exact: true });
    const field = page.getByRole("textbox", { name: /note/i });
    await expect(field).toBeHidden();
    const isBelowTopic = await quickNote.evaluate((button, topicHeading) =>
      Boolean(topicHeading && (topicHeading.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING)),
      await topic.elementHandle(),
    );
    expect(isBelowTopic).toBe(true);

    await quickNote.press("Enter");
    const noteText = "Try finding the slope of a downward line.";
    await field.fill(noteText);
    await page.getByRole("combobox", { name: /notebook/i }).selectOption({ label: target.name });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const confirmation = page.locator('[aria-live="polite"]').filter({
      hasText: `Saved to ${target.name}`,
    });
    await expect(confirmation).toBeVisible();
    await expect(field).toBeHidden();

    const title = `${subject.title} - quick note`;
    expect(writes).toEqual([{
      method: "POST",
      path: savePath,
      body: expect.objectContaining({
        notebook_ids: [target.id],
        record_type: "co_writer",
        title,
        user_query: expect.any(String),
        output: noteText,
      }),
    }]);

    await page.goto(`/notebooks/${target.id}`);
    await page.getByRole("button").filter({ has: page.getByText(title, { exact: true }) }).click();
    await expect(page.locator("[data-favorite-document]").getByText(noteText, { exact: true })).toBeVisible();
  });
});
