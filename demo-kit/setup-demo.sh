#!/usr/bin/env bash
# setup-demo.sh — copy the three demo repos to a working folder and make each its own git repo.
# Hooks and the context check use `git status`, so each service must be a separate repository.
#
# Usage: bash setup-demo.sh [target-dir]      (default: ~/context-demo)
# Windows: run in Git Bash.
set -euo pipefail
src="$(cd "$(dirname "$0")" && pwd)"
dest="${1:-$HOME/context-demo}"

if [ -e "$dest" ]; then
  echo "Target $dest already exists. Remove it or pass another folder." >&2
  exit 1
fi
mkdir -p "$dest"
for repo in report-service report-ui system-context; do
  cp -R "$src/$repo" "$dest/$repo"
  git -C "$dest/$repo" init -q
  git -C "$dest/$repo" add -A
  git -C "$dest/$repo" -c user.name="demo" -c user.email="demo@example.com" commit -qm "Initial demo state"
done
mkdir -p "$dest/system-context/.claude"
ln -s ../.github/skills "$dest/system-context/.claude/skills" 2>/dev/null || cp -R "$dest/system-context/.github/skills" "$dest/system-context/.claude/skills"
cp "$src/DEMO-SCRIPT.md" "$dest/"

echo "Demo repos ready in $dest"
echo "Next:"
echo "  cd $dest"
echo "  bash system-context/scripts/check-context.sh report-service report-ui system-context"
echo "  code system-context/workspaces/report-platform.code-workspace"
