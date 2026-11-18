"use client";

import Link from "next/link";
import { Mic, Square } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { pageActionClass } from "@/components/layout/FeaturePage";
import { LearningErrorState } from "@/components/learning/LearningShell";
import { ReadAloudButton } from "@/features/a11y-study/ReadAloudButton";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { MODEL_SERVICE_PAGES } from "@/lib/model-settings";
import { isApiError } from "@/shared/api/errors";
import { Button } from "@/shared/ui/Button";
import { StatusChip } from "@/shared/ui/StatusChip";
import { submitTeachBack, type TeachBackResult } from "../api";
import type { ExamTopic } from "../types";

const verdictLabels = {
  "got it": "Correct",
  partly: "Partially correct",
  "not yet": "Not quite",
} as const;

type Submission =
  | { status: "editing"; error?: { message: string; modelUnavailable: boolean } }
  | { status: "submitting" }
  | { status: "graded"; result: TeachBackResult };

function ObjectiveList({ objectives, lang }: { objectives: string[]; lang?: string }) {
  if (objectives.length === 0) return null;

  return (
    <ul className="list-disc space-y-1 ps-5 text-sm" lang={lang}>
      {objectives.map((objective, index) => (
        <li key={index} className="break-words"><bdi>{objective}</bdi></li>
      ))}
    </ul>
  );
}

export function TeachBackCard({ packId, subjectId, topic, uiLang, subjectHref }: {
  packId: string;
  subjectId: string;
  topic: ExamTopic;
  uiLang?: string;
  subjectHref: string;
}) {
  const { t } = useTranslation();
  const topicHeadingId = useId();
  const resultHeadingId = useId();
  const answerId = useId();
  const [draft, setDraft] = useState("");
  const [submission, setSubmission] = useState<Submission>({ status: "editing" });
  const submitInFlight = useRef(false);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const answerField = useRef<HTMLTextAreaElement>(null);
  const returningToDraft = useRef(false);
  const recorder = useVoiceRecorder((text) => {
    setDraft((current) => [current.trimEnd(), text].filter(Boolean).join(" "));
  });

  const result = submission.status === "graded" ? submission.result : null;
  const submitError = submission.status === "editing" ? submission.error : undefined;
  const submitting = submission.status === "submitting";
  const recording = recorder.state === "recording";
  const transcribing = recorder.state === "transcribing";
  const answer = draft.trim();
  const canSubmit = Boolean(answer) && recorder.state === "idle" && submission.status === "editing";
  const prompt = t("Explain this clearly in your own words");
  const verdict = result ? t(verdictLabels[result.verdict]) : null;

  useEffect(() => {
    if (result) {
      resultHeading.current?.focus();
    } else if (returningToDraft.current) {
      returningToDraft.current = false;
      answerField.current?.focus();
    }
  }, [result]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || submitInFlight.current) return;

    submitInFlight.current = true;
    setSubmission({ status: "submitting" });
    try {
      const result = await submitTeachBack(packId, subjectId, topic.id, answer);
      setSubmission({ status: "graded", result });
    } catch (error) {
      const apiError = isApiError(error) ? error : undefined;
      const modelUnavailable = apiError?.status === 503;
      const message = modelUnavailable
        ? t("No language model is configured yet.")
        : apiError?.status === 422
          ? apiError.message
          : t("These answers could not be submitted. Please review or retry.");
      setSubmission({ status: "editing", error: { message, modelUnavailable } });
    } finally {
      submitInFlight.current = false;
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section aria-labelledby={topicHeadingId} className="space-y-3 rounded-xl border border-border p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={topicHeadingId} className="break-words text-xl font-semibold">
              <bdi lang={uiLang}>{topic.title}</bdi>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{prompt}</p>
          </div>
          <ReadAloudButton text={[topic.title, prompt, ...topic.objectives].join("\n")} lang={uiLang} />
        </div>
        <ObjectiveList objectives={topic.objectives} lang={uiLang} />
      </section>

      {result ? (
        <section aria-labelledby={resultHeadingId} className="space-y-4 rounded-xl border border-border p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <h2 ref={resultHeading} id={resultHeadingId} tabIndex={-1} className="text-xl font-semibold">
                {verdict}
              </h2>
              <p className="whitespace-pre-wrap break-words text-sm" dir="auto" lang={uiLang}>{result.feedback}</p>
            </div>
            <ReadAloudButton text={[verdict, result.feedback, ...result.missing].join("\n")} lang={uiLang} />
          </div>
          {result.missing.length > 0 && (
            <div className="space-y-2">
              <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {t("Objectives")} <StatusChip>{t("{{count}} remaining", { count: result.missing.length })}</StatusChip>
              </h3>
              <ObjectiveList objectives={result.missing} lang={uiLang} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Link href={subjectHref} className={pageActionClass()}>{t("Next")}</Link>
            <Button variant="secondary" onClick={() => {
              returningToDraft.current = true;
              setSubmission({ status: "editing" });
            }}>{t("Retry")}</Button>
          </div>
        </section>
      ) : (
        <form className="space-y-3 rounded-xl border border-border p-4 sm:p-6" onSubmit={handleSubmit}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={answerId} className="text-sm font-medium">{t("Your answer")}</label>
            {!submitting && <StatusChip>{t("Not checked yet")}</StatusChip>}
          </div>
          <textarea
            id={answerId}
            ref={answerField}
            rows={6}
            dir="auto"
            value={draft}
            readOnly={submitting}
            onChange={(event) => setDraft(event.target.value)}
            className="block w-full resize-y rounded-lg border border-input bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {submitError && (
            <LearningErrorState message={
              <>
                {submitError.message}
                {submitError.modelUnavailable && (
                  <Link href={MODEL_SERVICE_PAGES.llm.path} target="_blank" rel="noopener" className="ms-2 font-medium underline">
                    {t("Open model settings")}
                  </Link>
                )}
              </>
            } />
          )}
          {recorder.error && <LearningErrorState message={recorder.error} />}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!canSubmit} loading={submitting}>
              {submitting ? t("Checking…") : t("Check answer")}
            </Button>
            <Button
              variant="secondary"
              disabled={submitting}
              loading={transcribing}
              icon={recording ? <Square size={16} aria-hidden /> : <Mic size={16} aria-hidden />}
              onClick={recorder.toggle}
            >
              {transcribing ? t("Processing…") : recording ? t("Stop recording") : t("Record voice")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
