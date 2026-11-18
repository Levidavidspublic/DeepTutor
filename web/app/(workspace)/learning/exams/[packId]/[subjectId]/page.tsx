"use client";

import { useParams } from "next/navigation";
import { SubjectTopicMap } from "@/features/exam-prep/components/SubjectTopicMap";

export default function Page() {
  const { packId, subjectId } = useParams<{ packId: string; subjectId: string }>();

  return (
    <SubjectTopicMap
      key={JSON.stringify([packId, subjectId])}
      packId={packId}
      subjectId={subjectId}
    />
  );
}
