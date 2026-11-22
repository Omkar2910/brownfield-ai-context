# Prune checklist

Keep a line only if every answer is "yes".

1. Would a capable engineer NOT find this with a search or by opening the obvious file within a minute?
2. Is it true today? (the command runs, the path exists, the code follows the rule)
3. Would getting it wrong cause a real bug, a failed review or a wasted hour?
4. Is it said only once? (not repeated from the README, platform rules or another context file)
5. Is it in the narrowest place? (always-on only if it applies to most tasks; otherwise a scoped
   instruction file, a docs/context page or a skill)

Always delete:
- Directory trees and file listings
- Dependency and version lists (the build file is the source of truth). Exception: a micro-frontend
  shell's shared dependency versions, which every remote must match (see repo-types.md)
- Generic advice ("write clean code", "add tests", "follow best practices")
- Text copied from platform docs (link to it instead)

Targets: AGENTS.md about 100 lines, never over 150. At least 70% of lines should pass question 1.
