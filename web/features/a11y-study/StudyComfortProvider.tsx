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
const FONT_FAMILIES: Record<StudyComfortSettings["font"], string> = {
  system: "system-ui, sans-serif",
  lexend: "Lexend, system-ui, sans-serif",
  opendyslexic: "OpenDyslexic, system-ui, sans-serif",
};

// The WOFF files include their license notices in their metadata.
// Lexend is from Google Fonts (OFL 1.1). OpenDyslexic 2.001 is from the
// author's open-dyslexic repository (Bitstream Vera and CC BY 3.0).
const STUDY_FONT_FACES = `
  @font-face {
    font-family: Lexend;
    src: url("/study-fonts/lexend.woff") format("woff");
    font-weight: 100 900;
    font-display: swap;
  }
  @font-face {
    font-family: OpenDyslexic;
    src: url("/study-fonts/opendyslexic.woff") format("woff");
    font-weight: 400;
    font-display: swap;
  }
`;

interface StudyComfortContextValue {
  settings: Readonly<StudyComfortSettings>;
  updateSettings: (changes: Partial<StudyComfortSettings>) => void;
}

const StudyComfortContext = createContext<StudyComfortContextValue | null>(null);

function readStoredSettings(): StudyComfortSettings | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return clampStudyComfort(JSON.parse(stored));
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
      clampStudyComfort({ ...(current ?? DEFAULT_STUDY_COMFORT), ...changes }),
    );
  }, []);

  const value = useMemo(() => ({ settings, updateSettings }), [settings, updateSettings]);
  const style = {
    "--study-font": FONT_FAMILIES[settings.font],
    "--study-size": `${settings.sizePct}%`,
    "--study-line-height": settings.lineHeight,
    "--study-letter-spacing": settings.letterSpacing === "wide" ? "0.05em" : "normal",
  } as CSSProperties;

  return (
    <StudyComfortContext.Provider value={value}>
      <style>{STUDY_FONT_FACES}</style>
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
