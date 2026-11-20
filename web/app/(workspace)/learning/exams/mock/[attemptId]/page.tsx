"use client";

import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useEffectEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageActionClass } from "@/components/layout/FeaturePage";
import {
  LearningEmptyState,
  LearningErrorState,
  LearningShell,
  LearningSkeleton,
} from "@/components/learning/LearningShell";
import { useFocusMode } from "@/features/a11y-study/FocusMode";
import { ReadAloudButton } from "@/features/a11y-study/ReadAloudButton";
import { getMock, submitMock, type MockAttempt, type MockResult } from "@/features/exam-prep/mockApi";
import { scopedUrl, workspaceIdOf } from "@/lib/workspace-scope";
import { isApiError } from "@/shared/api/errors";
import { Button } from "@/shared/ui/Button";

type AttemptLoad =
  | { status: "loading" | "missing" | "error" }
  | { status: "ready"; attempt: MockAttempt; openedAt: number };

type Submission =
  | { status: "ready" | "submitting" | "retry" | "error" | "expired" }
  | { status: "submitted"; result: MockResult };

function MockReview({ attempt, result }: { attempt: MockAttempt; result: MockResult }) {
  const { t, i18n } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  const { format } = new Intl.NumberFormat(i18n.resolvedLanguage);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold">
        {t("Results")}
      </h2>
      <p className="font-medium">{t("Total")} {format(result.total)} / {format(result.max_total)}</p>
      <ol className="space-y-4">
        {attempt.questions.map((question, index) => {
          const mark = result.marks[question.id];
          return (
            <li key={question.id} className="space-y-2 rounded-xl border border-border p-4 sm:p-6">
              <h3 className="font-semibold">{t("Question {{n}}", { n: index + 1 })}</h3>
              <p lang={attempt.ui_lang} dir="auto" className="whitespace-pre-wrap break-words">{question.prompt}</p>
              <p className="font-medium">
                {format(mark.points)} / {format(question.points)}
                {mark.skipped && <> · {t("Skipped")}</>}
              </p>
              <div className="flex items-start gap-3">
                <p lang={attempt.ui_lang} dir="auto" className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                  {mark.feedback}
                </p>
                <ReadAloudButton text={mark.feedback} lang={attempt.ui_lang} />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function MockPaper({ attempt, openedAt }: { attempt: MockAttempt; openedAt: number }) {
  const { t } = useTranslation();
  const { focusOn } = useFocusMode();
  const deadline = Date.parse(attempt.expires_at);
  const openedInTime = openedAt < deadline;
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.ceil((deadline - openedAt) / 1000)));
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [submission, setSubmission] = useState<Submission>({ status: "ready" });
  const submitLocked = useRef(false);
  const questionLegend = useRef<HTMLLegendElement>(null);
  const movedQuestion = useRef(false);
  const expired = !openedInTime || submission.status === "expired";
  const submitting = submission.status === "submitting";
  const finished = expired || submission.status === "submitted" || submission.status === "error";
  const canEdit = !finished && !submitting && secondsLeft > 0;

  async function sendAnswers() {
    if (submitLocked.current || finished) return;

    submitLocked.current = true;
    setSubmission({ status: "submitting" });
    try {
      const result = await submitMock(attempt.attempt_id, answers);
      setSubmission({ status: "submitted", result });
    } catch (error) {
      const apiError = isApiError(error) ? error : undefined;
      if (apiError?.status === 409) {
        setSubmission({ status: "expired" });
      } else if (apiError?.retryable === false) {
        setSubmission({ status: "error" });
      } else {
        submitLocked.current = false;
        setSubmission({ status: "retry" });
      }
    }
  }

  const submitAtDeadline = useEffectEvent(() => {
    void sendAnswers();
  });

  useEffect(() => {
    if (finished) return;

    function tick() {
      window.clearTimeout(timeout);
      const remaining = Math.max(0, deadline - Date.now());
      setSecondsLeft(Math.ceil(remaining / 1000));
      if (remaining === 0) {
        document.removeEventListener("visibilitychange", checkOnReturn);
        submitAtDeadline();
      } else {
        timeout = window.setTimeout(tick, remaining % 1000 || 1000);
      }
    }

    function checkOnReturn() {
      if (document.visibilityState === "visible") tick();
    }

    let timeout = window.setTimeout(tick, 0);
    document.addEventListener("visibilitychange", checkOnReturn);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", checkOnReturn);
    };
  }, [deadline, finished]);

  useEffect(() => {
    if (movedQuestion.current) {
      movedQuestion.current = false;
      questionLegend.current?.focus();
    }
  }, [questionIndex]);

  function moveQuestion(nextIndex: number) {
    movedQuestion.current = true;
    setQuestionIndex(nextIndex);
  }

  if (submission.status === "submitted") return <MockReview attempt={attempt} result={submission.result} />;

  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  return (
    <form
      className="mx-auto max-w-3xl space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (canEdit && Date.now() < deadline) void sendAnswers();
      }}
    >
      {!finished && (
        <p className="sticky top-0 z-10 w-fit rounded-xl border border-border bg-background px-4 py-2 font-semibold tabular-nums">
          <span role="timer" aria-label={t("{{count}}s remaining", { count: secondsLeft })}>
            {minutes}:{seconds}
          </span>
        </p>
      )}
      {expired && <LearningErrorState message={t("Expired")} />}
      {attempt.questions.map((question, index) => {
        if (focusOn && index !== questionIndex) return null;

        return (
          <fieldset key={question.id} disabled={!canEdit} className="min-w-0 space-y-2 rounded-xl border border-border p-4 sm:px-6">
            <legend ref={focusOn ? questionLegend : undefined} tabIndex={-1} className="max-w-full scroll-mt-16 px-2 font-semibold">
              <span className="block text-sm">{t("Question {{n}}", { n: index + 1 })}</span>{" "}
              <span lang={attempt.ui_lang} dir="auto" className="block whitespace-pre-wrap break-words">
                {question.prompt}
              </span>
            </legend>
            {Object.entries(question.options).map(([option, label]) => (
              <label key={option} className="flex min-h-11 items-center gap-3 rounded-lg border border-input px-3 py-2">
                <input
                  type="radio"
                  name={question.id}
                  value={option}
                  checked={answers[question.id] === option}
                  onChange={() => {
                    if (!submitLocked.current && Date.now() < deadline) {
                      setAnswers((current) => ({ ...current, [question.id]: option }));
                    }
                  }}
                  className="shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                />
                <span className="min-w-0 break-words">
                  {option}. <bdi lang={attempt.ui_lang}>{label}</bdi>
                </span>
              </label>
            ))}
          </fieldset>
        );
      })}
      {focusOn && attempt.questions.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={questionIndex === 0} onClick={() => moveQuestion(questionIndex - 1)}>
            {t("Previous question")}
          </Button>
          <Button variant="secondary" disabled={questionIndex === attempt.questions.length - 1} onClick={() => moveQuestion(questionIndex + 1)}>
            {t("Next question")}
          </Button>
        </div>
      )}
      {submission.status === "error" && <LearningErrorState message={t("Something went wrong.")} />}
      {submission.status === "retry" && (
        <LearningErrorState message={t("These answers could not be submitted. Please review or retry.")} onRetry={sendAnswers} />
      )}
      {(submitting || (canEdit && submission.status === "ready")) && (
        <Button type="submit" loading={submitting}>
          {submitting ? t("Sending your answers…") : t("Submit answers")}
        </Button>
      )}
    </form>
  );
}

