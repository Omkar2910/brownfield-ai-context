#!/usr/bin/env bash
# End-to-end test of the kit on throwaway repos. Needs git and Node 18+. Usage: bash tools/test-kit.sh
# Covers: fresh install per tool, all tools, 1.x upgrade + migrate, doctor, hooks (dedupe, stop, guard),
# schema-import (create, refresh, keep human text, code map), readiness caps, ci, mcp, org sync, hub, product workspace,
# data checks in check, hooks and doctor, review.
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

echo "11. schema-import from a DDL dump (.sql)"
mkrepo "$T/d"; mkdir -p "$T/d/docs/context/data/tables"; cp "$KIT/tools/fixtures/pg-dump-schema.sql" "$T/d/docs/context/data/schema.sql"
printf -- '---\ntype: Context Page\nstatus: stable\ndimension: data\nowner: x\nverified:\n  - { by: "human:a", at: "2026-11-01" }\n---\n# reports\n\n## Meaning\nOne row per report.\n\n## Unverified\n- maybe\n' > "$T/d/docs/context/data/tables/reports.md"
out=$(cd "$T/d" && node "$KIT/kit/files/.ai-kit/context-tools.cjs" schema-import docs/context/data/schema.sql)
has "$out" "skipped migration-tool tables: public.flyway_schema_history" "flyway history table skipped"
f="$T/d/docs/context/data/tables/reports.md"
grep -q "One row per report." "$f" && grep -q "| customer_id | bigint | no |" "$f" && ok "existing page kept, generated section added" || bad "existing page merge"
has "$(cat "$f")" "status: DRAFT, QUEUED, DONE, FAILED" "enum values listed"
has "$(cat "$f")" "(customer_id) → public.customers (id)" "foreign key from ALTER TABLE read"
has "$(cat "$f")" "template_id" "reference without a foreign key listed"
has "$(cat "$T/d/docs/context/data/tables/reporting.report_runs.md")" "trg_touch" "trigger read"
out=$(cd "$T/d" && node "$KIT/kit/files/.ai-kit/context-tools.cjs" schema-import docs/context/data/schema.sql); has "$out" "Unchanged: 4" "second import changes nothing"
out=$(cd "$T/d" && node "$KIT/kit/files/.ai-kit/context-tools.cjs" schema-import "$KIT/tools/fixtures/dbeaver-ddl.sql" --out docs/context/dbv --dry-run); has "$out" "2 table(s)/view(s), 1 reference(s)" "DB viewer DDL export read"

