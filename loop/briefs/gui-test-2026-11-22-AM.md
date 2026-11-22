[GUI-TEST] DeepTutor 2026-11-22

Preview URL: UNKNOWN

Testing stopped. No preview URL was found, so Playwright and the browser were not started. No page was opened. No production URL was opened.

## Flows

| Flow | PASS or FAIL | What happened | Steps to reproduce | Expected |
| --- | --- | --- | --- | --- |
| Daily study: Learning, Exams, Continue, topic, Study, Teach it back | UNKNOWN | Not run. No preview URL. | Open the preview, then follow `fork/docs/APP_FLOW.md` daily study click-path. | A topic session starts, then teach-back returns feedback and the topic status updates. |
| Practice: subject, Mock, submit, Drill weak topics | UNKNOWN | Not run. No preview URL. | Open the preview, then follow the practice click-path. | A timed mock can be submitted, then weak topics open as a drill. |
| Plan: Exam home, Plan, create sessions, Calendar | UNKNOWN | Not run. No preview URL. | Open the preview, then follow the plan click-path. | Created sessions show on the calendar. |
| Notes: subject, Materials, PDF, print and download | UNKNOWN | Not run. No preview URL. | Open the preview, then follow the notes click-path. | A pack PDF opens with print and download. |
| Comfort: Focus toggle and Study comfort settings | UNKNOWN | Not run. No preview URL. | Open the preview, toggle Focus, then change Study comfort. | One task is on screen, and font, spacing, speed, motion, and contrast stay applied. |
| Page load, main navigation, forms, 375px width, keyboard focus | UNKNOWN | Not run. No preview URL. | Open the preview at desktop width and at 375px, tab through the main controls, and submit a form with fake data. | Pages load, navigation works, focus is visible, and the form accepts fake data. |

## Console errors

None recorded. Chromium was not started.

## Failed network requests

None recorded. No page was opened.

## UNKNOWN

- Preview URL. `docs/ENVIRONMENTS.md` is not in the repo. There is no top-level `docs/` directory. README gives a local URL, `http://127.0.0.1:3782`, and documentation sites `https://deeptutor.info/` and `https://docs.deeptutor.info/`. Those were not treated as a preview deployment and were not opened.
- Vercel or Railway preview link. No `vercel.app` or `railway.app` URL in the bodies of open pull requests #236, #233, #56, #57, #58, #59, #60, and #61. Pull request #236 had no conversation comments. The deployments API returned an empty list. `main` (`fffbe2d58925eed343ea51a03ed4acdace47e2b9`) has 0 check runs and combined status `pending` with 0 statuses. Actions workflow runs for branch `main` returned `total_count` 0. No `vercel.json` or Railway config is in the repo. `fork/docs/PRD.md` lists Railway, Vercel, or any deploy as out of scope.
- Whether any flow, form, mobile layout, or keyboard path works.
- Broken links. Not checked.
- Basic Memory. No memory tool in this session, so no prior note was read and none was written.
- Autosana. Not added. Needs Amit (browser sign-in at `https://mcp.autosana.ai/mcp`).
