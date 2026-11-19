export const packId = "study-demo";
export const subjectId = "math";
export const planPath = `/learning/exams/${packId}/plan`;
export const planEndpoint = `/api/exam-packs/${packId}/plan`;
export const timeZone = "America/Los_Angeles";
export const now = "2027-03-13T07:30:00Z";
export const today = "2027-03-12";
export const startOverride = "2027-03-13";
export const examOverride = "2027-03-24";

const biology = {
  id: "biology",
  title: "Biology",
  title_source: "Biology",
  exam_date: "2027-03-30",
  next_session: null,
};

export const math = {
  id: subjectId,
  title: "Math",
  title_source: "Math",
  exam_date: "2027-03-27",
  next_session: null,
};

export const packs = [
  {
    id: "other-demo",
    title: "Other demo pack",
    exam: "Demo exam",
    source_lang: "en",
    ui_lang: "en",
    subjects: [{ ...biology, id: "chemistry", title: "Chemistry", title_source: "Chemistry" }],
  },
  {
    id: packId,
    title: "Demo study pack",
    exam: "Demo exam",
    source_lang: "en",
    ui_lang: "en",
    subjects: [biology, math],
  },
];

// Each session starts at 18:00 in Los Angeles. In UTC they all land on
// the following date, including the weekend when daylight saving begins.
export const sessions = [
  {
    topic_id: "fractions",
    title: "Review fractions",
    start: "2027-03-14T02:00:00Z",
    end: "2027-03-14T02:30:00Z",
  },
  {
    topic_id: "equations",
    title: "Review linear equations",
    start: "2027-03-15T01:00:00Z",
    end: "2027-03-15T01:30:00Z",
  },
  {
    topic_id: "geometry",
    title: "Review triangles",
    start: "2027-03-21T01:00:00Z",
    end: "2027-03-21T01:30:00Z",
  },
];

export const unscheduledTopic = { topic_id: "probability", title: "Probability" };

export type PlanRequest = {
  subject_id: string;
  start: string;
  exam_date: string;
  tzid: string;
  reminders: boolean;
  mode: "preview" | "create";
};

export function planResponse(request: PlanRequest) {
  return {
    exam_date: request.exam_date,
    unscheduled_topics: [unscheduledTopic],
    sessions: sessions.map((session) => ({
      ...session,
      reminders: request.reminders ? [10] : [],
      event_id: request.mode === "create" ? `demo-${session.topic_id}` : null,
    })),
  };
}
