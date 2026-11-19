import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initI18n } from "@/i18n/init";

import { feedEndpoint, feedFileText, pastedFeedText, type FeedRequest } from "./fixtures/feed";
import { timeZone } from "./fixtures/plan";

// Vitest resolves literal import paths during collection, including in skipped tests.
const feedImportModule = "../../features/exam-prep/components/FeedImport";
const retryMessage = /^Check the file is a calendar \(\.ics\) file and try again\.?$/;
const counts = { created: 2, skipped: 1 };
const fetchMock = vi.fn<typeof fetch>();

function expectImportRequest(body: FeedRequest) {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [input, init] = fetchMock.mock.calls[0];
  const request = input instanceof Request
    ? new Request(input, init)
    : new Request(new URL(input, window.location.origin), init);
  expect(new URL(request.url).pathname).toBe(feedEndpoint);
  expect(request.method).toBe("POST");
  expect(request.headers.get("Content-Type")).toMatch(/^application\/json\b/i);
  return expect(request.json()).resolves.toEqual(body);
}

function pasteField() {
  return screen.getByLabelText<HTMLTextAreaElement>(/\S/, { selector: "textarea" });
}

function fileField() {
  return screen.getByLabelText<HTMLInputElement>(/\S/, { selector: 'input[type="file"]' });
}

function importButton() {
  return screen.getByRole("button", { name: /^Import$/ });
}

describe.skip("S8 calendar feed import KITCHEN-PENDING #187", () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    await initI18n("en").changeLanguage("en");
  });

  afterEach(() => vi.unstubAllGlobals());

  it("posts the ICS text, time zone and reminder choice and returns both counts", async () => {
    // @ts-expect-error KITCHEN-PENDING #187 not built yet
    const { importFeed } = await import("@/features/exam-prep/api");
    fetchMock.mockResolvedValueOnce(Response.json(counts));

    await expect(importFeed({ icsText: feedFileText, tzid: timeZone, remind: true }))
      .resolves.toEqual(counts);
    await expectImportRequest({ ics_text: feedFileText, tzid: timeZone, remind: true });
  });

  it("imports pasted text once, announces both counts and clears the text on success", async () => {
    // @ts-expect-error KITCHEN-PENDING #187 not built yet
    const { FeedImport }: typeof import("@/features/exam-prep/components/FeedImport") = await import(/* @vite-ignore */ feedImportModule);
    const response = Promise.withResolvers<Response>();
    fetchMock.mockReturnValueOnce(response.promise);
    const tzid = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const user = userEvent.setup();
    render(<FeedImport remind={false} />);

    expect(screen.getByRole("heading", { name: /\S/ })).toBeVisible();
    expect(importButton()).toBeDisabled();
    fireEvent.change(pasteField(), { target: { value: pastedFeedText } });
    expect(importButton()).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(importButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(importButton()).toBeDisabled();
    await user.click(importButton());
    await expectImportRequest({ ics_text: pastedFeedText, tzid, remind: false });

    await act(async () => response.resolve(Response.json(counts)));
    const result = await screen.findByText("2 added, 1 already in your calendar");
    expect(result).toBeVisible();
    expect(result.closest('[aria-live="polite"]')).not.toBeNull();
    expect(pasteField()).toHaveValue("");
    expect(importButton()).toBeDisabled();
  });

  it("reads a selected file as text and clears the selection after import", async () => {
    // @ts-expect-error KITCHEN-PENDING #187 not built yet
    const { FeedImport }: typeof import("@/features/exam-prep/components/FeedImport") = await import(/* @vite-ignore */ feedImportModule);
    const tzid = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fetchMock.mockResolvedValueOnce(Response.json({ created: 0, skipped: 3 }));
    const file = Object.assign(new File([feedFileText], "classes.ics", { type: "text/calendar" }), {
      text: vi.fn().mockResolvedValue(feedFileText),
    });
    const user = userEvent.setup();
    render(<FeedImport remind />);

    expect(fileField().accept.split(",").map((type) => type.trim()).sort())
      .toEqual([".ics", "text/calendar"]);
    await user.upload(fileField(), file);
    await waitFor(() => expect(importButton()).toBeEnabled());
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(importButton());
    expect(await screen.findByText("0 added, 3 already in your calendar")).toBeVisible();
    expect(file.text).toHaveBeenCalledTimes(1);
    await expectImportRequest({ ics_text: feedFileText, tzid, remind: true });
    expect(fileField().files).toHaveLength(0);
    expect(pasteField()).toHaveValue("");
    expect(importButton()).toBeDisabled();
  });

  it("offers one actionable error and leaves pasted text available to retry after an API rejection", async () => {
    // @ts-expect-error KITCHEN-PENDING #187 not built yet
    const { FeedImport }: typeof import("@/features/exam-prep/components/FeedImport") = await import(/* @vite-ignore */ feedImportModule);
    const serverDetail = "Invalid calendar header";
    fetchMock.mockResolvedValueOnce(Response.json({ detail: serverDetail }, { status: 422 }));
    const pastedText = "Incomplete calendar";
    const tzid = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const user = userEvent.setup();
    render(<FeedImport remind={false} />);

    fireEvent.change(pasteField(), { target: { value: pastedText } });
    await user.click(importButton());

    expect(await screen.findByText(retryMessage)).toBeVisible();
    expect(screen.queryByText(serverDetail)).not.toBeInTheDocument();
    expect(pasteField()).toHaveValue(pastedText);
    expect(importButton()).toBeEnabled();
    await expectImportRequest({ ics_text: pastedText, tzid, remind: false });
  });

  it("rejects a file over 1 MB before reading or submitting it", async () => {
    // @ts-expect-error KITCHEN-PENDING #187 not built yet
    const { FeedImport }: typeof import("@/features/exam-prep/components/FeedImport") = await import(/* @vite-ignore */ feedImportModule);
    const file = Object.assign(
      new File([new Uint8Array(1024 * 1024 + 1)], "large.ics", { type: "text/calendar" }),
      { text: vi.fn().mockResolvedValue(feedFileText) },
    );
    const user = userEvent.setup();
    render(<FeedImport remind={false} />);

    await user.upload(fileField(), file);

    expect(await screen.findByText(retryMessage)).toBeVisible();
    expect(importButton()).toBeDisabled();
    expect(file.text).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
