# Organisation context

The top layer of AI context: what is true for every product and repo in the organisation.
Owned by the architecture / engineering excellence group; changed only through reviewed pull requests.

| Folder / file | What it holds | How it reaches repos |
| --- | --- | --- |
| `rules/*.instructions.md` | The few rules every repo must follow (security, API, logging, AI use). Each file has an `applyTo` so it loads only for matching files. | Copied into each repo by `install.mjs <repo> --org <this folder>`, stamped with this repo's commit |
| `context/` | Org-wide reference: shared platforms (identity, authorisation, logging, cloud), API guidelines, AI usage policy. Read on demand. | Linked from the copied rules and from product hubs; not copied |
| `kit.json` | Which kit version, options and readiness weights every repo should use | Read by the installer with `--org` |
| `context-readiness.json` | The organisation's readiness weights and band names | Copied into each repo as `.ai-kit/readiness.json` |
| `products.json` | Product hubs and their repos | For people and scripts that roll the kit out |

Rules for this repo:
- Keep `rules/` small: the always-applying file (`applyTo: '**'`) under 40 lines; the rest scoped by file type.
- A rule that must always hold also gets an automated check (lint rule, architecture test, pipeline step);
  agents follow written rules only part of the time.
- Every change is reviewed by the owners in CODEOWNERS (or an Azure Repos branch policy).
- After merging, each team re-syncs: `node <kit>/kit/install.mjs <repo> --org <path-to-this-repo>`.
  `context-tools check` warns in every repo whose copy is older than this repo's local clone.
