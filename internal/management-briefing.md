# AI Context Kit: what it does and what it is worth

Kit 2.4 · November 2026 · for management and architects. The same text is kept as a shared document for
review; this copy follows it.

## Summary

The AI Context Kit gives AI coding agents a short, reviewed memory of each of our repos, a fixed way to run a
story, and checks that flag that memory when the code changes. Published studies show the benefit is real but
modest, and only when the context is short and written or checked by people; long or AI-generated context
makes agents worse. We have not yet measured the benefit on our own code, so we propose a two-week pilot that
does.

- **The problem.** In every new chat, an agent works out our repo again from the code. It cannot find what
  is not written in the code at all: what a status value means, why something is done a certain way, which
  service relies on which event. So it repeats mistakes that reviewers then catch, story after story.
- **What the kit adds.** A short `AGENTS.md` per repo that every agent reads, scoped rule files, a few
  reviewed pages for what the code cannot show, one page per database table, and product pages for flows
  across repos. Each statement points at the code it describes. A story runs as: plan, fresh-eyes review of
  the plan, a person approves, tests first, code, review; branch and pull request names follow our convention.
- **What it does not do.** It does not make the agent a better programmer. Most agent failures in studies
  came from implementation skill, not missing knowledge; that is why the plan review and tests carry as much
  weight as the context.
- **What it costs.** No licences. Plain files in each repo, one script, two optional open-source tools.
  Setup is one sentence to the agent; writing and reviewing the context is about half a day per service (an
  estimate, to be confirmed in the pilot). A story run with the kit used about 2.6 times the tokens of one
  without it in our test.
- **What we ask.** A two-week pilot on two repos with six to ten real stories, measuring agent search effort,
  review comments, rework and repeated mistakes against similar recent stories, plus which pages agents
  actually opened. Then keep, trim or expand.

## The problem it solves

| | Without the kit | With the kit |
| --- | --- | --- |
| Start of a chat | The agent searches for build commands, structure and patterns again, with slightly different results each time | It reads `AGENTS.md` (about 100 lines): commands, top rules, traps, where to look |
| Knowledge not in the code | Not found. The agent guesses; a reviewer catches it, or nobody does | Written once by the people who know, reviewed, read when the task touches it |
| A mistake the agent made last week | Nothing stops it happening again | `/context-learn` turns the correction into one line every later chat reads |
| A story | Each developer prompts differently; code may come before anyone agrees the plan | Same steps for everyone: plan, fresh-eyes review, approval, tests first, code |
| Changes across repos | The agent sees one repo and guesses at the others | A product workspace: per-repo knowledge plus product pages anchored to each repo's code |
| Pull requests | Names vary, so metrics tools cannot tell features from fixes | Branch and title follow one convention; the checks warn when they do not |

The value is in two things: **memory between chats** and **knowledge that only lives in people's heads**.
A line that gives neither should not exist.

## When the agent uses the context

| Piece | When the agent reads it | Verdict |
| --- | --- | --- |
| `AGENTS.md` | Every chat, in every tool | Used. The most valuable piece, if it stays short and correct |
| Rule files | When the agent opens a matching file (Copilot, Claude Code) | Used, if their path patterns match the real folders |
| Known traps, area pages, table pages | `/story-start` pulls every line anchored to the files a story touches; hooks point at them after an edit | Used in stories; in a plain chat, only if the agent follows the index in `AGENTS.md` |
| Product pages (flows across repos, platform rules) | `pages-for` lists those anchored to the files a story touches | Used in stories, from 2.4 |
| In-depth pages for every area | Only through the index or anchors | Risk of being written and never read: write them when a story needed the knowledge |

`node .ai-kit/context-tools.cjs usage` shows which pages agents actually opened and which nobody did, so
unused pages can be removed.

## How the context stays current, and its limits

Every statement about code carries an anchor to the file it describes. The same small script checks it after
each agent edit, when the agent finishes, at commit (blocking only knowledge that points at a missing file),
in the optional pull request check, and for table pages against the schema export and the code.

- **Coarse.** A change anywhere in an anchored file flags every line anchored to it; someone still judges
  whether the line is true.
