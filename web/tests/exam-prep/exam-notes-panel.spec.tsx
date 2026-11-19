import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureLanguage, initI18n } from "@/i18n/init";

const materialsRoute = "/learning/reading/materials";
const packId = "demo-pack";
const workspaceId = "notes-workspace";
const catalogPath = `/api/exam-packs/${packId}/materials`;
// Vite resolves literal import paths while collecting even a skipped suite.
const notesPanelPath = "../../features/exam-prep/components/NotesPanel";
const notes = [
  { id: "Algebra review.pdf", title: "Algebra review" },
  { id: "Functions #1.pdf", title: "Functions #1" },
];
const router = { push: vi.fn(), replace: vi.fn() };
const i18n = initI18n("en");

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => router,
}));

function requestUrl(input: RequestInfo | URL) {
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return new URL(href, window.location.origin);
}

function stubCatalog(response: Response | Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = requestUrl(input);
    if (
      url.pathname === catalogPath &&
      url.searchParams.get("dt_workspace") === workspaceId &&
      (init?.method ?? "GET") === "GET"
    ) {
      return (await response).clone();
    }
    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
}

function expectPdfUrl(href: string | null, noteId: string, download: boolean) {
  expect(href).toBeTruthy();
  const url = new URL(href ?? "", window.location.origin);
  expect(url.origin).toBe(window.location.origin);
  expect(url.pathname).toBe(`${catalogPath}/${encodeURIComponent(noteId)}`);
  expect(url.searchParams.get("dt_workspace")).toBe(workspaceId);
  expect(url.searchParams.get("download")).toBe(download ? "true" : null);
  return url;
}

async function expectInlineViewer(note: (typeof notes)[number]) {
  const viewer = await screen.findByTitle(new RegExp(note.title));
  expect(viewer.matches("iframe, embed, object")).toBe(true);
  const url = expectPdfUrl(viewer.getAttribute("src") ?? viewer.getAttribute("data"), note.id, false);
  expect(url.hash).not.toMatch(/(?:#|&)toolbar=0(?:&|$)/i);
}

function expectNoPdfActions(container: HTMLElement) {
  expect(container.querySelector("iframe, embed, object")).toBeNull();
  expect(screen.queryByRole("link", { name: "Open in new tab" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Download" })).not.toBeInTheDocument();
}

describe.skip("S9 pack PDF notes KITCHEN-PENDING #67", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    window.history.replaceState({}, "", `${materialsRoute}?pack=${packId}&dt_workspace=${workspaceId}`);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/?dt_workspace=");
  });

  it("selects a note by keyboard and updates the viewer and localized file links", async () => {
    // @ts-expect-error KITCHEN-PENDING #67 not built yet
    const { NotesPanel }: typeof import("@/features/exam-prep/components/NotesPanel") = await import(/* @vite-ignore */ notesPanelPath);
    await ensureLanguage("zh");
    await i18n.changeLanguage("zh");
    const catalog = Promise.withResolvers<Response>();
    stubCatalog(catalog.promise);

    const user = userEvent.setup();
    const { container } = render(<NotesPanel packId={packId} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector("iframe, embed, object")).toBeNull();
    await act(async () => catalog.resolve(Response.json(notes)));

    const list = within(await screen.findByRole("list", { name: /\S/ }));
    const [first, second] = notes;
    await user.click(list.getByRole("button", { name: first.title }));
    await expectInlineViewer(first);
    await user.tab();
    expect(list.getByRole("button", { name: second.title })).toHaveFocus();
    await user.keyboard("{Enter}");

    await expectInlineViewer(second);
    expect(container.querySelectorAll("iframe, embed, object")).toHaveLength(1);

    const open = screen.getByRole("link", { name: "在新标签页打开" });
    expect(open).toHaveAttribute("target", "_blank");
    expectPdfUrl(open.getAttribute("href"), second.id, false);

    const download = screen.getByRole("link", { name: "下载" });
    expectPdfUrl(download.getAttribute("href"), second.id, true);
  });

  it("shows an empty state when the pack has no PDFs", async () => {
    // @ts-expect-error KITCHEN-PENDING #67 not built yet
    const { NotesPanel }: typeof import("@/features/exam-prep/components/NotesPanel") = await import(/* @vite-ignore */ notesPanelPath);
    stubCatalog(Response.json([]));

    const { container } = render(<NotesPanel packId={packId} />);

    expect(await screen.findByRole("heading", { name: /no .*(?:notes?|pdfs?|materials?)|nothing here yet/i })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expectNoPdfActions(container);
  });

  it("shows an accessible error when the catalog request fails", async () => {
    // @ts-expect-error KITCHEN-PENDING #67 not built yet
    const { NotesPanel }: typeof import("@/features/exam-prep/components/NotesPanel") = await import(/* @vite-ignore */ notesPanelPath);
    stubCatalog(Response.json({ detail: "Materials unavailable" }, { status: 503 }));

    const { container } = render(<NotesPanel packId={packId} />);

    const error = await screen.findByRole("alert");
    expect(error).toBeVisible();
    expect(error).toHaveTextContent(/\S/);
    expectNoPdfActions(container);
  });

  it("keeps the existing material library on the route without a pack query", async () => {
    window.history.replaceState({}, "", `${materialsRoute}?dt_workspace=${workspaceId}`);
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const { pathname } = requestUrl(input);
      if (pathname === "/api/dashboard/learning-library/materials" || pathname === "/api/dashboard/learning-library/reading") {
        return Response.json({ items: [], unavailable_workspaces: [], can_create: true });
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { default: ReadingMaterialsRoute } = await import("@/app/(workspace)/learning/reading/materials/page");

    const { container } = render(<ReadingMaterialsRoute />);

    expect(await screen.findByRole("heading", { name: "Everything you upload shows up here." })).toBeVisible();
    expect(screen.getByRole("button", { name: "Upload material" })).toBeVisible();
    expect(fetchMock.mock.calls.map(([input]) => requestUrl(input).pathname)).not.toContain(catalogPath);
    expectNoPdfActions(container);
  });
});
