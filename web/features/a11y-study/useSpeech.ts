"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The browser has one speech queue. Track which study block owns playback.
let activeSpeech: { owner: object; cancel: () => void } | null = null;

export function useSpeech(text: string, rate: number, lang: string) {
  const owner = useRef(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const stop = useCallback(() => {
    if (activeSpeech?.owner === owner) activeSpeech.cancel();
  }, []);

  useEffect(() => stop, [stop]);

  const speak = useCallback(() => {
    if (typeof window === "undefined" || !text.trim()) return;
    const { speechSynthesis, SpeechSynthesisUtterance } = window;
    if (!speechSynthesis || !SpeechSynthesisUtterance) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = Number.isNaN(rate) ? 1 : Math.min(2, Math.max(0.5, rate));

    const finish = () => {
      if (activeSpeech !== playback) return;
      activeSpeech = null;
      utterance.onend = null;
      utterance.onerror = null;
      setIsSpeaking(false);
    };
    const playback = {
      owner,
      cancel: () => {
        finish();
        speechSynthesis.cancel();
      },
    };

    activeSpeech?.cancel();
    activeSpeech = playback;
    utterance.onend = finish;
    utterance.onerror = finish;
    setIsSpeaking(true);
    try {
      speechSynthesis.speak(utterance);
    } catch {
      finish();
    }
  }, [text, rate, lang]);

  return { speak, stop, isSpeaking };
}
