#!/usr/bin/env bash
# check-context.sh — test AI-agent context like code.
#
# For each repo:
#   1. Broken anchors: every "[anchor: <path-or-glob>]" in a context file must match a file.  (error)
#   2. Size budget:   AGENTS.md longer than MAX_AGENTS_LINES lines.                           (warning)
#   3. Drift:         with --base <ref>, a context file whose anchored code changed in the diff
#                     while the context file itself did not.                                  (warning)
#
# Usage: check-context.sh [--base <git-ref>] [--strict] <repo-dir> [<repo-dir> ...]
#   --strict  treat warnings as errors (use once the team has cleaned up the noise)
# Exit code: 1 on errors (or warnings with --strict), else 0.

set -uo pipefail
shopt -s globstar nullglob extglob

MAX_AGENTS_LINES="${MAX_AGENTS_LINES:-100}"
BASE=""
STRICT=0
REPOS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --strict) STRICT=1; shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) REPOS+=("$1"); shift ;;
  esac
done

[[ ${#REPOS[@]} -eq 0 ]] && { echo "usage: $0 [--base <ref>] [--strict] <repo-dir>..."; exit 2; }

errors=0
warnings=0

context_files() {
  local r="$1"
  local f
  for f in "$r"/AGENTS.md "$r"/CLAUDE.md "$r"/.github/copilot-instructions.md \
           "$r"/.github/instructions/**/*.md "$r"/.claude/rules/**/*.md \
           "$r"/docs/context/**/*.md "$r"/context/**/*.md "$r"/.github/skills/**/SKILL.md; do
    [[ -f "$f" ]] && echo "$f"
  done
}

anchors_in() {
  grep -o '\[anchor: [^]]*\]' "$1" 2>/dev/null | sed -e 's/^\[anchor: //' -e 's/\]$//'
}

for repo in "${REPOS[@]}"; do
  repo="${repo%/}"
  echo "== $repo"
  if [[ ! -d "$repo" ]]; then
    echo "  ERROR  repo folder not found"; errors=$((errors + 1)); continue
  fi

  changed=()
  if [[ -n "$BASE" ]] && git -C "$repo" rev-parse --git-dir >/dev/null 2>&1; then
    prefix="$(git -C "$repo" rev-parse --show-prefix)"
    while IFS= read -r line; do
      [[ -n "$line" ]] && changed+=("${line#"$prefix"}")
    done < <(git -C "$repo" diff --name-only --relative "$BASE"...HEAD 2>/dev/null)
  fi

  n_files=0
  while IFS= read -r cf; do
    n_files=$((n_files + 1))
    rel_cf="${cf#"$repo"/}"
    cf_changed=0
    for c in "${changed[@]}"; do [[ "$c" == "$rel_cf" ]] && cf_changed=1; done

    while IFS= read -r anchor; do
      [[ -z "$anchor" ]] && continue
      [[ "$anchor" == *[\<\>]* ]] && continue   # template placeholder, e.g. <path or glob>
      found=0
      for m in "$repo"/$anchor; do [[ -e "$m" ]] && { found=1; break; }; done
      if [[ $found -eq 0 ]]; then
        echo "  ERROR  $rel_cf: anchor not found -> $anchor"
        errors=$((errors + 1))
        continue
      fi
      if [[ $cf_changed -eq 0 ]]; then
        for c in "${changed[@]}"; do
          # shellcheck disable=SC2053
          if [[ "$c" == $anchor ]]; then
            echo "  WARN   $rel_cf: anchored code changed ($c) but this context file did not"
            warnings=$((warnings + 1))
            break
          fi
        done
      fi
    done < <(anchors_in "$cf")
  done < <(context_files "$repo")

  if [[ -f "$repo/AGENTS.md" ]]; then
    lines=$(wc -l < "$repo/AGENTS.md")
    if (( lines > MAX_AGENTS_LINES )); then
      echo "  WARN   AGENTS.md has $lines lines (budget $MAX_AGENTS_LINES) — move detail to docs/context or skills"
      warnings=$((warnings + 1))
    fi
  else
    echo "  WARN   no AGENTS.md at repo root"
    warnings=$((warnings + 1))
  fi
  echo "  checked $n_files context file(s)"
done

echo "== result: $errors error(s), $warnings warning(s)"
if (( errors > 0 )) || (( STRICT == 1 && warnings > 0 )); then
  exit 1
fi
exit 0
