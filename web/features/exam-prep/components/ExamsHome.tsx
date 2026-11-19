"use client";

import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { useTranslation } from "react-i18next";
import { pageGridClass } from "@/components/layout/FeaturePage";
import {
  LearningEmptyState,
  LearningErrorState,
  LearningShell,
  LearningSkeleton,
} from "@/components/learning/LearningShell";
import { normalizeLanguage } from "@/i18n/languages";
import { listExamPacks } from "../api";
import type { ExamPackSummary } from "../types";
import { ExamPackCard } from "./ExamPackCard";

type PackList =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; packs: ExamPackSummary[] };

export function ExamsHome() {
  const { t, i18n } = useTranslation("exam");
  const locale = normalizeLanguage(i18n.language);
  const { t: tApp } = useTranslation("app");
  const [list, setList] = useState<PackList>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void listExamPacks().then(
      (packs) => {
        if (active) setList({ status: "ready", packs });
      },
      () => {
        if (active) setList({ status: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  function retry() {
    setList({ status: "loading" });
    setAttempt((current) => current + 1);
  }

  return (
    <LearningShell title={t("title")} subtitle={null} icon={ClipboardList}>
      {list.status === "loading" && <LearningSkeleton />}
      {list.status === "error" && (
        <LearningErrorState message={tApp("Could not load the list")} onRetry={retry} />
      )}
      {list.status === "ready" && (
        list.packs.length === 0 ? (
          <LearningEmptyState
            title={t("empty.title")}
            description={t("empty.body")}
            icon={<ClipboardList size={24} aria-hidden />}
          />
        ) : (
          <ul className={pageGridClass(2)} role="list">
            {list.packs.map((pack) => (
              <li key={pack.id}>
                <ExamPackCard
                  pack={pack}
                  locale={locale}
                  subjectsLabel={t("subjects")}
                  continueLabel={t("continue")}
                  progressLabel={t("progress")}
                  examDateLabel={t("examDate")}
                />
              </li>
            ))}
          </ul>
        )
      )}
    </LearningShell>
  );
}
