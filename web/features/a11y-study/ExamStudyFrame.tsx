"use client";

import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { FocusFrame, FocusModeToggle } from "./FocusMode";
import { useStudyComfort } from "./StudyComfortProvider";

export function ExamStudyFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isMockAttempt = /^\/learning\/exams\/mock\/[^/]+\/?$/.test(pathname ?? "");
  const { settings } = useStudyComfort();
  const readingStyle: CSSProperties & { "--exam-reading-size": string } = {
    "--exam-reading-size": `${settings.sizePct / 100}rem`,
    fontFamily: "var(--study-font)",
    fontSize: "var(--exam-reading-size)",
    lineHeight: "var(--study-line-height)",
    letterSpacing: "var(--study-letter-spacing)",
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col
        [[data-contrast=high]_&]:[--muted-foreground:var(--foreground)]
        [[data-contrast=high]_&]:[--border:var(--foreground)]
        [[data-contrast=high]_&]:[--input:var(--foreground)]"
    >
      <div className="mx-auto w-full max-w-[1180px] shrink-0 px-6 py-2 md:px-9">
        <FocusModeToggle />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto [&>section]:min-h-full">
        <FocusFrame showStudyTimer={!isMockAttempt}>
          {/* Keep the Learning shell's text hierarchy relative to the reading size. */}
          <div
            style={readingStyle}
            className="h-full
              [&_:is(.dt-page-title,.font-serif)]:[font-family:inherit]
              [&_:is(h1,h2,h3,p,a,button,li,label,textarea)]:[line-height:var(--study-line-height)]
              [&_:is(h1,h2,h3,p,a,button,li,label,textarea)]:[letter-spacing:var(--study-letter-spacing)]
              [&_.dt-page-title]:[font-size:1.75em]
              [&_.dt-page-action]:[font-size:calc(var(--exam-reading-size)*0.78125)]
              [&_.text-xs]:[font-size:0.75em]
              [&_.text-sm]:[font-size:0.875em]
              [&_.text-base]:[font-size:1em]
              [&_.text-lg]:[font-size:1.125em]"
          >
            {children}
          </div>
        </FocusFrame>
      </div>
    </div>
  );
}
