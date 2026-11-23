# How the kit creates context, compared with a generated-analysis skill

November 2026 · working note

## The other approach

A widely shared open-source skill (Bitovi's `instruction-generation`, in `bitovi/ai-enablement-prompts`)
analyses a codebase in six steps, each run by a subagent, and writes its working files to a results folder:

| Step | Writes |
| --- | --- |
| 1. Tech stack | `1-techstack.md` |
| 2. Categorise files | `2-file-categorization.json` |
| 3. Architectural domains | `3-architectural-domains.json` |
| 4. Domain deep dive | `4-domains/<domain>.md` |
| 5. Style guides | `5-style-guides/<category>.md` |
| 6. Build instructions | one combined file: `.github/copilot-instructions.md` or `CLAUDE.md` |

The skill states no size limit, no check against the code, no human review step and no way to update
part of the output.

## Side by side

| Question | Generated analysis | Kit (`/context-create`, quick and deep) |
| --- | --- | --- |
| Coverage of the code on the first run | **Strong.** Systematic: every file categorised, every domain examined, style guides per file type | Narrower on purpose. Quick mode covers commands, rules, traps and architecture; deep mode covers one dimension at a time |
| What the agent loads on every request | One large combined file | `AGENTS.md` under 150 lines; everything else on demand |
| Is each statement traceable? | No | Yes: anchors to the code, checked |
| What happens when the code changes | The file silently goes stale; the only fix is re-running everything | Anchors flag the exact lines, in the chat, at commit and in the pull request; `/context-update` fixes only those |
| Human knowledge (the "why", traps, history) | Only what the code shows | Five questions to the team; "why" only from evidence; guesses go under Unverified |
| Review and trust | Not part of the process | Draft → reviewed → independently reviewed; the readiness score is capped by it |
| Business and data meaning | From code names | Domain, data and table pages with written meaning; schema import for structure |
| Cost | One long run | Quick mode: about an hour with review; deep pages: one at a time, over days |

## What the research says

- Large generated files loaded on every request made agents slightly **less** successful and about 20%
  more expensive in a 138-repo study; short files written by developers helped a little.
- Model accuracy drops as input grows, even on simple tasks.
- The most common errors in AI-written documentation are omissions and confident but wrong explanations
  of "why".
- Stale documentation was the main failure in the strongest real-world case of deep agent docs.

All four point the same way: for **day-to-day agent work**, the kit's approach (small, reviewed, anchored,
loaded on demand) should give better results.

## Where the other approach is better, and what to take from it

- **Discovery is more thorough.** Its steps 1–5 are a good, systematic way to *look* at a codebase. The
  kit's deep mode could use the same order (stack → file categories → domains → style per file type) as
  its evidence-gathering phase, writing the findings into pages instead of one file.
- **Style guides per file type** match the kit's rule files (`applyTo` per file kind). Its step 5 output is
  a good source for them, after pruning.
- **A results folder is a fine input.** The kit already says to read earlier generated analysis as a
  source and keep only what is confirmed in today's code.

## Verdict, honestly

For a one-off overview of an unfamiliar codebase, the generated analysis is quicker and broader. For
context that agents use on every story and that must stay true, the kit's approach is better supported by
the evidence: it is smaller, traceable, reviewed and kept current.

Neither has been measured on our own code. To settle it: take three to five past stories per repo, run
each with (a) the generated file, (b) the kit's context, and (c) nothing. Compare agent corrections, files
read before the first edit, review rounds and tokens. The demo kit's "golden tasks" folder describes how.

**Recommended combination:** run the generated analysis once as discovery input, then let
`/context-create` turn it into a short `AGENTS.md`, rule files and reviewed pages. Do not load the combined
file on every request.
