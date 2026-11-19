import { useId } from "react";
import type { ExamPackSummary } from "../types";

export function ExamPackCard({
  pack,
  subjectsLabel,
}: {
  pack: ExamPackSummary;
  subjectsLabel: string;
  continueLabel: string;
}) {
  const titleId = useId();

  return (
    <article className="flex h-full flex-col gap-4 rounded-xl bg-muted/45 p-4" aria-labelledby={titleId}>
      <h2 id={titleId} className="break-words text-base font-semibold">
        <bdi lang={pack.ui_lang}>{pack.title}</bdi>
      </h2>
      {pack.subjects.length > 0 && (
        <div className="space-y-1 text-sm">
          <p className="font-medium">{subjectsLabel}</p>
          <ul className="list-disc space-y-2 ps-5 text-muted-foreground" aria-label={subjectsLabel}>
            {pack.subjects.map((subject) => (
              <li key={subject.id} className="break-words">
                <bdi lang={pack.ui_lang}>{subject.title}</bdi>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
