#!/usr/bin/env bash
# End-to-end test of the kit on throwaway repos. Needs git and Node 18+. Usage: bash tools/test-kit.sh
# Covers: fresh install per tool, all tools, 1.x upgrade + migrate, doctor, hooks (dedupe, stop, guard),
# schema-import (create, refresh, keep human text), readiness caps, ci, mcp, org sync, hub, product workspace.
set -euo pipefail
KIT="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
pass=0; fail=0
ok()   { pass=$((pass+1)); echo "  ok   $1"; }
bad()  { fail=$((fail+1)); echo "  FAIL $1"; }
has()  { if grep -q -- "$2" <<<"$1"; then ok "$3"; else bad "$3"; echo "$1" | head -20; fi; }
mkrepo() { mkdir -p "$1/src/main/java/com/ex"; git -C "$1" init -q; git -C "$1" config user.email t@e; git -C "$1" config user.name T
  echo 'class Orders{}' > "$1/src/main/java/com/ex/Orders.java"; echo '<project/>' > "$1/pom.xml"; git -C "$1" add -A; git -C "$1" commit -qm init; }
I="node $KIT/kit/install.mjs"
CT=".ai-kit/context-tools.cjs"

echo "1. Fresh install (Copilot, GitHub CI)"
mkrepo "$T/a"; out=$($I "$T/a" --ci github)
has "$out" ".github/workflows/ai-context.yml" "workflow added"
has "$(cat "$T/a/.ai-kit/kit.json")" '"copilot"' "stamp records tool"
out=$(cd "$T/a" && node $CT doctor); has "$out" "0 problem" "doctor clean"
has "$out" "No agent has called the hooks" "doctor says hooks never ran"
out=$(echo "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"s1-$$\",\"cwd\":\"$T/a\"}" | node "$T/a/$CT" session-start); has "$out" "systemMessage" "session-start shows a user message (Claude format)"
out=$(echo "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"s1-$$\",\"cwd\":\"$T/a\"}" | node "$T/a/$CT" session-start); [ -z "$out" ] && ok "duplicate hook call ignored" || bad "duplicate hook call ignored"
out=$(cd "$T/a" && node $CT doctor); has "$out" "session-start: last run" "doctor shows last hook run"

echo "2. All tools, MCP, Graphify"
mkrepo "$T/b"; $I "$T/b" --tool all --mcp --graphify >/dev/null
for p in .github/skills/story-start .claude/skills/story-start .agents/skills/story-start .agents/skills/design-review .claude/agents/design-reviewer.md .claude/settings.json .mcp.json .vscode/mcp.json; do
  [ -e "$T/b/$p" ] && ok "$p" || bad "$p"; done
grep -q "/opsx:propose" "$T/b/.claude/skills/story-start/SKILL.md" && ok "Claude command names" || bad "Claude command names"
grep -q "/opsx-propose" "$T/b/.github/skills/story-start/SKILL.md" && ok "Copilot command names" || bad "Copilot command names"

echo "3. Upgrade from 1.6.1 and migrate"
if git -C "$KIT" rev-parse -q --verify d1bfa69 >/dev/null; then
  mkdir -p "$T/old" && git -C "$KIT" archive d1bfa69 kit | tar -x -C "$T/old"
  mkrepo "$T/c"; mkdir -p "$T/c/docs/context"
  printf '# Data\n> Dimension: data · Status: reviewed · Last verified: 2026-11-01 by Asha · Independent review: no · Owner: team\n\n- orders [anchor: src/main/java/com/ex/Orders.java]\n' > "$T/c/docs/context/data.md"
  node "$T/old/kit/install.mjs" "$T/c" --tool claude >/dev/null; git -C "$T/c" add -A; git -C "$T/c" commit -qm kit16 --no-verify
  out=$($I "$T/c" 2>&1 || true); has "$out" "Run again with --upgrade" "1.x repo refuses a plain install"
  out=$($I "$T/c" --upgrade); has "$out" ".claude/skills/story-to-change" "old skills removed"
  [ -f "$T/c/.ai-kit/kit.json" ] && [ ! -f "$T/c/.claude/ai-kit.json" ] && ok "stamp moved" || bad "stamp moved"
  grep -q ".ai-kit/context-tools.cjs" "$T/c/.claude/settings.json" && ok "Claude hooks repointed" || bad "Claude hooks repointed"
  out=$(cd "$T/c" && node $CT check); has "$out" "1.x status line" "check warns about 1.x pages"
  (cd "$T/c" && node $CT migrate >/dev/null); grep -q 'human:asha' "$T/c/docs/context/data.md" && ok "migrate writes verified events" || bad "migrate"
