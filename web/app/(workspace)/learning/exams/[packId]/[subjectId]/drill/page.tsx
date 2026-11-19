"use client";

import { Layers } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageActionClass } from "@/components/layout/FeaturePage";
import {
  LearningEmptyState,
  LearningErrorState,
  LearningShell,
  LearningSkeleton,
} from "@/components/learning/LearningShell";
import { ReadAloudButton } from "@/features/a11y-study/ReadAloudButton";
import {
  DECK_FILE_EXTENSIONS,
  getExamDeck,
  importExamDeck,
  listExamDecks,
  type ExamDeck,
  type ExamDeckSummary,
} from "@/features/exam-prep/decksApi";
import { isEditableTarget } from "@/lib/shortcuts";
import { scopedUrl, workspaceIdOf } from "@/lib/workspace-scope";
import { isApiError } from "@/shared/api/errors";
import { Button } from "@/shared/ui/Button";

type LoadState<T> =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: T };

function DeckPlayer({ deck }: { deck: ExamDeck }) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const answerId = useId();
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<"cards" | "quiz">("cards");
  const [draft, setDraft] = useState("");
  const [revealed, setRevealed] = useState(false);
  const card = deck.cards[index];
  const visibleSide = revealed ? card.back : card.front;
  const speechLanguage = /\p{Script=Hebrew}/u.test(visibleSide) ? "he" : i18n.resolvedLanguage;
  const correct = draft.trim().toLowerCase() === card.back.replace(/\r\n?/g, "\n").trim().toLowerCase();

  function resetAnswer() {
    setDraft("");
    setRevealed(false);
  }

  const move = useCallback((offset: number) => {
    const next = index + offset;
    if (next < 0 || next >= deck.cards.length) return false;
    setIndex(next);
    resetAnswer();
    return true;
  }, [index, deck.cards.length]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey ||
          event.metaKey || event.shiftKey || isEditableTarget(event.target)) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (move(event.key === "ArrowLeft" ? -1 : 1)) event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [move]);

  function changeMode(next: typeof mode) {
    if (next === mode) return;
    setMode(next);
    resetAnswer();
  }

  return (
    <section aria-labelledby={titleId} className="space-y-4 rounded-xl border border-border p-4 sm:p-6">
      <h2 id={titleId} dir="auto" className="break-words text-xl font-semibold">{deck.title}</h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button variant={mode === "cards" ? "primary" : "secondary"} aria-pressed={mode === "cards"} onClick={() => changeMode("cards")}>
            {t("Flash Cards")}
          </Button>
          <Button variant={mode === "quiz" ? "primary" : "secondary"} aria-pressed={mode === "quiz"} onClick={() => changeMode("quiz")}>
            {t("Quiz")}
          </Button>
        </div>
        <p role="status" className="text-sm tabular-nums text-muted-foreground">
          {t("{{selected}} of {{total}}", { selected: index + 1, total: deck.cards.length })}
        </p>
      </div>

      <div className="flex items-start justify-between gap-3 rounded-lg bg-muted/40 p-4">
        <div className="min-w-0 flex-1 space-y-3">
          <p dir="auto" className="whitespace-pre-wrap break-words font-medium">{card.front}</p>
          <div aria-live="polite">
            {revealed && (
              <div className="space-y-2 border-t border-border pt-3">
                {mode === "quiz" && <p className="text-sm font-semibold">{correct ? t("Correct") : t("Not quite")}</p>}
                <p dir="auto" className="whitespace-pre-wrap break-words">{card.back}</p>
              </div>
            )}
          </div>
        </div>
        <ReadAloudButton key={`${index}-${revealed}`} text={visibleSide} lang={speechLanguage} />
      </div>

      {mode === "cards" ? (
        <Button disabled={revealed} onClick={() => setRevealed(true)}>{t("Reveal answer")}</Button>
      ) : (
        <form className="space-y-2" onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim() && !revealed) setRevealed(true);
        }}>
          <label htmlFor={answerId} className="block text-sm font-medium">{t("Your answer")}</label>
          <textarea
            id={answerId}
            rows={3}
            dir="auto"
            value={draft}
            readOnly={revealed}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }}
            className="block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" disabled={!draft.trim() || revealed}>{t("Check answer")}</Button>
        </form>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" aria-keyshortcuts="ArrowLeft" disabled={index === 0} onClick={() => move(-1)}>
          {t("Previous")}
        </Button>
        <Button variant="secondary" aria-keyshortcuts="ArrowRight" disabled={index === deck.cards.length - 1} onClick={() => move(1)}>
          {t("Next")}
        </Button>
      </div>
    </section>
  );
}

