# Prune checklist — keep a line only if every answer is "yes"

1. Would a capable engineer NOT find this by grep or reading the obvious file within a minute?
2. Is it true today? (command runs, path exists, rule matches the code)
3. Would getting it wrong cause a real bug, failed review or wasted hour?
4. Is it stated once? (not repeated from README, platform rules or another context file)
5. Is it in the narrowest place? (always-on only if it applies to most tasks; otherwise a scoped
   instruction, a docs/context page or a skill)

Always delete:
- Directory trees and file listings
- Dependency/version lists (the build file is the source)
- Generic advice ("write clean code", "add tests")
- Anything copied from platform docs — link instead

Targets: AGENTS.md under 100 lines; non-obvious ratio above 70%.
