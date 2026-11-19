import { expect, test, type Page } from "@playwright/test";
import { emptyLearningIndex } from "./fixtures/learning-index";
import { sourceModuleInventory } from "./fixtures/modules";
import { emptyTaskBoard } from "./fixtures/task-board";

const packId = "demo-pack";
const workspaceId = "exam-practice";
const withCards = { id: "slope", title: "Slope", title_source: "Slope", weight: 1, objectives: [] };
const withoutCards = { id: "intercepts", title: "Intercepts", title_source: "Intercepts", weight: 1, objectives: [] };
const subject = { id: "math", title: "Algebra", questionnaires: [], topics: [withCards, withoutCards] };
const subjectPath = `/learning/exams/${packId}/${subject.id}`;
const subjectUrl = `${subjectPath}?dt_workspace=${workspaceId}`;
const subjectApi = `/api/exam-packs/${packId}/subjects/${subject.id}`;
const decksApi = `${subjectApi}/decks`;
const noCards = "No drill cards for this topic yet";
const card = { front: "שיפוע", back: "Slope - change in height per unit of width", topic_id: withCards.id };
const deck = {
  id: "a1c7a3c1-9b51-5b59-8c48-2f016daa565e",
  title: "Slope drill cards",
  source: "topic",
  cards: [card],
};

async function stubBackend(page: Page) {
  const topicPosts: string[] = [];
  await page.route((url) => /^\/(api|files|ws)(\/|$)/.test(url.pathname), async (route) => {
    const request = route.request();
    const { pathname, searchParams } = new URL(request.url());
    const scoped = searchParams.get("dt_workspace") === workspaceId;

    if (request.method() === "POST" && scoped) {
      if (pathname === `${subjectApi}/topics/${withCards.id}/deck`) {
        topicPosts.push(withCards.id);
        return route.fulfill({ json: deck });
      }
      if (pathname === `${subjectApi}/topics/${withoutCards.id}/deck`) {
        topicPosts.push(withoutCards.id);
        return route.fulfill({ status: 422, json: { detail: "No glossary terms for this topic" } });
      }
    }
    if (request.method() !== "GET") return route.fulfill({ status: 405, json: {} });

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
      case subjectApi:
        return route.fulfill({ json: subject });
      case decksApi:
        return route.fulfill({ json: [{ id: deck.id, title: deck.title, source: deck.source, card_count: 1 }] });
      case `${decksApi}/${deck.id}`:
        if (scoped && topicPosts.includes(withCards.id)) return route.fulfill({ json: deck });
        break;
    }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.routeWebSocket((url) => /^\/ws(\/|$)/.test(url.pathname), (socket) => socket.close());
  return topicPosts;
}

function topicRow(page: Page, title: string) {
  return page.getByRole("listitem").filter({
    has: page.getByRole("heading", { name: title, exact: true }),
  });
}

test.describe.skip("S3 topic Drill to S6 KITCHEN-PENDING #184", () => {
  test.use({ serviceWorkers: "block" });

  test("opens the server's topic deck and reveals the first answer", async ({ page }) => {
    const posts = await stubBackend(page);
    await page.goto(subjectUrl);
    const drill = topicRow(page, withCards.title).getByRole("button", { name: "Drill", exact: true });
    await drill.press("Enter");

    await expect(page).toHaveURL((url) =>
      url.pathname === `${subjectPath}/drill` &&
      url.searchParams.get("deck") === deck.id &&
      url.searchParams.get("dt_workspace") === workspaceId,
    );
    const player = page.getByRole("region", { name: deck.title, exact: true });
    await expect(player.getByText(card.front, { exact: true })).toBeVisible();
    await expect(player.getByText(card.back, { exact: true })).toBeHidden();
    await player.getByRole("button", { name: "Reveal answer" }).click();
    await expect(player.getByText(card.back, { exact: true })).toBeVisible();
    expect(posts).toEqual([withCards.id]);
  });

  test("keeps a topic with no glossary terms on S3 with one plain message", async ({ page }) => {
    const posts = await stubBackend(page);
    await page.goto(subjectUrl);
    const row = topicRow(page, withoutCards.title);
    await row.getByRole("button", { name: "Drill", exact: true }).click();

    await expect(row.getByText(noCards, { exact: true })).toBeVisible();
    await expect(page.getByText(noCards, { exact: true })).toHaveCount(1);
    await expect(page).toHaveURL((url) => url.pathname === subjectPath && !url.searchParams.has("deck"));
    expect(posts).toEqual([withoutCards.id]);
  });
});
