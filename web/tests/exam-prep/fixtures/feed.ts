export const feedEndpoint = "/api/exam-packs/feed/import";

export type FeedRequest = {
  ics_text: string;
  tzid: string;
  remind: boolean;
};

const classes = [
  ["algebra", "Sample algebra class", "20270315"],
  ["geometry", "Sample geometry class", "20270316"],
  ["probability", "Sample probability class", "20270317"],
];

export const feedFileText = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//DeepTutor//Calendar Test//EN",
  ...classes.flatMap(([id, title, date]) => [
    "BEGIN:VEVENT",
    `UID:sample-${id}`,
    "DTSTAMP:20270301T120000Z",
    `SUMMARY:${title}`,
    `DTSTART:${date}T090000`,
    `DTEND:${date}T100000`,
    "END:VEVENT",
  ]),
  "END:VCALENDAR",
  "",
].join("\r\n");

export const pastedFeedText = feedFileText.replaceAll("\r\n", "\n");
