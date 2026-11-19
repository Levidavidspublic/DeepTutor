"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QuickCapture } from "@/features/exam-prep/components/QuickCapture";
import { SubjectTopicMap } from "@/features/exam-prep/components/SubjectTopicMap";

export default function Page() {
  const { packId, subjectId } = useParams<{ packId: string; subjectId: string }>();

  return <SubjectPage key={JSON.stringify([packId, subjectId])} packId={packId} subjectId={subjectId} />;
}

function SubjectPage({ packId, subjectId }: { packId: string; subjectId: string }) {
  const page = useRef<HTMLDivElement>(null);
  const [capture, setCapture] = useState<{ container: HTMLElement; title: string } | null>(null);

  useEffect(() => {
    const container = page.current?.querySelector<HTMLElement>("[data-page-container]");
    const heading = container?.querySelector("h1");
    if (!container || !heading) return;

    // The map owns subject loading. Its heading wraps the pack title in
    // language-aware markup once the subject is available.
    const syncSubjectTitle = () => {
      const title = heading.firstElementChild?.textContent;
      setCapture(title ? { container, title } : null);
    };

    const observer = new MutationObserver(syncSubjectTitle);
    observer.observe(heading, { childList: true, characterData: true, subtree: true });
    syncSubjectTitle();
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={page} className="contents">
      <SubjectTopicMap packId={packId} subjectId={subjectId} />
      {capture && createPortal(<QuickCapture subjectTitle={capture.title} />, capture.container)}
    </div>
  );
}