echo "12. Code map, check and hooks for table pages, review"
J="$T/j"; mkdir -p "$J"; cp -r "$KIT/tools/fixtures/jpa-repo/." "$J"; git -C "$J" init -q; git -C "$J" config user.email t@e; git -C "$J" config user.name T; git -C "$J" add -A; git -C "$J" commit -qm init
TOOL="$KIT/kit/files/.ai-kit/context-tools.cjs"
out=$(cd "$J" && node "$TOOL" schema-import docs/context/data/schema.sql)
has "$out" "4 entities (3 matched to a table), 1 repository" "entities and repositories found"
has "$out" "public.orders: coupon_id" "only the unanswered reference is a question"
o="$(cat "$J/docs/context/data/tables/public.orders.md")"; c="$(cat "$J/docs/context/data/tables/public.customers.md")"
has "$o" 'Entity `Order` \[anchor: src/main/java/com/ex/orders/Order.java\]' "entity linked with an anchor"
has "$o" 'Repository `OrderRepository`' "repository linked"
has "$o" 'customer_id → public.customers (`Order.customer`)' "reference known only from code"
grep -A3 "### Look like references" <<<"$o" | grep -q customer_id && bad "code reference no longer asked about" || ok "code reference no longer asked about"
has "$o" 'status: NEW, PAID, CANCELLED (enum `OrderStatus`, stored as text)' "allowed values from a Java enum"
has "$c" 'tier: stored as a number, 0 = BRONZE' "ORDINAL enum flagged"
has "$c" 'emailAddress → email' "field named differently"
has "$o" 'maps column discount_code, which this table does not have' "entity column missing from the schema"
has "$o" 'SQL that names it: \[anchor: src/main/java/com/ex/orders/ReportService.java\]' "SQL string found"
grep -q OrderTest "$J/docs/context/data/tables/public.orders.md" && bad "test code left out" || ok "test code left out"
has "$(cat "$J/docs/context/data/tables/public.order_lines.md")" 'Entity `OrderLine` \[anchor: src/main/kotlin' "Kotlin entity"
has "$(cat "$J/docs/context/data/index.md")" '`ArchivedOrder` (table archived_orders)' "entity without a table listed"
git -C "$J" add -A; git -C "$J" commit -qm pages
python3 - "$J/src/main/java/com/ex/orders/Order.java" <<'PY'
import sys; p=sys.argv[1]; s=open(p).read()
s=s.replace('    @Column(name = "discount_code")\n    private String discount;    // the column is not in the schema export','    @Column(name = "legacy_ref")\n    private String legacyRef;')
open(p,'w').write(s)
PY
git -C "$J" add -A; out=$(cd "$J" && node "$TOOL" check --staged); has "$out" "1 table page(s) out of date" "commit check: page out of date with the code"
out=$(echo "{\"hook_event_name\":\"PostToolUse\",\"session_id\":\"j1-$$\",\"cwd\":\"$J\",\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$J/src/main/java/com/ex/orders/Order.java\"}}" | node "$TOOL" post-edit)
has "$out" "run node .ai-kit/context-tools.cjs schema-import" "post-edit: run the import, not a hand edit"
out=$(echo "{\"hook_event_name\":\"Stop\",\"session_id\":\"j1-$$\",\"cwd\":\"$J\"}" | node "$TOOL" stop)
has "$out" "RUN node .ai-kit/context-tools.cjs schema-import" "stop: asks the agent to run the import"
grep -q "ArchivedOrder" <<<"$out" && bad "stop: only problems in edited files" || ok "stop: only problems in edited files"
sed -i 's/^status: draft/status: stable/; s/^generated: .*/generated: { by: "context-tools\/schema-import", at: "2026-01-01" }/; s/^verified: \[\]/verified:\n  - { by: "human:a", at: "2026-01-02" }/' "$J/docs/context/data/tables/public.orders.md"
(cd "$J" && node "$TOOL" schema-import docs/context/data/schema.sql >/dev/null)
grep -q 'at: "2026-01-01" }' "$J/docs/context/data/tables/public.orders.md" && grep -q "legacy_ref" "$J/docs/context/data/tables/public.orders.md" && ok "code change refreshes the page, keeps the review" || bad "code change keeps the review"
sed -i 's/^    status character varying(20) NOT NULL,/    status character varying(30) NOT NULL,/' "$J/docs/context/data/schema.sql"
(cd "$J" && node "$TOOL" schema-import docs/context/data/schema.sql >/dev/null)
grep -q 'at: "2026-01-01" }' "$J/docs/context/data/tables/public.orders.md" && bad "structure change resets the review" || ok "structure change resets the review"
git -C "$J" add -A; git -C "$J" commit -qm export
printf 'alter table orders add column note text;\n' > "$J/src/main/resources/db/migration/V3__note.sql"; git -C "$J" add -A
out=$(cd "$J" && node "$TOOL" check --staged); has "$out" "Migration changed (V3__note.sql) but docs/context/data/schema.sql did not" "migration without a new export"
out=$(cd "$J" && node "$TOOL" review docs/context/data/tables --by a 2>&1 || true); has "$out" "run this in your own terminal" "review refuses without a terminal"
if command -v script >/dev/null; then
  sed -i 's/<What one row represents, who writes it, who reads it. People write this part.>/One customer./' "$J/docs/context/data/tables/public.customers.md"
  out=$(cd "$J" && script -qec "node $TOOL review docs/context/data/tables --by 'B K'" /dev/null <<< "y")
  has "$out" 'order_lines.md: "Meaning" is still the template text' "review refuses an unwritten page"
  f="$(cat "$J/docs/context/data/tables/public.customers.md")"
  has "$f" '  - { by: "human:B K", at: ' "review records the event"
  has "$f" "^status: stable" "review sets stable"
  grep -q "<Values with special meaning" <<<"$f" && bad "review removes unused template lines" || ok "review removes unused template lines"
fi
out=$(cd "$J" && node "$TOOL" doctor); has "$out" "3 table page(s), 3 linked to code" "doctor: data line"

echo "13. Version stamp records no address unless asked"
S="$T/src"; mkrepo "$S"; node "$KIT/kit/install.mjs" "$S" --tool copilot >/dev/null; [ -f "$S/.ai-kit/kit.json" ] && ok "stamp written" || bad "stamp written"
grep -q '"source"' "$S/.ai-kit/kit.json" && bad "no address by default" || ok "no address by default"
node "$KIT/kit/install.mjs" "$S" --upgrade --source "https://u:secret@git.example.com/team/ai-context-kit" >/dev/null
has "$(cat "$S/.ai-kit/kit.json")" '"source": "https://git.example.com/team/ai-context-kit"' "--source recorded without credentials"
node "$KIT/kit/install.mjs" "$S" --upgrade >/dev/null
has "$(cat "$S/.ai-kit/kit.json")" 'git.example.com/team/ai-context-kit' "--source kept on upgrade"

