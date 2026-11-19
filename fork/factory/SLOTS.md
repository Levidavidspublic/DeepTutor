# Factory slots - DeepTutor fork

| Role | Filled by |
|---|---|
| Doc store | this repo, `fork/docs/` (versioned in git) |
| Ticket queue | GitHub Issues on Levidavidspublic/DeepTutor, label `fork-ticket` |
| Dispatcher | kitchen supervisor on the agent VPS (systemd `deeptutor-kitchen`), later the Friday Kitchen Lead |
| Kitchen lead | Friday teammate "Kitchen Lead" (Claude Code, Opus 5.5, high) |
| Code model (kitchen) | Codex `gpt-6.2-sol`, reasoning high |
| Post-merge batch review | CodeRabbit reviews merged changes together on a roll-up PR. Merges proceed without waiting for the review. |
| Merge to main | Amit only |
| Preview / deploy | none from this fork |
| Memory log | `fork/factory/RUNLOG.md` on the docs branch + the VPS log |

Enforcement: worker worktrees get a git pre-push hook that refuses `main`; the supervisor never calls merge.
