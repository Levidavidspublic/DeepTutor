import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initI18n } from "@/i18n/init";

const subjectTitle = "Algebra and graphs";
const noteText = "Review the slope formula.\nTry a line with a negative slope.";
const notebooks = [
  { id: "general", name: "General notes" },
  { id: "revision", name: "Revision notebook" },
];
const target = notebooks[1];
const i18n = initI18n("en");
// Vite resolves literal imports even during collection of a skipped suite.
const quickCapturePath = "../../features/exam-prep/components/QuickCapture";

function mockNotebookApi({
  list = () => Response.json({ notebooks }),
  save = () => savedRecord([target.id]),
}: {
  list?: () => Response | Promise<Response>;
  save?: () => Response | Promise<Response>;
} = {}) {
  const writes: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const path = new URL(url, window.location.origin).pathname;
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    if (method === "GET" && path === "/api/notebooks") return list();
    if (method !== "GET") {
      const body = input instanceof Request && !init?.body
        ? await input.json()
        : typeof init?.body === "string" ? JSON.parse(init.body) : null;
      writes.push({ method, path, body });
    }
    if (method === "POST" && path === "/api/notebooks/actions/add-record") return save();
    return Response.json({ detail: `Unstubbed ${method} ${path}` }, { status: 404 });
  }));
  return writes;
}

function savedRecord(addedTo: string[]) {
  return Response.json({
    success: true,
    summary: "Slope practice",
    record: {
      id: "quick-note",
      title: `${subjectTitle} - quick note`,
      type: "co_writer",
      summary: "Slope practice",
      user_query: "",
      output: noteText,
    },
    added_to_notebooks: addedTo,
  });
}

function noteField() {
  return screen.getByRole("textbox", { name: /note/i });
}

function quickNoteButton() {
  return screen.getByRole("button", { name: "Quick note" });
}

function saveButton() {
  return screen.getByRole("button", { name: "Save" });
}

async function selectNotebook(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("option", { name: target.name });
  await user.selectOptions(screen.getByRole("combobox", { name: /notebook/i }), target.id);
}

describe.skip("S3 quick capture KITCHEN-PENDING #188", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves one subject-titled note to the selected notebook and clears the draft", async () => {
    // @ts-expect-error KITCHEN-PENDING #188 not built yet
    const { QuickCapture }: typeof import("@/features/exam-prep/components/QuickCapture") = await import(/* @vite-ignore */ quickCapturePath);
    const pendingSave = Promise.withResolvers<Response>();
    const writes = mockNotebookApi({ save: () => pendingSave.promise });
    const user = userEvent.setup();
    render(<QuickCapture subjectTitle={subjectTitle} />);

    const trigger = quickNoteButton();
    expect(screen.queryByRole("textbox", { name: /note/i })).not.toBeInTheDocument();
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}");

    const field = noteField();
    expect(field.tagName).toBe("TEXTAREA");
    expect(field).toHaveAttribute("maxlength", "2000");
    expect(await screen.findByRole("option", { name: notebooks[0].name })).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    await user.type(field, noteText);
    expect(saveButton()).toBeDisabled();
    await selectNotebook(user);
    await user.clear(field);
    expect(saveButton()).toBeDisabled();
    await user.type(field, noteText);

    await user.click(saveButton());
    expect(saveButton()).toBeDisabled();
    await user.click(saveButton());
    expect(writes).toEqual([{
      method: "POST",
      path: "/api/notebooks/actions/add-record",
      body: expect.objectContaining({
        notebook_ids: [target.id],
        record_type: "co_writer",
        title: `${subjectTitle} - quick note`,
        user_query: expect.any(String),
        output: noteText,
      }),
    }]);
    expect(screen.queryByText(`Saved to ${target.name}`)).not.toBeInTheDocument();

    await act(async () => pendingSave.resolve(savedRecord([target.id])));
    const confirmation = await screen.findByText(`Saved to ${target.name}`, { exact: true });
    expect(confirmation).toBeVisible();
    expect(confirmation.closest('[aria-live="polite"]')).not.toBeNull();
    expect(screen.queryByRole("textbox", { name: /note/i })).not.toBeInTheDocument();

    await user.click(quickNoteButton());
    expect(noteField()).toHaveValue("");
  });

  it("shows a loading state before offering the notebooks page for an empty list", async () => {
    // @ts-expect-error KITCHEN-PENDING #188 not built yet
    const { QuickCapture }: typeof import("@/features/exam-prep/components/QuickCapture") = await import(/* @vite-ignore */ quickCapturePath);
    const pendingList = Promise.withResolvers<Response>();
    const writes = mockNotebookApi({ list: () => pendingList.promise });
    const user = userEvent.setup();
    const { container } = render(<QuickCapture subjectTitle={subjectTitle} />);

    await user.click(quickNoteButton());
    expect(container.querySelector('[aria-busy="true"]')).toBeVisible();
    expect(screen.queryByText("Create a notebook first")).not.toBeInTheDocument();

    await act(async () => pendingList.resolve(Response.json({ notebooks: [] })));
    const fallback = await screen.findByText("Create a notebook first", { exact: true });
    expect(fallback).toBeVisible();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    const link = screen.getAllByRole("link").find((item) =>
      new URL((item as HTMLAnchorElement).href).pathname === "/notebooks",
    );
    expect(link).toBeVisible();
    const save = screen.queryByRole("button", { name: "Save" });
    if (save) expect(save).toBeDisabled();
    expect(writes).toEqual([]);
  });

  it.each([
    ["the request fails", () => Response.json({ detail: "Notebook unavailable" }, { status: 503 })],
    ["the notebook rejects the record", () => savedRecord([])],
  ] as const)("keeps the draft and shows one error when %s", async (_failure, save) => {
    // @ts-expect-error KITCHEN-PENDING #188 not built yet
    const { QuickCapture }: typeof import("@/features/exam-prep/components/QuickCapture") = await import(/* @vite-ignore */ quickCapturePath);
    const writes = mockNotebookApi({ save });
    const user = userEvent.setup();
    render(<QuickCapture subjectTitle={subjectTitle} />);

    await user.click(quickNoteButton());
    await selectNotebook(user);
    await user.type(noteField(), noteText);
    await user.click(saveButton());

    const error = await screen.findByRole("alert");
    expect(error).toBeVisible();
    expect(error).toHaveTextContent(/save|notebook/i);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(noteField()).toHaveValue(noteText);
    expect(saveButton()).toBeEnabled();
    expect(screen.queryByText(`Saved to ${target.name}`)).not.toBeInTheDocument();
    expect(writes).toHaveLength(1);
  });

  it("closes the card without writing a record when the learner cancels", async () => {
    // @ts-expect-error KITCHEN-PENDING #188 not built yet
    const { QuickCapture }: typeof import("@/features/exam-prep/components/QuickCapture") = await import(/* @vite-ignore */ quickCapturePath);
    const writes = mockNotebookApi();
    const user = userEvent.setup();
    render(<QuickCapture subjectTitle={subjectTitle} />);

    await user.click(quickNoteButton());
    await selectNotebook(user);
    await user.type(noteField(), noteText);
    expect(saveButton()).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("textbox", { name: /note/i })).not.toBeInTheDocument();
    expect(quickNoteButton()).toBeVisible();
    expect(writes).toEqual([]);
  });
});
