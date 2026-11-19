interface ExamSubjectSummary {
  id: string;
  title: string;
  title_source: string;
<<<<<<< HEAD
  progress?: { done: number; total: number };
  exam_date?: string | null;
=======
>>>>>>> origin/main
}

interface ExamQuestionnaire {
  code: string;
  title: string;
  minutes: number;
  topic_weights: Record<string, number>;
}

export interface ExamPackSummary {
  id: string;
  title: string;
  exam: string;
  source_lang: string;
  ui_lang: string;
  subjects: ExamSubjectSummary[];
}

export interface ExamSubjectDetail {
  id: string;
  title: string;
<<<<<<< HEAD
  source_lang?: string;
  ui_lang?: string;
=======
>>>>>>> origin/main
  questionnaires: ExamQuestionnaire[];
  topics: ExamTopic[];
}

<<<<<<< HEAD
export type ExamTopicStatus = "new" | "learning" | "review" | "done";

=======
>>>>>>> origin/main
export interface ExamTopic {
  id: string;
  title: string;
  title_source: string;
  weight: number;
  objectives: string[];
<<<<<<< HEAD
  status?: ExamTopicStatus;
=======
>>>>>>> origin/main
}

export interface GlossaryTerm {
  term_source: string;
  term_ui: string;
  note: string;
  topic_ids: string[];
}
