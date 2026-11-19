"use client";

import { useEffect, useState } from "react";
import { createInstance } from "i18next";
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
import de from "@/locales/de/exam.json";
import en from "@/locales/en/exam.json";
import fr from "@/locales/fr/exam.json";
import hu from "@/locales/hu/exam.json";
import it from "@/locales/it/exam.json";
import ja from "@/locales/ja/exam.json";
import ko from "@/locales/ko/exam.json";
import pl from "@/locales/pl/exam.json";
import pt from "@/locales/pt/exam.json";
import tr from "@/locales/tr/exam.json";
import uk from "@/locales/uk/exam.json";
import vi from "@/locales/vi/exam.json";
import zh from "@/locales/zh/exam.json";
import { listExamPacks } from "../api";
import type { ExamPackSummary } from "../types";
import { ExamPackCard } from "./ExamPackCard";

// Supply exam translations for locales without a loaded exam resource.
const examI18n = createInstance();
void examI18n.init({
  resources: {
    de: { exam: de },
    en: { exam: en },
    fr: { exam: fr },
    hu: { exam: hu },
    it: { exam: it },
    ja: { exam: ja },
    ko: { exam: ko },
    pl: { exam: pl },
    pt: { exam: pt },
    tr: { exam: tr },
    uk: { exam: uk },
    vi: { exam: vi },
    zh: { exam: zh },
  },
  lng: "en",
  fallbackLng: "en",
  ns: ["exam"],
  keySeparator: false,
});

type PackList =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; packs: ExamPackSummary[] };

export function ExamsHome() {
  const { i18n, t: tApp } = useTranslation("app");
  const { t: tExam } = useTranslation("exam");
  const locale = normalizeLanguage(i18n.language);
  const t = i18n.hasResourceBundle(locale, "exam") ? tExam : examI18n.getFixedT(locale, "exam");
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
