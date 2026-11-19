"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { clampStudyComfort, DEFAULT_STUDY_COMFORT, type StudyComfortSettings } from "./studyComfort";

const STORAGE_KEY = "deeptutor-study-comfort";

interface StudyComfortContextValue {
  settings: Readonly<StudyComfortSettings>;
  updateSettings: (changes: Partial<StudyComfortSettings>) => void;
}

const StudyComfortContext = createContext<StudyComfortContextValue | null>(null);

function normalizeSettings(value: unknown): StudyComfortSettings {
  // Only the system font is available. Keep the rest of any saved preferences.
  return { ...clampStudyComfort(value), font: DEFAULT_STUDY_COMFORT.font };
}

function readStoredSettings(): StudyComfortSettings | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return normalizeSettings(JSON.parse(stored));
  } catch {
    // Storage may be unavailable or contain invalid JSON.
  }
  return null;
}

export function StudyComfortProvider({ children }: { children: ReactNode }) {
  const [storedSettings, setStoredSettings] = useState<StudyComfortSettings | null>(null);
  const settings = storedSettings ?? DEFAULT_STUDY_COMFORT;

  useEffect(() => {
    let active = true;
    // Keep the initial render consistent with the server before reading browser preferences.
    queueMicrotask(() => {
      if (!active) return;
      const saved = readStoredSettings();
      if (saved) setStoredSettings((current) => current ?? saved);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (storedSettings === null) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedSettings));
    } catch {
      // The current settings still apply if storage is unavailable.
    }
  }, [storedSettings]);

  const updateSettings = useCallback((changes: Partial<StudyComfortSettings>) => {
    setStoredSettings((current) =>
      normalizeSettings({ ...(current ?? DEFAULT_STUDY_COMFORT), ...changes }),
    );
  }, []);

  const value = useMemo(() => ({ settings, updateSettings }), [settings, updateSettings]);
  const style = {
    "--study-font": "system-ui, sans-serif",
    "--study-size": `${settings.sizePct}%`,
    "--study-line-height": settings.lineHeight,
    "--study-letter-spacing": settings.letterSpacing === "wide" ? "0.05em" : "normal",
  } as CSSProperties;

  return (
    <StudyComfortContext.Provider value={value}>
      <div style={style} data-contrast={settings.contrast}>
        {children}
      </div>
    </StudyComfortContext.Provider>
  );
}

export function useStudyComfort(): StudyComfortContextValue {
  const context = useContext(StudyComfortContext);
  if (context === null) {
    throw new Error("useStudyComfort must be used within a StudyComfortProvider");
  }
  return context;
}
