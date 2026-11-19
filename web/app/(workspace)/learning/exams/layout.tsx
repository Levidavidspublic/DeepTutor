import type { ReactNode } from "react";
import { ExamStudyFrame } from "@/features/a11y-study/ExamStudyFrame";
import { FocusModeProvider } from "@/features/a11y-study/FocusMode";
import { StudyComfortProvider } from "@/features/a11y-study/StudyComfortProvider";

export default function ExamsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="contents [&>[data-contrast]]:contents">
      <StudyComfortProvider>
        <FocusModeProvider>
          <ExamStudyFrame>{children}</ExamStudyFrame>
        </FocusModeProvider>
      </StudyComfortProvider>
    </div>
  );
}
