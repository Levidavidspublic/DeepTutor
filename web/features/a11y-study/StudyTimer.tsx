"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ProgressRing } from "@/components/space/learning/ProgressRing";
import { normalizeLanguage, type AppLanguage } from "@/i18n/languages";
import { Button } from "@/shared/ui/Button";

export const DEFAULT_STUDY_MINUTES = 20;
const SECOND_MS = 1000;
const MINUTE_SECONDS = 60;
const TIMER_COPY: Record<AppLanguage, { label: string; finished: string }> = {
  en: { label: "Study timer", finished: "Time is up." },
  zh: { label: "学习计时器", finished: "时间到了。" },
  fr: { label: "Minuteur d’étude", finished: "Le temps est écoulé." },
  de: { label: "Lerntimer", finished: "Die Zeit ist um." },
  uk: { label: "Навчальний таймер", finished: "Час вийшов." },
  pl: { label: "Minutnik nauki", finished: "Czas minął." },
  pt: { label: "Temporizador de estudo", finished: "O tempo acabou." },
  vi: { label: "Hẹn giờ học", finished: "Đã hết giờ." },
  ja: { label: "学習タイマー", finished: "時間になりました。" },
  tr: { label: "Çalışma zamanlayıcısı", finished: "Süre doldu." },
  ko: { label: "공부 타이머", finished: "시간이 다 됐어요." },
  it: { label: "Timer di studio", finished: "Il tempo è scaduto." },
  hu: { label: "Tanulási időzítő", finished: "Lejárt az idő." },
};

export function normalizeStudyMinutes(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  return DEFAULT_STUDY_MINUTES;
}

export function StudyTimer({ minutes = DEFAULT_STUDY_MINUTES }: { minutes?: number }) {
  const { t, i18n } = useTranslation();
  const copy = TIMER_COPY[normalizeLanguage(i18n.language)];
  const durationMs = normalizeStudyMinutes(minutes) * MINUTE_SECONDS * SECOND_MS;
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const timeLeft = remainingMs ?? durationMs;
  const secondsLeft = Math.ceil(timeLeft / SECOND_MS);
  const displayMinutes = String(Math.floor(secondsLeft / MINUTE_SECONDS)).padStart(2, "0");
  const displaySeconds = String(secondsLeft % MINUTE_SECONDS).padStart(2, "0");

  useEffect(() => {
    if (deadline === null) return;

    let timeout: number;
    const tick = () => {
      // A deadline keeps the timer accurate even when the browser delays ticks.
      const remaining = Math.max(0, deadline - Date.now());
      setRemainingMs(remaining);
      if (remaining === 0) {
        setDeadline(null);
      } else {
        timeout = window.setTimeout(tick, remaining % SECOND_MS || SECOND_MS);
      }
    };

    tick();
    return () => window.clearTimeout(timeout);
  }, [deadline]);

  function toggleRunning() {
    const now = Date.now();
    if (deadline !== null) {
      setRemainingMs(Math.max(0, deadline - now));
      setDeadline(null);
      return;
    }

    const remaining = timeLeft || durationMs;
    setRemainingMs(remaining);
    setDeadline(now + remaining);
  }

  function reset() {
    setDeadline(null);
    setRemainingMs(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="inline-flex items-center gap-2 motion-reduce:[&_circle]:transition-none">
        <ProgressRing value={timeLeft / durationMs} showLabel={false} />
        <span role="timer" aria-label={copy.label} className="font-medium tabular-nums">
          {displayMinutes}:{displaySeconds}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11 motion-reduce:transition-none" onClick={toggleRunning}>
          {deadline === null ? t("Start") : t("Pause")}
        </Button>
        <Button className="min-h-11 motion-reduce:transition-none" variant="secondary" onClick={reset}>
          {t("Reset")}
        </Button>
      </div>
      <span role="status" aria-live="polite" aria-atomic="true">
        {remainingMs === 0 ? copy.finished : null}
      </span>
    </div>
  );
}
