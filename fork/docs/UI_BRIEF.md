# UI brief - DeepTutor fork: native exam study + accessible mode

**Verdict.** Keep DeepTutor's existing design system and components so the fork looks like one product. Add a small set of exam components and an accessibility layer that makes every study screen calm, short and listenable. No new visual language; fewer things on screen at once.

## Principles (for learners with ADHD or dyslexia, and good for everyone)
1. One clear next step per screen. A primary button, at most two secondary ones.
2. Short blocks: max ~60 words per text block before a break, cards over walls of text.
3. Listen first: a read-aloud button on every content block; speed 0.5-2x; highlights the sentence being read. (EXTRAPOLATED: sentence highlight depends on the TTS giving timings - `UNKNOWN`.)
4. Calm: no auto-playing motion, reduced-motion respected, no red-only error states.
5. Visible progress: small rings and streaks, never a wall of numbers.
6. Bilingual by design: English explanations; Hebrew source terms kept, shown as a chip with the English next to it; Hebrew blocks rendered right-to-left.

## Design-system primitives used
DeepTutor's web uses Tailwind (`web/tailwind.config.js`) and shared components in `web/components` and `web/shared`. Exact primitive names (Button, Card, Dialog, Tabs, Drawer, Tooltip) must be taken from those folders by each ticket's code-map step: `UNKNOWN` until read. No new UI library is added.

## Components (new)
| Component | Built from | Used on |
|---|---|---|
| `ExamPackCard` | Card, progress ring, Button | S2 |
| `SubjectTopicMap` | Tree/list, status pill | S3 |
| `TopicStatusPill` | Badge | S3, S2 |
| `GlossaryChip` + `GlossaryDrawer` | Badge, Drawer | S3, S4, S5 |
| `RtlBlock` | div with `dir="rtl"` + `lang="he"` | anywhere Hebrew text appears |
| `ReadAloudButton` | IconButton + existing voice/TTS service | every content block |
| `FocusModeToggle` + `FocusFrame` | Toggle, full-height frame, timer | top bar, S4-S7 |
| `StudyTimer` | small ring timer (default 20 min, EXTRAPOLATED) | FocusFrame, S7 |
| `TeachBackCard` | Card, textarea, mic button, feedback list | S5 |
| `DeckPlayer` | Card flip, keyboard arrows | S6 |
| `MockPaper` + `MockResult` | Card per question, timer, result table | S7 |
| `ExamPlanWeek` | Calendar week grid (reuse calendar feature) | S8 |
| `NotesPanel` | side panel, print/download buttons | S9 |
| `StudyComfortSettings` | form controls | S10 |

## Reading comfort settings (S10)
- Font: system default / Lexend / OpenDyslexic (self-hosted).
- Text size: 100-150%. Line height: 1.5-2.0. Letter spacing: normal / wide.
- Max line length ~70 characters on reading screens.
- Use `text-align: start` so English text aligns left and Hebrew text aligns right. Never justify text.
- Contrast: normal / high. Theme follows DeepTutor (light/dark).
- Read-aloud speed: 0.5-2x (matches the desk's voice range).

## Reference screens
- studywithmommy.com - Amit's stated look reference for the tutor (waiting list; screenshots not available: `UNKNOWN`).
- DeepTutor's own Learning screens (Books, Mastery sessions) - the base to stay consistent with.
- Omni Tutor desk pages - feature reference only, not the look.

## Accessibility acceptance (each UI ticket)
- Keyboard: every action reachable with Tab/Enter/Space; visible focus ring.
- Screen reader: buttons have labels; RTL blocks carry `lang`.
- Contrast: text meets WCAG AA (4.5:1). (EXTRAPOLATED target)
- Reduced motion: no animation when `prefers-reduced-motion` is set.
- A Playwright or vitest check per component where the repo's test setup allows.

## Open questions for Amit
1. Which dyslexia font do you prefer by default, if any?
2. Default focus timer length: 20 minutes, or your 1-hour learning blocks?
3. Should the read-aloud voice be the same one DeepTutor uses for video lessons?

## Sources
- DeepTutor v1.7.3 `web/` (tailwind config, components, learning routes). Desk voice range: omni-tutor `study/src/voice.ts`. Owner's study-format preferences (short blocks, read-aloud).
