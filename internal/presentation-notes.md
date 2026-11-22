# Presentation notes (kit 2.0)

## Talk track, 12 minutes

1. **The problem (1 min).** Agents guess our conventions in old code; every developer prompts differently;
   each new AI platform rebuilds its own private, unreviewed picture of our systems.
2. **The idea (2 min).** Knowledge in the repo, reviewed like code, readable by any agent; a fixed story
   contract (spec, design, test plan); checks that do not care who wrote the code. Show the four-layer
   picture from ROADMAP.md: knowledge, checks, workflow, thin adapters.
3. **Live demo (5 min).** In this order:
   - `node .ai-kit/context-tools.cjs doctor`: what is installed, and proof the hooks ran.
   - `readiness`: the score, the caps, the three gaps.
   - `pages-for <a central class>`: "what do I need to know before changing this?"
   - A real story's change folder: design, test plan, the design reviewer's findings.
   - A pull request where the check flagged a stale line.
4. **Level 2 → 3 (2 min).** Same kit, more tools: Copilot, Claude Code, Codex today; cloud agents through the
   PR check and MCP server. We stay free to change tools because the knowledge is ours.
5. **Results and the ask (2 min).** Pilot numbers, including what did not work. The ask from the briefing.

## Demo safety

- Use the pilot repo on a branch, or the `demo-kit/` sandbox (it uses kit 1.x names: mention it).
- Have screenshots of each step in case the live chat is slow.
- Never run the schema tool against production on screen.

## Likely questions

| Question | Short answer |
| --- | --- |
| Why not just buy an autonomous platform? | We may. They still need our knowledge and our controls; this is that layer, and it works with them |
| Isn't this documentation that goes stale? | Every fact is anchored; checks flag it in the chat, at commit and in the PR; the score drops until fixed |
| How is the score not gamed? | It is capped by evidence: drafts count at most 2 of 5, only reviewed pages count more, a 5 needs a second reviewer |
| What does it cost in tokens? | Always-loaded context is kept under about 2,000 tokens; upgrades and checks use none |
| Does it work with our database? | Code first (migrations, entities, queries); a schema file via tbls adds exact structure; catalogues are linked |
| What happens when the tools change? | Only the thin adapter changes; `--upgrade` and `migrate` move repos without AI |
| Who owns it? | Today one maintainer; the ask includes a named owner and an internal repo |
