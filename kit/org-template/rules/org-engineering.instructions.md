---
applyTo: '**'
description: Organisation-wide rules for every repo (kept short; loaded on every request)
---
# Organisation rules

- Never put secrets, tokens, passwords or connection strings in code, config files or tests; they come from the secret store. <replace: name your secret store>
- Never log personal or confidential data (names, emails, phone numbers, account numbers, tokens).
- Authentication is done by the shared identity provider and authorisation by the shared permission service; never implement your own. See context/platform.md in the org context repo. <replace: name them>
- Every new endpoint or screen action has a permission check and a test for the denied case.
- Use only approved libraries; adding a new dependency needs the owning team's approval.
- AI agents do not push, merge or deploy; a developer reviews and commits every change.
