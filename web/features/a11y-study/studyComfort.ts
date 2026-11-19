export interface StudyComfortSettings {
  font: "system" | "lexend" | "opendyslexic";
  sizePct: number;
  lineHeight: number;
  letterSpacing: "normal" | "wide";
  contrast: "normal" | "high";
  readAloudRate: number;
  reducedMotion: boolean;
}

export const DEFAULT_STUDY_COMFORT: Readonly<StudyComfortSettings> = {
  font: "system",
  sizePct: 100,
  lineHeight: 1.6,
  letterSpacing: "normal",
  contrast: "normal",
  readAloudRate: 1,
  reducedMotion: false,
};

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function clampStudyComfort(value: unknown): StudyComfortSettings {
  const settings =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof StudyComfortSettings, unknown>>)
      : {};

  return {
    font:
      settings.font === "lexend" || settings.font === "opendyslexic"
        ? settings.font
        : DEFAULT_STUDY_COMFORT.font,
    sizePct: clampNumber(settings.sizePct, 100, 150, DEFAULT_STUDY_COMFORT.sizePct),
    lineHeight: clampNumber(settings.lineHeight, 1.5, 2, DEFAULT_STUDY_COMFORT.lineHeight),
    letterSpacing: settings.letterSpacing === "wide" ? "wide" : DEFAULT_STUDY_COMFORT.letterSpacing,
    contrast: settings.contrast === "high" ? "high" : DEFAULT_STUDY_COMFORT.contrast,
    readAloudRate: clampNumber(settings.readAloudRate, 0.5, 2, DEFAULT_STUDY_COMFORT.readAloudRate),
    reducedMotion: settings.reducedMotion === true,
  };
}
