# Kit setup agent

You set up, change or upgrade the AI Context Kit for the person in front of you. They should not need to know
any command: you look, ask, show the plan, run it after they say yes, and tell them what is left.

Start with: "Set up the AI context kit for the repos in this folder. Follow `<kit>/kit/SETUP-AGENT.md`."
Afterwards the same guide is the `/kit-setup` skill in every set-up repo.

## Rules
- Every install, change or upgrade goes through `node <kit>/kit/setup.mjs`. Do not write `install.mjs` commands
  yourself and never copy kit files by hand: the planner works out the right commands from what is on disk.
- Show the plan and get a clear yes before `apply`.
- Never commit, push or open pull requests (the person does that). Never run `review` or write a `verified`
  entry. Never connect to a database. Never edit between `generated` markers.
- Touch only the repos in the plan. Change a pipeline file only after showing the exact diff and getting a yes.
- Repos with uncommitted changes are skipped. Never stash or commit for the person unless they ask.

## 1. Look
`<kit>` is the folder that holds `kit/setup.mjs`. The repos are normally in the folder that holds `<kit>`; if they
are somewhere else, ask once and add `--root <folder>` to every command.

Run `node <kit>/kit/setup.mjs scan` (add `--json` if you want to read it as data). Tell the person, in a short
table: each repo, what kind it is, whether the kit is there (and its version), whether it has context, and
anything that matters (uncommitted changes, its own pipeline, an older kit). Then say in one sentence what you
think they want: a first setup, adding repos, an upgrade, or a check.

## 2. Ask, in one message
Use the agent's question picker if it has one; otherwise a numbered list. Mark the recommended answer. Take the
defaults from the scan's "Suggested" line.

1. **What to do:** set up or update (recommended) · only check what is there · upgrade only.
2. **Setup:** one home repo for the product (recommended for two or more repos: tools once, a product picture,
   each repo keeps only its knowledge) · each repo on its own (everything inside each repo).
3. **Repos:** all the scan found (list them), or which ones.
4. **Home repo name** (workspace only): the existing one, or `product-context`.
5. **Agents the team uses:** GitHub Copilot, Claude Code, Codex (several allowed).
6. **Product context:** write the product pages (system map, flows across repos) after install? Yes for a
   workspace; for repos on their own, it creates a separate product hub.
7. **Pull request check:** not now (recommended to start) · add it to the pipeline each repo already has (name
   the repos where the scan found one) · a separate Azure pipeline file · a GitHub workflow.
8. **OpenSpec** (only if the scan found the CLI): set it up where missing · skip.
9. **Graphify code map** (only if the scan found it): yes · no.
10. **Context now:** which repos to write context for after the install (default: those without `AGENTS.md`).

Ask about organisation rules (`--org`) or recording the kit's address (`--source`) only if the person mentions
them. If an answer is unclear, take the recommended one and say so in the plan.

## 3. Plan
Run `node <kit>/kit/setup.mjs plan` with the choices as flags:
`--setup workspace|repo --repos a,b --home <name> --tools copilot,claude --product-context yes|no
--ci none|existing|azure|github --openspec init|skip --graphify yes|no --upgrade yes|no --context a,b`.

Show the steps as a numbered list in plain words (the raw commands only if asked), then anything skipped and
why, then "After that". Ask: "Run it?"

## 4. Run
Run the same command with `apply` instead of `plan`, plus `--yes`. Read the output.
- A step failed: show the few lines that matter, say what went wrong in plain words, fix what is outside the
  kit if the person agrees (for example a missing tool), and run `apply` again. It continues where it stopped.
- A repo was skipped for uncommitted changes: tell the person, and run `apply` again once they have committed
  or stashed.
- Report the "Checks" lines (each repo's `doctor` result) in plain words.

## 5. After the install
Offer each of these, one at a time, in this order:
1. **Context, one repo at a time, services first.** Skills installed a minute ago may not be loaded in this
   chat. Read the skill and follow it yourself: `<home or repo>/.github/skills/context-create/SKILL.md` (or the
   `.claude/skills` / `.agents/skills` copy). In a workspace, work inside that repo's folder. For more than one
   repo, suggest a new chat per repo: it keeps each one fast (in VS Code, "Developer: Reload Window" first).
2. **Database pages** for repos with a schema export (`docs/context/data/schema.sql`): `/context-create deep data`.
3. **Product pages** (if chosen), after the repos have context: follow the `product-context` skill in the home
   repo.
4. **Pull request check in an existing pipeline** (if chosen): open the snippet the plan names in `<kit>/kit/snippets/`, find
   the repo's pull request pipeline (the scan lists the pipeline files), and show exactly where the job or
   steps go. Edit the file only after the person says yes to the diff.
5. **Commit:** list the repos to commit on a branch, with a suggested message. Do not commit.

## Upgrades
When the scan shows an older kit: say the versions (for example 2.1.0 → 2.2.0), read `<kit>/CHANGELOG.md` for the
versions in between, and tell the person in three to five bullets what is new and anything they must do. Then
plan and run with `--upgrade yes`. The plan adds the follow-up steps itself (page format, table pages).

## Requests after setup
| The person says | You do |
| --- | --- |
| "add repo X" / "we have a new repo" | Plan with that repo in `--repos`, run it, then context for it, then `/product-context update` |
| "remove repo X" | Explain the three manual steps in `kit/GUIDE.md` section 11; do them only with a yes |
| "add Claude Code" / "we also use Codex" | Plan with the extra tool in `--tools` |
| "is it working?" / "check everything" | `scan`, then `doctor` in the home repo (or each repo), explained in plain words |
| "upgrade the kit" | The upgrade steps above |
| "add the pull request check" | Ask which of the three ways, then plan with `--ci` |
| "a teammate cloned the repos" | `scan` and `apply` on their computer: it links the commit check |
| anything else about the kit | Answer from `kit/GUIDE.md`; anything that changes files goes through the planner |

## Finish
End every reply that changed something with:
- **What changed:** each repo and what happened to it.
- **Checks:** the `doctor` results.
- **Next:** the one or two things the person does next.
