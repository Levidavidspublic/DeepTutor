"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { redirect, RedirectType } from "next/navigation";
import { useTranslation } from "react-i18next";
import { LearningErrorState } from "@/components/learning/LearningShell";
import { MODEL_SERVICE_PAGES } from "@/lib/model-settings";
import { activeWorkspaceId, scopedUrl } from "@/lib/workspace-scope";
import { isApiError } from "@/shared/api/errors";
import { Button } from "@/shared/ui/Button";
import { Dialog } from "@/shared/ui/Dialog";
import { startMock } from "../mockApi";
import type { ExamSubjectDetail } from "../types";

type LaunchState =
  | { status: "idle" | "pending" }
  | { status: "error"; modelUnavailable: boolean }
  | { status: "ready"; href: string };

export function ExamMockLauncher({
  packId,
  subject,
  onClose,
}: {
  packId: string;
  subject: ExamSubjectDetail;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const formId = useId();
  const pickerId = useId();
  const [selectedCode, setSelectedCode] = useState(subject.questionnaires[0]?.code ?? "");
  const [launch, setLaunch] = useState<LaunchState>({ status: "idle" });
  const inFlight = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;

    inFlight.current = true;
    setLaunch({ status: "pending" });
    const workspaceId = activeWorkspaceId();
    try {
      const { attempt_id } = await startMock(packId, subject.id, selectedCode);
      const href = scopedUrl(`/learning/exams/mock/${encodeURIComponent(attempt_id)}`, workspaceId);
      setLaunch({ status: "ready", href });
    } catch (error) {
      inFlight.current = false;
      setLaunch({ status: "error", modelUnavailable: isApiError(error) && error.status === 503 });
    }
  }

  if (launch.status === "ready") redirect(launch.href, RedirectType.push);

  const pending = launch.status === "pending";
  const startLabel = launch.status === "error" ? t("Retry") : t("Start");
  const duration = new Intl.NumberFormat(i18n.resolvedLanguage, {
    style: "unit",
    unit: "minute",
    unitDisplay: "long",
  });

  return (
    <Dialog
      open
      title={t("mock", { ns: "exam" })}
      closeLabel={t("Close")}
      busy={pending}
      onClose={onClose}
      footer={(
        <Button
          type="submit"
          form={formId}
          aria-disabled={pending || undefined}
          className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        >
          {pending ? t("Starting...") : startLabel}
        </Button>
      )}
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-2">
        <label htmlFor={pickerId} className="block text-sm font-medium">{t("Select")}</label>
        <select
          id={pickerId}
          data-autofocus
          disabled={pending}
          value={selectedCode}
          onChange={(event) => {
            setSelectedCode(event.target.value);
            setLaunch({ status: "idle" });
          }}
          className="w-full rounded-lg border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {subject.questionnaires.map(({ code, title, minutes }) => (
            <option key={code} value={code} dir="auto">
              {title} · {duration.format(minutes)}
            </option>
          ))}
        </select>
        {launch.status === "error" && (
          <LearningErrorState message={launch.modelUnavailable ? (
            <>
              {t("No language model is configured yet.")}
              <Link href={MODEL_SERVICE_PAGES.llm.path} target="_blank" rel="noopener" className="ms-2 font-medium underline">
                {t("Open model settings")}
              </Link>
            </>
          ) : t("Something went wrong.")} />
        )}
      </form>
    </Dialog>
  );
}