- **Blind spots.** Logic that moves to a file nothing points at, or behaviour that changes through config,
  data or another service, is not flagged. Only the next mistake reveals it.
- **Warnings, not enforcement.** Updating still depends on people acting on the warnings.

## How it fits with OpenSpec and Graphify

| | Answers | Lives in |
| --- | --- | --- |
| Kit context | How this code is built, the traps, why, what data means | `AGENTS.md`, rule files, `docs/context/` |
| OpenSpec change | What this one story will do, reviewed before code | `openspec/changes/<id>/` |
| OpenSpec specs | What the system does today | `openspec/specs/` |
| Graphify | Which class calls which; where a story's code is | `graphify-out/` (local) |

Use OpenSpec for normal stories (several layers, an API or data change, more than one repo), not for tiny
fixes. Behaviour belongs in specs; structure, traps and reasons in the kit's pages; product pages only link.

## What the research says

| Study | Finding |
| --- | --- |
| [Evaluating AGENTS.md](https://arxiv.org/html/2602.11988v1) (ETH Zurich, ICLR 2026) | AI-generated context files lowered success in most settings and added 20–23% cost; human-written ones helped about 4% |
| [Two-agent ablation](https://www.alphaxiv.org/abs/2607.27250) (Jul 2026, 17 tasks) | No measurable change in correctness from context files; most failures came from implementation skill |
| AuggieBench and Vercel, via [mcp.directory](https://mcp.directory/blog/claude-md-vs-agents-md-vs-skills-2026) | 100–150-line files did best; the worst did worse than none. A short "where to look" index passed every task; skills were not triggered in 56% of cases |
| [Context rot](https://research.trychroma.com/context-rot) | Models get worse as input grows |
| [Codified Context](https://arxiv.org/html/2602.20478) | Deep docs read on demand worked in a 108,000-line codebase; stale docs were the main failure |
| [TENET](https://arxiv.org/abs/2509.24148v2) | Tests as the target improved repository-level code generation by about 9.5 points |

## Early evidence from our own test

A cancel-order story on a small test product (an Angular screen and a Spring service), planned by Claude Code
with and without the kit. Four facts existed only in the kit's pages. One run each: a signal, not proof.

| Fact only the context knew | Without the kit | With the kit |
| --- | --- | --- |
| Status 7 means CANCELLED (3 means SHIPPED) | Used 3: cancelled orders would show as shipped | Used 7 |
| Only PLACED and PACKED orders can be cancelled | Asked what status 2 means | Correct |
| Billing listens for `OrderVoided` | Published `OrderCancelled`: customers would still be charged | Correct |
| Cancelling must release stock in another service | Missed | Planned, with a test |
| Run cost | 16 turns, $0.37 | 33 turns, $0.98 |

Where the code itself showed the facts, the two plans were about the same.

**A third run, with the 2.4 kit.** We removed the line in `AGENTS.md` that pointed to the flow page, to see
whether the agent still finds it. It did, and the plan again had all four facts right, with branch
`feature/5012-cancel-order-order-details` and the work item link from the convention (14 turns, $0.98). Two
findings for the pilot: the agent found the flow page by listing the home repo, not through `pages-for`, which
will not scale to a product with many pages; and it also opened three platform pages the story did not need.
The read log recorded all nine pages it opened.

## Cost, security and lock-in

No licences, no service, no network calls from the kit's scripts. The schema is exported once by a person,
structure only, never from production. People commit, push and approve pull requests. The knowledge is
Markdown in our repos, readable by any agent; removing the kit means deleting its folders and one git setting.

## The pilot

1. Two repos, one service and one UI. Lean context only: `AGENTS.md`, rule files, known traps, table pages
   for the main tables, the product flow pages the stories touch.
2. Six to ten real sprint stories through `/story-start` and `/story-finish`.
3. A log of every agent mistake, each tagged *knowledge* (context could have prevented it) or *skill* (it
   could not); each knowledge miss becomes one line via `/context-learn`.
4. Per story, compared with similar recent stories without the kit: files searched before the first edit,
   premium requests, review comments, rework rounds, repeated mistakes, time to pull request
   (`templates/story-log.md`).
5. Decide keep, trim or expand on those numbers and on `usage` (which pages were actually opened).
