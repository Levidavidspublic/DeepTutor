"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { normalizeLanguage, type AppLanguage } from "@/i18n/languages";
import { Button } from "@/shared/ui/Button";
import { DEFAULT_STUDY_MINUTES, normalizeStudyMinutes, StudyTimer } from "./StudyTimer";

const STORAGE_KEY = "deeptutor.focusMode";
const PREFERENCE_CHANGED = "deeptutor:focus-mode-changed";
const FOCUS_LABELS: Record<AppLanguage, string> = {
  en: "Focus mode",
  zh: "专注模式",
  fr: "Mode de concentration",
  de: "Fokusmodus",
  uk: "Режим зосередження",
  pl: "Tryb skupienia",
  pt: "Modo de foco",
  vi: "Chế độ tập trung",
  ja: "集中モード",
  tr: "Odak modu",
  ko: "집중 모드",
  it: "Modalità concentrazione",
  hu: "Fókuszmód",
};

interface FocusModePreferences {
  focusOn: boolean;
  minutes: number;
}

interface FocusModeValue extends FocusModePreferences {
  setFocusOn: (focusOn: boolean) => void;
}

const DEFAULT_PREFERENCES = { focusOn: false, minutes: DEFAULT_STUDY_MINUTES };
const FocusModeContext = createContext<FocusModeValue | null>(null);

function readStoredPreferences() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribeToPreferences(onChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key === STORAGE_KEY || event.key === null) onChange();
  }

  window.addEventListener("storage", onStorage);
  window.addEventListener(PREFERENCE_CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(PREFERENCE_CHANGED, onChange);
  };
}

function parsePreferences(raw: string | null): FocusModePreferences {
  if (raw === null) return DEFAULT_PREFERENCES;

  try {
    const saved = JSON.parse(raw);
    return {
      focusOn: saved?.focusOn === true,
      minutes: normalizeStudyMinutes(saved?.minutes),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function FocusModeProvider({ children }: { children: ReactNode }) {
  const stored = useSyncExternalStore(subscribeToPreferences, readStoredPreferences, () => null);
  const preferences = useMemo(() => parsePreferences(stored), [stored]);
  const [unsavedFocusOn, setUnsavedFocusOn] = useState<boolean | null>(null);
  const { minutes } = preferences;
  const focusOn = unsavedFocusOn ?? preferences.focusOn;

  const setFocusOn = useCallback(
    (nextFocusOn: boolean) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ focusOn: nextFocusOn, minutes }));
      } catch {
        setUnsavedFocusOn(nextFocusOn);
        return;
      }
      setUnsavedFocusOn(null);
      window.dispatchEvent(new Event(PREFERENCE_CHANGED));
    },
    [minutes],
  );

  const value = useMemo(() => ({ focusOn, setFocusOn, minutes }), [focusOn, setFocusOn, minutes]);
  return <FocusModeContext.Provider value={value}>{children}</FocusModeContext.Provider>;
}

export function useFocusMode() {
  const value = useContext(FocusModeContext);
  if (!value) throw new Error("Focus mode components require a FocusModeProvider");
  return value;
}

export function FocusModeToggle() {
  const { focusOn, setFocusOn } = useFocusMode();
  const { i18n } = useTranslation();

  return (
    <Button
      aria-pressed={focusOn}
      variant={focusOn ? "primary" : "secondary"}
      className="min-h-11 motion-reduce:transition-none"
      onClick={() => setFocusOn(!focusOn)}
    >
      {FOCUS_LABELS[normalizeLanguage(i18n.language)]}
    </Button>
  );
}

export function FocusFrame({ children }: { children: ReactNode }) {
  const { focusOn, minutes } = useFocusMode();
  const { i18n } = useTranslation();

  return (
    <section
      aria-label={focusOn ? FOCUS_LABELS[normalizeLanguage(i18n.language)] : undefined}
      className={focusOn
        ? "flex min-h-dvh flex-col gap-4 bg-background p-4 text-foreground sm:p-6"
        : "contents"}
    >
      {focusOn && (
        <div className="mx-auto w-full max-w-3xl">
          <StudyTimer key={minutes} minutes={minutes} />
        </div>
      )}
      <div className={focusOn ? "mx-auto w-full max-w-3xl flex-1" : "contents"}>
        {children}
      </div>
    </section>
  );
}