function MockAttemptPage({ attemptId, workspaceId }: { attemptId: string; workspaceId: string | null }) {
  const { t } = useTranslation();
  const [load, setLoad] = useState<AttemptLoad>({ status: "loading" });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    void getMock(attemptId).then(
      (attempt) => {
        if (active) setLoad({ status: "ready", attempt, openedAt: Date.now() });
      },
      (error: unknown) => {
        if (active) setLoad({ status: isApiError(error) && error.status === 404 ? "missing" : "error" });
      },
    );
    return () => { active = false; };
  }, [attemptId, reload]);

  const attempt = load.status === "ready" ? load.attempt : null;
  const subjectHref = attempt && scopedUrl(
    `/learning/exams/${encodeURIComponent(attempt.pack_id)}/${encodeURIComponent(attempt.subject_id)}`,
    workspaceId ?? undefined,
  );

  return (
    <LearningShell
      title={t("mock", { ns: "exam" })}
      subtitle={null}
      back={false}
      icon={ClipboardList}
      action={subjectHref && <Link href={subjectHref} className={pageActionClass("secondary")}>{t("Back to topics")}</Link>}
    >
      {load.status === "loading" && <LearningSkeleton count={1} />}
      {load.status === "missing" && <LearningEmptyState title={t("Not found")} />}
      {load.status === "error" && (
        <LearningErrorState message={t("Could not load the list")} onRetry={() => {
          setLoad({ status: "loading" });
          setReload((current) => current + 1);
        }} />
      )}
      {load.status === "ready" && (load.attempt.result
        ? <MockReview attempt={load.attempt} result={load.attempt.result} />
        : <MockPaper attempt={load.attempt} openedAt={load.openedAt} />)}
    </LearningShell>
  );
}

function MockRoute() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const workspaceId = workspaceIdOf(useSearchParams());
  return <MockAttemptPage key={JSON.stringify([attemptId, workspaceId])} attemptId={attemptId} workspaceId={workspaceId} />;
}

export default function Page() {
  return (
    <Suspense fallback={<LearningSkeleton count={1} />}>
      <MockRoute />
    </Suspense>
  );
}
