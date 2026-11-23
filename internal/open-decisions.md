# Open decisions

| # | Decision | Options | Recommendation | Status |
| --- | --- | --- | --- | --- |
| 1 | Where these internal notes live | Same public repo (now) · private repo · private Claude docs | Move to a private repo before adding anything company-specific | Open: kept here for now |
| 2 | The PostgreSQL schema query (catalogue query that writes Markdown) | Add to the kit · keep it personal | Keep it out until it has been tried on a real QA database; `schema-import` with tbls covers the kit's need without it | Held: not in the repo |
| 3 | Plugin packaging (Agent Plugins, APM) | Now · later | Later: a second distribution path conflicts with copying files into repos; revisit when marketplaces are stable | Deferred |
| 4 | Autonomy policy as a file | Now · after pilot | After pilot data shows which change types agents handle well | Deferred |
| 5 | Default install includes the PR check | Opt-in `--ci` · always | Opt-in for now (pipelines differ); the template is always copied to `.ai-kit/ci/` | Decided for 2.0 |
| 6 | Unprefixed kit keys in frontmatter (`dimension`, `owner`) vs OKF's reserved `x-` prefix | Plain · `x-kit-` | Plain for readability; `migrate` renames them if OKF defines them differently | Decided for 2.0, revisit at OKF 1.0 |
| 7 | MCP server on by default | Opt-in `--mcp` · always | Opt-in: every MCP server adds tool descriptions to each request | Decided for 2.0 |
| 8 | Refresh the `demo-kit/` to 2.0 | Now · before the next demo | Before the next external demo | Open |
| 10 | Product workspace in real tools | Test before rollout · roll out as is | Test three things first: each skill shown once in VS Code with the workspace open; the home repo's hooks fire on edits in a service repo (`doctor`); OpenSpec writes the change inside the service repo | Open: not yet tried in a live editor |
| 11 | The team's own design and test-scenario format | OpenSpec custom schema · separate skill | Separate skill, run after `/opsx-propose`; OpenSpec stays default (removed the custom schema in 2.1) | Decided; skill not written yet |
| 9 | Communicate skill renames to teams that already use 1.x | Release note · pairing session | Release note with the upgrade commands from CHANGELOG.md | Open |
