"use client";

import { Square, Volume2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { IconButton } from "@/shared/ui/IconButton";

import { useSpeech } from "./useSpeech";

interface ReadAloudButtonProps {
  text: string;
  rate?: number;
  lang?: string;
}

export function ReadAloudButton({
  text,
  rate = 1,
  lang = "en",
}: ReadAloudButtonProps) {
  const { t } = useTranslation();
  const { speak, stop, isSpeaking } = useSpeech(text, rate, lang);

  return (
    <IconButton
      label={isSpeaking ? t("Stop reading aloud") : t("Read aloud")}
      icon={
        isSpeaking ? (
          <Square size={16} fill="currentColor" aria-hidden="true" />
        ) : (
          <Volume2 size={16} aria-hidden="true" />
        )
      }
      disabled={!isSpeaking && !text.trim()}
      onClick={isSpeaking ? stop : speak}
      className="motion-reduce:transition-none"
    />
  );
}
