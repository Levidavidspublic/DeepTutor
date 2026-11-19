interface ExamSubjectSummary {
  id: string;
  title: string;
  title_source: string;
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
  questionnaires: ExamQuestionnaire[];
  topics: ExamTopic[];
}

export interface ExamTopic {
  id: string;
  title: string;
  title_source: string;
  weight: number;
  objectives: string[];
}

export interface GlossaryTerm {
  term_source: string;
  term_ui: string;
  note: string;
  topic_ids: string[];
}