function SelectedDeck({ packId, subjectId, deckId }: { packId: string; subjectId: string; deckId: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState<ExamDeck | null>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void getExamDeck(packId, subjectId, deckId).then(
      (deck) => {
        if (active) setState({ status: "ready", data: deck?.source === "topic" ? null : deck });
      },
      (error: unknown) => {
        if (!active) return;
        const missing = isApiError(error) && (error.status === 404 || error.status === 422);
        setState(missing ? { status: "ready", data: null } : { status: "error" });
      },
    );
    return () => { active = false; };
  }, [packId, subjectId, deckId, attempt]);

  if (state.status === "loading") return <LearningSkeleton count={1} />;
  if (state.status === "error") return <LearningErrorState message={t("Could not load the list")} onRetry={() => {
    setState({ status: "loading" });
    setAttempt((current) => current + 1);
  }} />;
  if (!state.data) return <LearningEmptyState title={t("Not found")} />;
  if (state.data.cards.length === 0) return <LearningEmptyState title={t("Nothing here yet")} />;
  return <DeckPlayer deck={state.data} />;
}

function DrillWorkspace({ packId, subjectId, subjectPath, workspaceId, deckId }: {
  packId: string;
  subjectId: string;
  subjectPath: string;
  workspaceId: string | null;
  deckId: string | null;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [decks, setDecks] = useState<LoadState<ExamDeckSummary[]>>({ status: "loading" });
  const [listAttempt, setListAttempt] = useState(0);
  const [importState, setImportState] = useState<"idle" | "importing" | "error">("idle");
  const fileInput = useRef<HTMLInputElement>(null);
  const importRequest = useRef<AbortController | null>(null);
  const subjectHref = workspaceId === null ? subjectPath : scopedUrl(subjectPath, workspaceId);

  useEffect(() => {
    let active = true;
    void listExamDecks(packId, subjectId).then(
      (data) => {
        if (active) setDecks({ status: "ready", data: data.filter((deck) => deck.source !== "topic") });
      },
      () => {
        if (active) setDecks({ status: "error" });
      },
    );
    return () => { active = false; };
  }, [packId, subjectId, listAttempt]);

  useEffect(() => () => importRequest.current?.abort(), []);

  function deckHref(id: string) {
    return scopedUrl(`${subjectPath}/drill?${new URLSearchParams({ deck: id })}`, workspaceId ?? undefined);
  }

  function reloadDecks() {
    setDecks({ status: "loading" });
    setListAttempt((current) => current + 1);
  }

  async function importFile(file: File) {
    if (importRequest.current) return;
    const request = new AbortController();
    importRequest.current = request;
    setImportState("importing");
    try {
      const deck = await importExamDeck(packId, subjectId, file, request.signal);
      if (request.signal.aborted) return;
      setImportState("idle");
      reloadDecks();
      router.push(deckHref(deck.id), { scroll: false });
    } catch {
      if (!request.signal.aborted) setImportState("error");
    } finally {
      importRequest.current = null;
    }
  }

  return (
    <LearningShell
      title={t("drill", { ns: "exam" })}
      subtitle={null}
      back={false}
      icon={Layers}
      action={<Link href={subjectHref} className={pageActionClass("secondary")}>{t("Back to topics")}</Link>}
    >
      <div className="mx-auto max-w-2xl space-y-4">
        <label className="block space-y-2 text-sm font-medium">
          <span>{importState === "importing" ? t("Importing…") : t("Import")} ({DECK_FILE_EXTENSIONS.join(", ")})</span>
          <input
            ref={fileInput}
            type="file"
            accept={DECK_FILE_EXTENSIONS.join(",")}
            disabled={importState === "importing"}
            aria-busy={importState === "importing"}
            className="block w-full rounded-lg border border-input p-2 file:me-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-secondary-foreground"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void importFile(file);
            }}
          />
        </label>
        {importState === "error" && (
          <LearningErrorState message={t("Import failed.")} onRetry={() => fileInput.current?.click()} />
        )}
        {decks.status === "loading" && <LearningSkeleton count={1} />}
        {decks.status === "error" && <LearningErrorState message={t("Could not load the list")} onRetry={reloadDecks} />}
        {decks.status === "ready" && (
          decks.data.length === 0 ? (
            <LearningEmptyState title={t("Nothing here yet")} />
          ) : (
            <ul role="list" className="flex flex-wrap gap-2">
              {decks.data.map((deck) => (
                <li key={deck.id} className="min-w-0 max-w-full">
                  <Link
                    href={deckHref(deck.id)}
                    scroll={false}
                    aria-current={deck.id === deckId ? "page" : undefined}
                    className={pageActionClass(deck.id === deckId ? "primary" : "secondary")}
                  >
                    <bdi className="min-w-0 break-words">{deck.title}</bdi>
                  </Link>
                </li>
              ))}
            </ul>
          )
        )}
        {deckId && <SelectedDeck key={deckId} packId={packId} subjectId={subjectId} deckId={deckId} />}
      </div>
    </LearningShell>
  );
}

function DrillRoute() {
  const { packId, subjectId } = useParams<{ packId: string; subjectId: string }>();
  const search = useSearchParams();
  const workspaceId = workspaceIdOf(search);
  const subjectPath = `/learning/exams/${encodeURIComponent(packId)}/${encodeURIComponent(subjectId)}`;

  return (
    <DrillWorkspace
      key={JSON.stringify([packId, subjectId, workspaceId])}
      packId={packId}
      subjectId={subjectId}
      subjectPath={subjectPath}
      workspaceId={workspaceId}
      deckId={search.get("deck")}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LearningSkeleton count={1} />}>
      <DrillRoute />
    </Suspense>
  );
}
