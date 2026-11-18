"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { redirect, RedirectType } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { useTranslation } from "react-i18next";
import { pageActionClass } from "@/components/layout/FeaturePage";
import {
  LearningEmptyState,
  LearningErrorState,
  LearningShell,
  LearningSkeleton,
} from "@/components/learning/LearningShell";
import { GlossaryChip } from "@/features/a11y-study/GlossaryChip";
import { RtlBlock } from "@/features/a11y-study/RtlBlock";
import { masterySessionRoute } from "@/lib/mastery-mode";
import { activeWorkspaceId, scopedUrl } from "@/lib/workspace-scope";
import { Button } from "@/shared/ui/Button";
import { Dialog } from "@/shared/ui/Dialog";
import { StatusChip } from "@/shared/ui/StatusChip";
import { createMasteryLink, getExamSubject, getGlossary } from "../api";
import type { ExamSubjectDetail, ExamTopic, GlossaryTerm } from "../types";

type LoadState<T> =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: T };

type StudyLaunch =
  | { status: "idle" }
  | { status: "pending" | "error"; topicId: string }
  | { status: "ready"; href: string };

function textLanguage(text: string, lang?: string) {
  return lang ?? (/\p{Script=Hebrew}/u.test(text) ? "he" : undefined);
}

function PackText({ text, lang }: { text: string; lang?: string }) {
  const language = textLanguage(text, lang);
  return language?.toLowerCase().split("-")[0] === "he" ? (
    <RtlBlock as="span" lang={language}>{text}</RtlBlock>
  ) : (
    <bdi lang={language}>{text}</bdi>
  );
}

