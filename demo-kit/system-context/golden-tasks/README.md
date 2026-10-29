# Golden tasks — test context like code

Golden tasks are real past stories with a known-good merged diff. They answer "did this context
change (or this generator skill) make agents better or worse?" with numbers instead of opinions.

## Use them for
- Choosing between the trainer's context skill and an ad-hoc prompt (run both, compare).
- Any PR that changes AGENTS.md, scoped instructions, docs/context or a team skill.

## How to run (manual, ~30 min per variant)
1. Pick a variant: `none` (context files removed), `A` (skill output), `B` (prompt output).
2. For each task in `report-service.yaml`: check out `base_commit` in a clean worktree, apply the
   variant's context files, start a **fresh** agent session, paste `prompt` verbatim.
3. Do not help the agent. Stop at `max_minutes`.
4. Record in `results.csv`: task, variant, tests_pass (y/n), matches_expected (y/n/partial),
   agent_steps (tool calls), tokens (from the tool's usage view), minutes.

Headless option: `claude -p "<prompt>" --output-format json` reports usage per run, which makes
the comparison scriptable. Copilot users can use Copilot CLI with the same prompts.

## Decide
Keep the variant with the higher pass rate; break ties on fewer steps and tokens.
A context change that does not beat `none` on at least one measure gets reverted.
