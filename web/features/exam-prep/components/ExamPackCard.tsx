import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { pageActionClass } from "@/components/layout/FeaturePage";
import { LearningErrorState, LearningSkeleton } from "@/components/learning/LearningShell";
import { getExamSubject } from "../api";
import type { ExamPackSummary, ExamTopic } from "../types";

const examsPath = "/learning/exams";

export function ExamPackCard({
  pack,
  subjectsLabel,
  continueLabel,
}: {
  pack: ExamPackSummary;
  subjectsLabel: string;
  continueLabel: string;
}) {
  const { t } = useTranslation("app");
  const titleId = useId();
  const search = useSearchParams();
  const firstSubject = pack.subjects[0];
  const selectedSubject = search?.get("pack") === pack.id
    ? pack.subjects.find((subject) => subject.id === search.get("subject"))
    : undefined;

  function subjectHref(subjectId: string) {
    const query = new URLSearchParams(search?.toString());
    query.set("pack", pack.id);
    query.set("subject", subjectId);
    return `${examsPath}?${query}`;
  }

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
                    href={subjectHref(subject.id)}
                    scroll={false}
                    aria-current={selectedSubject?.id === subject.id ? "true" : undefined}
                    aria-describedby={titleId}
                    className={`${pageActionClass()} max-w-full`}
                  >
                    <span className="min-w-0">
                      {continueLabel} <bdi lang={pack.ui_lang}>{subject.title}</bdi>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <Link
            href={subjectHref(firstSubject.id)}
            scroll={false}
            aria-describedby={titleId}
            className={`${pageActionClass()} mt-auto self-start`}
          >
            {t("Continue")}
          </Link>
        </>
      )}
      {selectedSubject && (
        <SubjectTopics key={selectedSubject.id} pack={pack} subject={selectedSubject} />
      )}
    </article>
  );
}

function SubjectTopics({ pack, subject }: { pack: ExamPackSummary; subject: ExamPackSummary["subjects"][number] }) {
  const { t } = useTranslation("app");
  const titleId = useId();
  const [topics, setTopics] = useState<ExamTopic[] | "loading" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void getExamSubject(pack.id, subject.id).then(
      (detail) => { if (active) setTopics(detail.topics); },
      () => { if (active) setTopics("error"); },
    );
    return () => { active = false; };
  }, [pack.id, subject.id, attempt]);

  function retry() {
    setTopics("loading");
    setAttempt((current) => current + 1);
  }

  return (
    <section aria-labelledby={titleId} className="space-y-2 border-t border-border pt-4 text-sm">
      <h3 id={titleId} className="break-words font-semibold">
        <bdi lang={pack.ui_lang}>{subject.title}</bdi>
      </h3>
      {topics === "loading" ? (
        <LearningSkeleton count={1} />
      ) : topics === "error" ? (
        <LearningErrorState message={t("Could not load the list")} onRetry={retry} />
      ) : topics.length === 0 ? (
        <p className="text-muted-foreground">{t("Nothing here yet.")}</p>
      ) : (
        <ul className="list-disc space-y-1 break-words ps-5">
          {topics.map((topic) => (
            <li key={topic.id}><bdi lang={pack.ui_lang}>{topic.title}</bdi></li>
          ))}
        </ul>
      )}
    </section>
  );
}
