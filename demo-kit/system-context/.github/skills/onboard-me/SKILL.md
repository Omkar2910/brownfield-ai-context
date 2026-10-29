---
name: onboard-me
description: Guided onboarding tour of the Report Platform codebase and its AI context for a new team member. Use when someone says "onboard me", "I'm new", "explain this project" or "where do I start".
---

# Onboard me

Give a new joiner a 15-minute guided tour. Ask their role (dev, QA, BA) first and adjust depth.

## Tour
1. **The product in one picture:** summarise `context/system-map.md` — repos, who calls whom, auth.
2. **Platform rules they must not break:** Keycloak is login only; CIAM permissions for every action.
3. **How context is organised:** the layers (platform → AGENTS.md → scoped rules → docs/context →
   OpenSpec specs → change folders → code graph) and where each lives. Show one example of each.
4. **How we build a story:** `story-to-change` → `/opsx:explore` → `/opsx:propose` → review →
   `/opsx:apply` → PR (context updated in same PR) → `/opsx:archive`.
5. **Worked examples:** list the five most recent folders in `openspec/changes/archive/` and walk
   through one: proposal → delta spec → tasks → what changed in the code.
6. **Their first task:** suggest a small open story and offer to start `story-to-change` with them.

Finish by asking: "What did you have to ask a human about today?" Record the answers as
candidate context gaps for the tech lead.