echo "14. Setup planner: scan, plan, apply, run again, upgrade, repos on their own"
W="$T/ws"; mkdir -p "$W"; SETUP="$KIT/kit/setup.mjs"
for n in svc-a ui-b own-c dirty-d; do mkrepo "$W/$n"; done
printf '<project/>\n' > "$W/svc-a/pom.xml"; echo '{}' > "$W/ui-b/angular.json"; printf 'trigger: [main]\n' > "$W/svc-a/azure-pipelines.yml"
for n in svc-a ui-b own-c dirty-d; do git -C "$W/$n" add -A; git -C "$W/$n" commit -qm init --no-verify --allow-empty; done
node "$KIT/kit/install.mjs" "$W/own-c" --tool copilot >/dev/null
python3 - "$W/own-c/.ai-kit/kit.json" <<'PY'
import json,sys; p=sys.argv[1]; j=json.load(open(p)); j['version']='2.1.0'; json.dump(j,open(p,'w'),indent=2)
PY
git -C "$W/own-c" add -A; git -C "$W/own-c" commit -qm kit --no-verify; echo wip > "$W/dirty-d/wip.txt"
out=$(node "$SETUP" scan --root "$W"); has "$out" "own-c .*own copy, kit 2.1.0 (older)" "scan: older own copy"
has "$out" "own pipeline: azure-pipelines.yml" "scan: finds the repo's own pipeline"
has "$out" "Suggested: --setup workspace --home product-context" "scan: suggests a workspace"
out=$(node "$SETUP" plan --root "$W" --tools copilot,claude --ci existing)
has "$out" "1. product-context: Create the home repo" "plan: creates the home repo first"
has "$out" "own-c: Move into the workspace" "plan: moves an own copy into the workspace"
has "$out" "skipped dirty-d: has uncommitted changes" "plan: skips a repo with uncommitted changes"
has "$out" "ci-step-member-azure.yml" "plan: existing pipeline gets the snippet, not a new file"
grep -q -- "--ci" <<<"$out" && bad "plan: no pipeline file unless asked" || ok "plan: no pipeline file unless asked"
out=$(node "$SETUP" apply --root "$W" --tools copilot,claude 2>&1 || true); has "$out" "Add --yes to run these steps" "apply needs --yes"
[ -d "$W/product-context" ] && bad "apply without --yes changes nothing" || ok "apply without --yes changes nothing"
out=$(node "$SETUP" apply --root "$W" --tools copilot,claude --yes 2>&1); has "$out" "product-context: Result: 0 problem(s)" "apply: doctor clean in the home repo"
[ "$(git -C "$W/svc-a" config core.hooksPath)" = "../product-context/.githooks" ] && ok "apply: commit check linked" || bad "apply: commit check linked"
[ ! -f "$W/own-c/.ai-kit/context-tools.cjs" ] && ok "apply: own copy removed" || bad "apply: own copy removed"
out=$(node "$SETUP" plan --root "$W" --tools copilot,claude); has "$out" "Nothing to install or upgrade" "run again: nothing left"
python3 - "$W/product-context/.ai-kit/kit.json" <<'PY'
import json,sys; p=sys.argv[1]; j=json.load(open(p)); j['version']='2.1.0'; json.dump(j,open(p,'w'),indent=2)
PY
git -C "$W/product-context" add -A; git -C "$W/product-context" commit -qm home --no-verify
out=$(node "$SETUP" plan --root "$W"); has "$out" "product-context: Upgrade the kit 2.1.0 → " "plan: upgrades an older home repo"
out=$(node "$SETUP" plan --root "$W" --json); has "$out" '"label": "Upgrade the kit 2.1.0' "plan --json for agents"
V="$T/solo"; mkdir -p "$V"; mkrepo "$V/one"; git -C "$V/one" add -A; git -C "$V/one" commit -qm init --no-verify --allow-empty
out=$(node "$SETUP" apply --root "$V" --setup repo --tools codex --product-context no --yes 2>&1); has "$out" "one: Install the kit for codex" "repo setup: installs in the repo"
[ -f "$V/one/.ai-kit/context-tools.cjs" ] && [ -d "$V/one/.agents/skills/kit-setup" ] && ok "repo setup: tool and /kit-setup skill" || bad "repo setup: tool and /kit-setup skill"
out=$(node "$SETUP" plan --root "$V" --setup bogus 2>&1 || true); has "$out" 'setup must be "workspace" or "repo"' "bad choices are refused"

git -C "$V/one" add -A; git -C "$V/one" commit -qm kit --no-verify; mkrepo "$V/two"; git -C "$V/two" commit -qm init --no-verify --allow-empty
out=$(node "$SETUP" scan --root "$V"); has "$out" "Suggested: --setup workspace" "second repo: suggests moving to a workspace"
out=$(node "$SETUP" plan --root "$V"); has "$out" "one: Move into the workspace" "second repo: plan moves the first repo in"
has "$out" "Product pages: /product-context in product-context" "workspace chosen: product context on by default"

echo ""; echo "Passed: $pass, failed: $fail"; [ "$fail" -eq 0 ]
