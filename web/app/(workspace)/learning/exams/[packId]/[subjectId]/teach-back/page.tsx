"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageActionClass } from "@/components/layout/FeaturePage";
import {
  LearningEmptyState,
  LearningErrorState,
  LearningShell,
  LearningSkeleton,
} from "@/components/learning/LearningShell";
import { getExamSubject } from "@/features/exam-prep/api";
import { TeachBackCard } from "@/features/exam-prep/components/TeachBackCard";
import type { ExamTopic } from "@/features/exam-prep/types";
import { scopedUrl, workspaceIdOf } from "@/lib/workspace-scope";
import { isApiError } from "@/shared/api/errors";

type TopicState =
  | { status: "loading" | "missing" | "error" }
  | { status: "ready"; topic: ExamTopic; uiLang?: string };

function TeachBackTopic({ packId, subjectId, topicId, subjectHref }: {
  packId: string;
  subjectId: string;
  topicId: string | null;
  subjectHref: string;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<TopicState>({ status: topicId ? "loading" : "missing" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!topicId) return;

    let active = true;
    void getExamSubject(packId, subjectId).then(
      (subject) => {
        if (!active) return;
        const topic = subject.topics.find(({ id }) => id === topicId);
        setState(topic ? { status: "ready", topic, uiLang: subject.ui_lang } : { status: "missing" });
      },
      (error: unknown) => {
        if (!active) return;
        setState({ status: isApiError(error) && error.status === 404 ? "missing" : "error" });
      },
    );
    return () => { active = false; };
  }, [packId, subjectId, topicId, attempt]);

  function retry() {
    setState({ status: "loading" });
    setAttempt((current) => current + 1);
  }

  return (
    <LearningShell
      title={t("teachBack", { ns: "exam" })}
      subtitle={null}
      back={false}
      icon={ClipboardList}
      action={<Link href={subjectHref} className={pageActionClass("secondary")}>{t("Back to topics")}</Link>}
    >
      {state.status === "loading" && <LearningSkeleton count={1} />}
      {state.status === "missing" && <LearningEmptyState title={t("Not found")} />}
      {state.status === "error" && (
        <LearningErrorState message={t("Could not load the list")} onRetry={retry} />
      )}
      {state.status === "ready" && (
        <TeachBackCard
          packId={packId}
          subjectId={subjectId}
          topic={state.topic}
          uiLang={state.uiLang}
          subjectHref={subjectHref}
        />
      )}
    </LearningShell>
  );
}

function TeachBackRoute() {
  const { packId, subjectId } = useParams<{ packId: string; subjectId: string }>();
  const search = useSearchParams();
  const topicId = search.get("topic");
  const workspaceId = workspaceIdOf(search);
  const subjectPath = `/learning/exams/${encodeURIComponent(packId)}/${encodeURIComponent(subjectId)}`;
  const subjectHref = workspaceId === null ? subjectPath : scopedUrl(subjectPath, workspaceId);

  return (
    <TeachBackTopic
      key={JSON.stringify([packId, subjectId, topicId, workspaceId])}
      packId={packId}
      subjectId={subjectId}
      topicId={topicId}
      subjectHref={subjectHref}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LearningSkeleton count={1} />}>
      <TeachBackRoute />
    </Suspense>
  );
}