else echo "  (skipped: kit 1.6.1 commit not in this clone)"; fi

echo "4. Hooks: post-edit, stop, guard"
mkdir -p "$T/a/docs/context"; printf -- '---\ntype: Context Page\nstatus: draft\ndimension: data\nowner: x\nverified: []\n---\n- orders [anchor: src/main/java/com/ex/Orders.java]\n' > "$T/a/docs/context/data.md"
P="{\"hook_event_name\":\"PostToolUse\",\"session_id\":\"s2-$$\",\"cwd\":\"$T/a\",\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$T/a/src/main/java/com/ex/Orders.java\"}}"
out=$(echo "$P" | node "$T/a/$CT" post-edit); has "$out" "referenced by docs/context/data.md" "post-edit names the context line"
out=$(echo "{\"hook_event_name\":\"Stop\",\"session_id\":\"s2-$$\",\"cwd\":\"$T/a\"}" | node "$T/a/$CT" stop); has "$out" '"decision":"block"' "stop blocks once"
out=$(echo "{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"s2-$$\",\"cwd\":\"$T/a\",\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"pom.xml\"}}" | node "$T/a/$CT" guard); has "$out" "deny" "guard denies code edits"

echo "5. schema-import"
mkdir -p "$T/a/docs/context/data"
cat > "$T/a/docs/context/data/schema.json" <<'EOF'
{"tables":[{"name":"public.orders","type":"BASE TABLE","columns":[{"name":"id","type":"bigint","nullable":false},{"name":"customer_id","type":"bigint","nullable":false},{"name":"report_id","type":"bigint","nullable":true}],
"constraints":[{"name":"orders_pkey","type":"PRIMARY KEY","def":"PRIMARY KEY (id)","table":"public.orders","columns":["id"]}]},{"name":"public.customers","type":"BASE TABLE","columns":[{"name":"id","type":"bigint","nullable":false}]}],
"relations":[{"table":"public.orders","columns":["customer_id"],"parent_table":"public.customers","parent_columns":["id"],"def":"FK"}]}
EOF
(cd "$T/a" && node $CT schema-import docs/context/data/schema.json >/dev/null)
f="$T/a/docs/context/data/tables/public.orders.md"; has "$(cat "$f")" "report_id" "table page lists columns"
has "$(cat "$f")" "no foreign key" "reference without a foreign key detected"
sed -i 's/<What one row represents, who writes it, who reads it. People write this part.>/One row per order./' "$f"
sed -i 's/"nullable":true}/"nullable":true},{"name":"total","type":"numeric","nullable":true}/' "$T/a/docs/context/data/schema.json"
(cd "$T/a" && node $CT schema-import docs/context/data/schema.json >/dev/null)
grep -q "One row per order." "$f" && grep -q "| total |" "$f" && ok "re-import keeps human text, refreshes columns" || bad "re-import"

echo "6. Readiness caps"
out=$(cd "$T/a" && node $CT readiness --json)
node -e 'const d=JSON.parse(process.argv[1]); const p=d.pages.find(x=>x.file.endsWith("public.orders.md")); process.exit(p && p.cap===2 ? 0 : 1)' "$out" && ok "draft table page capped at 2" || bad "draft cap"

echo "7. ci and mcp"
git -C "$T/a" add -A; git -C "$T/a" commit -qm ctx --no-verify; git -C "$T/a" branch -q base
echo 'class Orders{int x;}' > "$T/a/src/main/java/com/ex/Orders.java"; git -C "$T/a" commit -qam change --no-verify
out=$(cd "$T/a" && node $CT ci --base base); has "$out" "anchored code changed" "ci reports stale context"
has "$out" "Readiness:" "ci prints readiness"
out=$(printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"context_for_files","arguments":{"files":["src/main/java/com/ex/Orders.java"]}}}' | (cd "$T/a" && node $CT mcp))
has "$out" '"context_readiness"' "mcp lists tools"; has "$out" 'docs/context/data.md' "mcp answers context_for_files"

