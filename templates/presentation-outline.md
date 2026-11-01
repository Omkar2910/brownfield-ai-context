# Presentation outline (10–12 minutes)

Use real files from your story wherever you can. Fill the numbers from your story log.

| # | Slide | What to say | What to show |
| --- | --- | --- | --- |
| 1 | The problem | In older services agents guess conventions and contracts. Everyone prompts differently, so results vary and reviews take longer. | One real example of an agent mistake from before |
| 2 | What we tried | Four parts: short context files, OpenSpec to agree the plan, skills and one steward agent, checks and hooks. | The four-part table from GUIDE.md |
| 3 | Why small context | Studies found long generated context files make agents slower and often less accurate. We keep AGENTS.md ~100 lines. | Your AGENTS.md: lines before and after pruning |
| 4 | The story | Story ID, what it needed, repos touched. | The story summary from context.md |
| 5 | Agree before code | The proposal and spec were reviewed by the tech lead before any code. | proposal.md and one spec scenario; the edits you made |
| 6 | Build | Agent worked through tasks in slices; I reviewed each diff. | tasks.md with ticks; one diff |
| 7 | Context stays honest | When the agent changed code a rule described, a hook told it; a refactor that broke a rule was caught at commit. | Screenshot of the hook message or the check output |
| 8 | Results | Time, corrections, review comments, tests — compared with my usual. Include what did not work. | Table from the story log |
| 9 | How to adopt | One command per repo; setup PR is small; works with any model in Copilot. | `node kit/install.mjs <repo>` and the setup PR |
| 10 | The ask | Two or three teams try it for one sprint and log the same numbers. | Link to the kit repo |

Tips
- Keep a 2–3 minute screen recording of phases 1–3 as a backup.
- If you cannot show company code, run the same flow on `demo-kit/` (made-up services).
- Be honest about limits: preview features, one story is not proof, it still needs review.
