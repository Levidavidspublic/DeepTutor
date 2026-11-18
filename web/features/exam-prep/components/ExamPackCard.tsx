import { useId } from "react";
import Link from "next/link";
import { pageActionClass } from "@/components/layout/FeaturePage";
import { ProgressRing } from "@/components/space/learning/ProgressRing";
import type { ExamPackSummary } from "../types";

export function ExamPackCard({
  pack,
  locale,
  subjectsLabel,
  continueLabel,
  progressLabel,
  examDateLabel,
}: {
  pack: ExamPackSummary;
  locale: string;
  subjectsLabel: string;
  continueLabel: string;
  progressLabel: string;
  examDateLabel: string;
}) {
  const titleId = useId();
  const packPath = `/learning/exams/${encodeURIComponent(pack.id)}`;
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  });

  return (
    <article className="flex h-full flex-col gap-4 rounded-xl bg-muted/45 p-4" aria-labelledby={titleId}>
      <h2 id={titleId} className="break-words text-base font-semibold">
        <bdi lang={pack.ui_lang}>{pack.title}</bdi>
      </h2>
      {pack.subjects.length > 0 && (
        <div className="space-y-1 text-sm">
          <p className="font-medium">{subjectsLabel}</p>
          <ul className="list-disc space-y-2 ps-5 text-muted-foreground" aria-label={subjectsLabel}>
            {pack.subjects.map((subject) => {
              const progress = subject.progress;
              const hasProgress = progress && progress.total > 0;
              const examDate = subject.exam_date ? Date.parse(subject.exam_date) : NaN;
              const hasExamDate = Number.isFinite(examDate);

              return (
                <li key={subject.id} className="break-words">
                  <Link
                    href={`${packPath}/${encodeURIComponent(subject.id)}`}
                    aria-describedby={titleId}
                    className={`${pageActionClass()} max-w-full`}
                  >
                    <span className="min-w-0">
                      {continueLabel} <bdi lang={pack.ui_lang}>{subject.title}</bdi>
                    </span>
                  </Link>
                  {(hasProgress || hasExamDate) && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {hasProgress && (
                        <span
                          role="progressbar"
                          aria-label={progressLabel}
                          aria-valuemin={0}
                          aria-valuemax={progress.total}
                          aria-valuenow={progress.done}
                          aria-valuetext={`${progress.done} / ${progress.total}`}
                        >
                          <ProgressRing value={progress.done / progress.total} />
                        </span>
                      )}
                      {hasExamDate && (
                        <span>
                          {examDateLabel}{" "}
                          <time dateTime={subject.exam_date ?? undefined}>
                            {dateFormatter.format(examDate)}
                          </time>
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </article>
  );
}
