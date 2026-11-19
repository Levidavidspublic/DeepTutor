"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { SchemaAddRecordRequest } from "@/contracts/generated/api";
import { listNotebooks, type NotebookSummary } from "@/lib/notebook-api";
import { requestJson } from "@/shared/api/client";
import { Button } from "@/shared/ui/Button";

const NOTE_LIMIT = 2000;
const fieldClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type NotebookList =
  | { status: "loading" | "error" }
  | { status: "ready"; notebooks: NotebookSummary[] };

export function QuickCapture({ subjectTitle }: { subjectTitle: string }) {
  const { t } = useTranslation();
  const formId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const noteField = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<NotebookList>({ status: "loading" });
  const [draft, setDraft] = useState("");
  const [notebookId, setNotebookId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    noteField.current?.focus();
    let active = true;
    void listNotebooks().then(
      (notebooks) => {
        if (active) setList({ status: "ready", notebooks });
      },
      () => {
        if (active) setList({ status: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [open]);

  const notebook = list.status === "ready"
    ? list.notebooks.find(({ id }) => id === notebookId)
    : undefined;
  const canSave = notebook !== undefined && draft.trim().length > 0 && !saving;

  function close() {
    setDraft("");
    setNotebookId("");
    setSaveFailed(false);
    setOpen(false);
    trigger.current?.focus();
  }

  function toggle() {
    if (saving) return;
    if (open) {
      close();
      return;
    }
    setSavedTo(null);
    setList({ status: "loading" });
    setOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;

    setSaving(true);
    setSaveFailed(false);
    const title = `${subjectTitle} - quick note`;
    const payload = {
      notebook_ids: [notebook.id],
      record_type: "co_writer",
      title,
      // Supplying a summary keeps this manual save independent of a model.
      summary: title,
      user_query: "",
      output: draft,
      metadata: {},
    } satisfies SchemaAddRecordRequest;

    try {
      const result = await requestJson<{ success: boolean; added_to_notebooks: string[] }>(
        "/api/notebooks/actions/add-record",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (result.success && result.added_to_notebooks.includes(notebook.id)) {
        setSavedTo(notebook.name);
        close();
      } else {
        setSaveFailed(true);
      }
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 max-w-xl space-y-3">
      <Button
        ref={trigger}
        variant="secondary"
        aria-expanded={open}
        aria-controls={open ? formId : undefined}
        aria-disabled={saving || undefined}
        onClick={toggle}
      >
        {t("quickCapture.open", { ns: "exam" })}
      </Button>
      {open && (
        <form id={formId} onSubmit={save} className="space-y-4 rounded-xl border border-border bg-card p-4">
          <label className="block space-y-1 text-sm font-medium">
            <span>{t("quickCapture.note", { ns: "exam" })}</span>
            <textarea
              ref={noteField}
              className={fieldClass}
              dir="auto"
              maxLength={NOTE_LIMIT}
              rows={4}
              value={draft}
              disabled={saving}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          {list.status === "loading" && (
            <div role="status" aria-label={t("Loading…")} aria-busy="true" className="h-4 w-32 rounded bg-muted" />
          )}
          {list.status === "error" && (
            <p role="alert" className="text-sm">{t("quickCapture.loadError", { ns: "exam" })}</p>
          )}
          {list.status === "ready" && (
            list.notebooks.length === 0 ? (
              <Link href="/notebooks" className="text-sm font-medium text-primary underline">
                {t("quickCapture.empty", { ns: "exam" })}
              </Link>
            ) : (
              <label className="block space-y-1 text-sm font-medium">
                <span>{t("quickCapture.notebook", { ns: "exam" })}</span>
                <select
                  className={fieldClass}
                  value={notebookId}
                  disabled={saving}
                  onChange={(event) => setNotebookId(event.target.value)}
                >
                  <option value="" disabled>{t("quickCapture.choose", { ns: "exam" })}</option>
                  {list.notebooks.map(({ id, name }) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
              </label>
            )
          )}
          {saveFailed && (
            <p role="alert" className="text-sm">{t("quickCapture.saveError", { ns: "exam" })}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!canSave} aria-busy={saving || undefined}>{t("Save")}</Button>
            <Button variant="secondary" disabled={saving} onClick={close}>{t("Cancel")}</Button>
          </div>
        </form>
      )}
      <div aria-live="polite" className="text-sm">
        {savedTo !== null && t("quickCapture.saved", { ns: "exam", notebook: savedTo })}
      </div>
    </div>
  );
}
