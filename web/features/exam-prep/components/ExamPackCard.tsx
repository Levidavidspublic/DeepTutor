import { useId } from "react";
import Link from "next/link";
import { pageActionClass } from "@/components/layout/FeaturePage";
import type { ExamPackSummary } from "../types";

export function ExamPackCard({
  pack,
  subjectsLabel,
  continueLabel,
}: {
  pack: ExamPackSummary;
  subjectsLabel: string;
  continueLabel: string;
}) {
  const titleId = useId();
  const packPath = `/learning/exams/${encodeURIComponent(pack.id)}`;
  const firstSubject = pack.subjects[0];

  return (
    <article className="flex h-full flex-col gap-4 rounded-xl bg-muted/45 p-4" aria-labelledby={titleId}>
      <h2 id={titleId} className="break-words text-base font-semibold">
        <bdi lang={pack.ui_lang}>{pack.title}</bdi>
      </h2>
      {firstSubject && (
        <>
          <div className="space-y-1 text-sm">
            <p className="font-medium">{subjectsLabel}</p>
            <ul className="list-disc space-y-2 ps-5 text-muted-foreground" aria-label={subjectsLabel}>
              {pack.subjects.map((subject) => (
                <li key={subject.id} className="break-words">
                  <Link
                    href={`${packPath}/${encodeURIComponent(subject.id)}`}
                    aria-describedby={titleId}
                    className={`${pageActionClass("secondary")} max-w-full`}
                  >
                    <bdi className="min-w-0" lang={pack.ui_lang}>{subject.title}</bdi>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <Link
            href={`${packPath}/${encodeURIComponent(firstSubject.id)}`}
            aria-describedby={titleId}
            className={`${pageActionClass()} mt-auto self-start`}
          >
            {continueLabel}
          </Link>
        </>
      )}
    </article>
  );
}