function TopicGroup({
  title,
  topics,
  sourceLang,
  uiLang,
  renderActions,
}: {
  title: ReactNode;
  topics: ExamTopic[];
  sourceLang?: string;
  uiLang?: string;
  renderActions: (topicId: string) => ReactNode;
}) {
  const headingId = useId();
  const { t } = useTranslation();
  const labels = {
    new: t("New"),
    learning: t("Learning"),
    review: t("Review"),
    done: t("Done"),
  };

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="text-lg font-semibold">{title}</h2>
      {topics.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Nothing here yet")}</p>
      ) : (
        <ul role="list" className="grid gap-2">
          {topics.map((topic) => (
            <li key={topic.id} className="space-y-2 rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="min-w-0 break-words text-base font-semibold">
                  <PackText text={topic.title} lang={uiLang} />
                </h3>
                <StatusChip>
                  {topic.status && Object.hasOwn(labels, topic.status)
                    ? labels[topic.status]
                    : labels.new}
                </StatusChip>
              </div>
              {topic.title_source && topic.title_source !== topic.title && (
                <p className="break-words text-sm text-muted-foreground">
                  <PackText text={topic.title_source} lang={sourceLang} />
                </p>
              )}
              {topic.objectives.length > 0 && (
                <ul className="list-disc space-y-1 ps-5 text-sm">
                  {topic.objectives.map((objective, index) => (
                    <li key={index} className="break-words">
                      <PackText text={objective} lang={uiLang} />
                    </li>
                  ))}
                </ul>
              )}
              {renderActions(topic.id)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GlossaryDialog({
  packId,
  subject,
  title,
  onClose,
}: {
  packId: string;
  subject: ExamSubjectDetail;
  title: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState<GlossaryTerm[]>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void getGlossary(packId).then(
      (data) => {
        if (active) setState({ status: "ready", data });
      },
      () => {
        if (active) setState({ status: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [packId, attempt]);

  function retry() {
    // Move focus before replacing the retry button with the loading state.
    const dialog = errorRef.current?.closest('[role="dialog"]');
    dialog?.querySelector<HTMLButtonElement>("header button")?.focus();
    setState({ status: "loading" });
    setAttempt((current) => current + 1);
  }

  const topicIds = new Set(subject.topics.map((topic) => topic.id));
  const terms = state.status === "ready"
    ? state.data.filter(({ topic_ids }) =>
        topic_ids.length === 0 || topic_ids.some((id) => topicIds.has(id)))
    : [];

  return (
    <Dialog open title={title} closeLabel={t("Close")} onClose={onClose}>
      {state.status === "loading" && <LearningSkeleton />}
      {state.status === "error" && (
        <div ref={errorRef}>
          <LearningErrorState message={t("Could not load the list")} onRetry={retry} />
        </div>
      )}
      {state.status === "ready" && (
        terms.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Nothing here yet")}</p>
        ) : (
          <ul role="list" className="space-y-4">
            {terms.map(({ term_source, term_ui, note }, index) => {
              const sourceLang = textLanguage(term_source, subject.source_lang);
              const uiLang = textLanguage(term_ui, subject.ui_lang) ?? "en";
              return (
                <li key={index} className="space-y-1 break-words">
                  {sourceLang === "he" && uiLang === "en" ? (
                    <GlossaryChip term_source={term_source} term_ui={term_ui} />
                  ) : (
                    <StatusChip>
                      <PackText text={term_source} lang={sourceLang} />
                      <PackText text={term_ui} lang={uiLang} />
                    </StatusChip>
                  )}
                  {note && (
                    <p className="text-sm text-muted-foreground">
                      <PackText text={note} lang={subject.ui_lang} />
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )
      )}
    </Dialog>
  );
}

export function SubjectTopicMap({ packId, subjectId }: { packId: string; subjectId: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState<ExamSubjectDetail>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [studyLaunch, setStudyLaunch] = useState<StudyLaunch>({ status: "idle" });
  const studyInFlight = useRef(false);

  useEffect(() => {
    let active = true;
    void getExamSubject(packId, subjectId).then(
      (data) => {
        if (active) setState({ status: "ready", data });
      },
      () => {
        if (active) setState({ status: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [packId, subjectId, attempt]);

  function retry() {
    setState({ status: "loading" });
    setAttempt((current) => current + 1);
  }

  async function startStudy(topicId: string) {
    if (studyInFlight.current) return;
    studyInFlight.current = true;
    setStudyLaunch({ status: "pending", topicId });
    const workspaceId = activeWorkspaceId();

    try {
      const { path_id } = await createMasteryLink(packId, subjectId, topicId);
      setStudyLaunch({ status: "ready", href: masterySessionRoute(path_id, "study", workspaceId) });
    } catch {
      studyInFlight.current = false;
      setStudyLaunch({ status: "error", topicId });
    }
  }

  function renderTopicActions(topicId: string) {
    const studyPending = studyLaunch.status === "pending";
    const teachBackPath = `/learning/exams/${encodeURIComponent(packId)}/${encodeURIComponent(subjectId)}/teach-back`;
    const teachBackHref = scopedUrl(`${teachBackPath}?${new URLSearchParams({ topic: topicId })}`);

    return (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={studyPending}
            loading={studyPending && studyLaunch.topicId === topicId}
            onClick={() => void startStudy(topicId)}
          >
            {t("study", { ns: "exam" })}
          </Button>
          <Link href={teachBackHref} className={pageActionClass("secondary")}>
            {t("teachBack", { ns: "exam" })}
          </Link>
        </div>
        {studyLaunch.status === "error" && studyLaunch.topicId === topicId && (
          <LearningErrorState
            message={t("Could not start the conversation")}
            onRetry={() => void startStudy(topicId)}
          />
        )}
      </>
    );
  }

  if (studyLaunch.status === "ready") redirect(studyLaunch.href, RedirectType.push);

  const subject = state.status === "ready" ? state.data : null;
  const glossaryLabel = t("glossary", { ns: "exam" });
  const assigned = new Set<string>();
  const groups = subject?.questionnaires.map((questionnaire) => ({
    questionnaire,
    topics: subject.topics.filter((topic) => {
      if (!Object.hasOwn(questionnaire.topic_weights, topic.id)) return false;
      assigned.add(topic.id);
      return true;
    }),
  }));
  const unassigned = subject?.topics.filter((topic) => !assigned.has(topic.id)) ?? [];

  return (
    <LearningShell
      title={subject
        ? <PackText text={subject.title} lang={subject.ui_lang} />
        : t("title", { ns: "exam" })}
      subtitle={null}
      icon={ClipboardList}
      action={subject && (
        <Button variant="secondary" aria-haspopup="dialog" onClick={() => setGlossaryOpen(true)}>
          {glossaryLabel}
        </Button>
      )}
    >
      {state.status === "loading" && <LearningSkeleton />}
      {state.status === "error" && (
        <LearningErrorState message={t("Could not load the list")} onRetry={retry} />
      )}
      {subject && (
        subject.topics.length === 0 ? (
          <LearningEmptyState title={t("Nothing here yet")} />
        ) : (
          <div className="space-y-6">
            {groups?.map(({ questionnaire, topics }) => (
              <TopicGroup
                key={questionnaire.code}
                title={<PackText text={questionnaire.title} lang={subject.ui_lang} />}
                topics={topics}
                sourceLang={subject.source_lang}
                uiLang={subject.ui_lang}
                renderActions={renderTopicActions}
              />
            ))}
            {unassigned.length > 0 && (
              <TopicGroup
                title={t("Other")}
                topics={unassigned}
                sourceLang={subject.source_lang}
                uiLang={subject.ui_lang}
                renderActions={renderTopicActions}
              />
            )}
          </div>
        )
      )}
      {subject && glossaryOpen && (
        <GlossaryDialog
          packId={packId}
          subject={subject}
          title={glossaryLabel}
          onClose={() => setGlossaryOpen(false)}
        />
      )}
    </LearningShell>
  );
}
