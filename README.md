# Brownfield AI Context

Research and a working demo on how to **create, use and keep updated** the context that AI coding agents (GitHub Copilot, Claude Code) need in existing services, with OpenSpec for behaviour and change management.

The example is a UI service (Angular) and a backend service (Spring Boot) with shared platform rules (Keycloak for login, CIAM for permissions).

## Start here

| If you want to… | Open |
| --- | --- |
| Understand the whole approach visually, run the demo, or explain it to management | [`docs/index.html`](docs/index.html) — open in a browser, or via GitHub Pages if enabled |
| Read the full research write-up | [`docs/playbook.md`](docs/playbook.md) |
| Get short answers (Graphify, Spec Kit + OpenSpec, hooks, custom agent, how much context) | [`docs/faq.md`](docs/faq.md) |
| Run the demo | [`demo-kit/README.md`](demo-kit/README.md) and [`demo-kit/DEMO-SCRIPT.md`](demo-kit/DEMO-SCRIPT.md) |

## Five-minute demo, no AI tool needed

Needs Git and Node 18+ (on Windows, use Git Bash).

```bash
git clone https://github.com/Omkar2910/brownfield-ai-context.git
cd brownfield-ai-context/demo-kit
bash setup-demo.sh                 # creates ~/context-demo with three git repos
cd ~/context-demo
bash system-context/scripts/check-context.sh report-service report-ui system-context
```

Then follow Track A in `docs/index.html` to rename a class and watch the check, the agent hooks and the git hook catch the stale context.

## What is in the demo kit

- Lean `AGENTS.md`, scoped `.instructions.md` rules and `docs/context/` pages for both services
- A shared `system-context` repo: platform rules, generated contracts, all OpenSpec specs, and a prepared cross-service change (REPORT-142, Excel export)
- Team skills: `context-bootstrap`, `context-refresh`, `story-to-change`, `onboard-me`
- A `context-steward` custom agent for Copilot and Claude Code
- Agent hooks (session-start, post-edit, stop, guard) in one dependency-free Node script, wired for both tools
- `check-context.sh` (anchor and drift check), a git pre-commit hook, and Azure Pipelines templates for the PR check and an optional weekly steward run
- Golden-task template for measuring whether context helps

## Notes

- Service code in the kit is stub code, there only so context anchors resolve. Replace it with your own repos.
- OpenSpec stores/worksets and VS Code Copilot hooks are beta/preview features at the time of writing; the kit documents fallbacks.
- Research current as of October 2026. Check tool docs for changes.