echo "8. Org and hub"
$I --create-org "$T/org" >/dev/null; git -C "$T/org" init -q; git -C "$T/org" add -A; git -C "$T/org" -c user.email=a@b -c user.name=a commit -qm o
$I "$T/b" --tool copilot,claude --org "$T/org" >/dev/null
[ -f "$T/b/.github/instructions/org/org-engineering.instructions.md" ] && [ -f "$T/b/.claude/rules/org/org-engineering.instructions.md" ] && ok "org rules synced for both tools" || bad "org sync"
echo "x" >> "$T/b/.claude/rules/org/org-api.instructions.md"; out=$(cd "$T/b" && node $CT check); has "$out" "Org rules edited in this repo" "edited org rule detected"
$I --create-hub "$T/hub" >/dev/null; (cd "$T/hub" && node scripts/hub.mjs map >/dev/null); has "$(cat "$T/hub/context/system-map.md")" 'generated: { by: "hub.mjs/map"' "hub map is a generated page"

echo "9. Product workspace"
mkrepo "$T/w-svc"; mkrepo "$T/w-ui"; echo '{}' > "$T/w-ui/angular.json"
$I --create-workspace "$T/w-home" --tool copilot,claude >/dev/null
git -C "$T/w-home" add -A; git -C "$T/w-home" -c user.email=a@b -c user.name=a commit -qm home --no-verify
[ -f "$T/w-home/.github/skills/product-context/SKILL.md" ] && [ -f "$T/w-home/.claude/skills/story-start/SKILL.md" ] && ok "home has all skills, per tool" || bad "home skills"
has "$(cat "$T/w-home/.ai-kit/kit.json")" '"workspace"' "home stamp says workspace"
$I "$T/w-svc" --workspace "$T/w-home" --ci azure >/dev/null; $I "$T/w-ui" --workspace "$T/w-home" >/dev/null
[ ! -d "$T/w-svc/.github/skills" ] && [ ! -f "$T/w-svc/.ai-kit/context-tools.cjs" ] && ok "member has no tool copies" || bad "member clean"
has "$(cat "$T/w-home/catalog.json")" '"mfe-remote"' "repos registered in the catalogue with a type"
has "$(cat "$T/w-home/product.code-workspace")" '../w-ui' "workspace file lists the repos"
printf -- '- gone [anchor: src/Gone.java]\n' > "$T/w-svc/AGENTS.md"; git -C "$T/w-svc" add -A
if git -C "$T/w-svc" commit -qm ctx >/dev/null 2>&1; then bad "member commit check from the home repo"; else ok "member commit check from the home repo"; fi
out=$(echo "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"w-$$\",\"cwd\":\"$T/w-home\"}" | node "$T/w-home/$CT" session-start); has "$out" "no context yet: w-ui" "home session start lists repos without context"
P="{\"hook_event_name\":\"PostToolUse\",\"session_id\":\"w2-$$\",\"cwd\":\"$T/w-home\",\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$T/w-svc/src/main/java/com/ex/Orders.java\"}}"
printf -- '- orders [anchor: src/main/java/com/ex/Orders.java]\n' >> "$T/w-svc/AGENTS.md"
out=$(echo "$P" | node "$T/w-home/$CT" post-edit); has "$out" "w-svc/AGENTS.md" "home hook names a member repo's context line"
out=$(cd "$T/w-home" && node $CT doctor); has "$out" "w-ui: no AGENTS.md yet" "home doctor lists repos"
echo "10. Upgrade from a repo-mode install into the workspace, and away from the old OpenSpec workflow"
mkrepo "$T/w-old"; $I "$T/w-old" --tool claude >/dev/null; mkdir -p "$T/w-old/openspec"; printf 'schema: story-tdd\n' > "$T/w-old/openspec/config.yaml"
out=$($I "$T/w-old" --workspace "$T/w-home"); has "$out" "Run again with --upgrade" "join without --upgrade keeps copies and says so"
$I "$T/w-old" --workspace "$T/w-home" --upgrade >/dev/null
[ ! -d "$T/w-old/.claude/skills/story-start" ] && ! grep -q context-tools "$T/w-old/.claude/settings.json" 2>/dev/null && ok "join with --upgrade removes the copies" || bad "join with --upgrade"
has "$(cat "$T/w-old/openspec/config.yaml")" "schema: spec-driven" "old story-tdd workflow switched back to OpenSpec default"

echo ""; echo "Passed: $pass, failed: $fail"; [ "$fail" -eq 0 ]
