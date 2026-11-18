import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import LearningPage from "@/app/(workspace)/learning/page";
import { initI18n } from "@/i18n/init";
import { UI_LAYOUT_STORAGE_KEY, type UiLayout } from "@/lib/ui-layout";
import { rememberWorkspaceId } from "@/lib/workspace-scope";

vi.mock("@/lib/api", () => ({
  apiUrl: (path: string) => path,
  apiFetch: async () => ({
    ok: true,
    json: async () => ({ sources: { books: [], mastery: [], reading: [], watching: [] }, failed: [] }),
  }),
}));

initI18n("en");

afterEach(() => {
  window.history.replaceState(null, "", "/");
  rememberWorkspaceId("");
});

it.each<{ layout: UiLayout; heading: string }>([
  { layout: "modern", heading: "Learning" },
  { layout: "classic", heading: "Personalized Learning" },
])("opens Exam prep from the $layout Learning home in the active workspace", async ({ layout, heading }) => {
  localStorage.setItem(UI_LAYOUT_STORAGE_KEY, layout);
  window.history.replaceState(null, "", "/learning?dt_workspace=study-space");

  render(<LearningPage />);

  expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeVisible();
  const link = screen.getByRole<HTMLAnchorElement>("link", { name: "Exam prep" });
  expect(link).toBeVisible();
  expect(link).toHaveAttribute("href", "/learning/exams?dt_workspace=study-space");
  expect(link.tabIndex).toBe(0);
});
