#!/usr/bin/env node
// AI context kit installer: copies skills, agents, hooks, the context tool and the pull request check into
// one of your repositories. It only ADDS files: anything that already exists is left alone and reported
// (except the kit's own files on --upgrade). Everything it adds is ordinary files you review and commit.
//
// Usage:
//   node kit/install.mjs <path-to-your-repo> [--tool <tools>] [--graphify] [--mcp] [--ci azure|github]
//                        [--org <org-context>] [--upgrade] [--keep-schema] [--dry-run] [--no-git-hook]
//
//   --tool copilot        (default) GitHub Copilot in VS Code, Copilot CLI and the Copilot cloud agent:
//                         .github/skills, .github/agents, .github/hooks, .github/instructions
//   --tool claude         Claude Code: .claude/skills, .claude/agents, .claude/settings.json, .claude/rules
//   --tool codex          OpenAI Codex: AGENTS.md and .agents/skills (Codex reads no hook or rule files)
//   --tool copilot,claude or --tool all    several at once; each tool gets its own folders
//   --graphify            connect Graphify (code map): MCP server config, .graphifyignore, ignore graphify-out/
//   --mcp                 register the kit's own MCP server (context-tools mcp) for the chosen tools
//   --ci azure|github     add the pull request check (Azure Pipelines template is always copied to .ai-kit/ci/;
//                         github also writes .github/workflows/ai-context.yml)
//   --upgrade             replace kit-owned files with this kit version and move a 1.x layout to 2.x. Never
//                         touches AGENTS.md, rule files, docs/context, your PR template or schema templates.
//   --keep-schema         with OpenSpec: install the story-tdd schema but do not make it the default
//   --org <path>          copy the organisation context repo's rules/ into this repo (stamped, org-owned) and its
//                         readiness weights; --upgrade re-syncs from the path recorded in .ai-kit/kit.json
//   --dry-run             show what would happen, change nothing
//   --no-git-hook         do not set up the git hooks
//
//   node kit/install.mjs --create-hub <path>   create a product context hub from kit/hub-template
//   node kit/install.mjs --create-org <path>   create an organisation context repo from kit/org-template
//
// Works on Windows (PowerShell or Git Bash), macOS and Linux. Needs Node 18+ and git.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const kitDir = path.dirname(fileURLToPath(import.meta.url));
const filesDir = path.join(kitDir, 'files');
const args = process.argv.slice(2).flatMap(a => /^--[a-z-]+=/.test(a) ? a.split(/=(.*)/s).slice(0, 2) : [a]);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const has = n => args.includes(n);
const VALUE_FLAGS = ['--tool', '--create-hub', '--create-org', '--org', '--ci'];
const dry = has('--dry-run');
const target = args.find((a, i) => !a.startsWith('--') && !VALUE_FLAGS.includes(args[i - 1]));
const upgrade = has('--upgrade');
const kitVersion = fs.readFileSync(path.join(kitDir, 'VERSION'), 'utf8').trim();
const TOOL_PATH = '.ai-kit/context-tools.cjs';
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const readJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

// ------------------------------------------------------------------ --create-hub / --create-org
function copyTemplate(name, dest) {
  const tplDir = path.join(kitDir, name);
  let added = 0, kept = 0;
  for (const src of walk(tplDir)) {
    const d = path.join(dest, path.relative(tplDir, src));
    if (fs.existsSync(d)) { kept++; continue; }
    if (!dry) { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(src, d); }
    added++;
  }
  return { added, kept };
}
if (has('--create-hub')) {
  if (!opt('--create-hub')) { console.log('Usage: node kit/install.mjs --create-hub <path-for-new-hub-folder>'); process.exit(1); }
  const hubDir = path.resolve(opt('--create-hub'));
  const r = copyTemplate('hub-template', hubDir);
  const toolDest = path.join(hubDir, 'scripts', 'context-tools.cjs'); // the hub scores its own context with the same tool
  if (!fs.existsSync(toolDest)) { if (!dry) { fs.mkdirSync(path.dirname(toolDest), { recursive: true }); fs.copyFileSync(path.join(filesDir, TOOL_PATH), toolDest); } r.added++; } else r.kept++;
  console.log(`Product context hub at ${hubDir}: ${r.added} files added, ${r.kept} already there.`);
  console.log('Next: edit catalog.json, run "node scripts/hub.mjs map", clone the repos next to the hub, open them');
  console.log('together with the hub in VS Code and run /hub-context. Then git init, commit and push to your hub repo.');
  process.exit(0);
}
if (has('--create-org')) {
  if (!opt('--create-org')) { console.log('Usage: node kit/install.mjs --create-org <path-for-new-org-context-folder>'); process.exit(1); }
  const orgDir = path.resolve(opt('--create-org'));
  const r = copyTemplate('org-template', orgDir);
  console.log(`Organisation context at ${orgDir}: ${r.added} files added, ${r.kept} already there.`);
  console.log('Next: replace the <replace: …> parts in rules/ and context/, set kit.json, then git init, commit and push');
  console.log('to your org context repo. Each team then runs: node kit/install.mjs <repo> --org <path-to-org-context>');
  process.exit(0);
}

// ------------------------------------------------------------------ target repo and tools
const git = (cwd, a) => { try { return execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
const USAGE = 'Usage: node kit/install.mjs <path-to-your-repo> [--tool copilot|claude|codex|all|copilot,claude] [--graphify] [--mcp] [--ci azure|github] [--org <org-context>] [--upgrade] [--keep-schema] [--dry-run] [--no-git-hook]\n       node kit/install.mjs --create-hub <path>\n       node kit/install.mjs --create-org <path>';
if (!target || has('--help')) { console.log(USAGE); process.exit(target ? 0 : 0); }
const repo = git(path.resolve(target), ['rev-parse', '--show-toplevel']);
if (!repo) { console.error(`Not a git repository: ${path.resolve(target)}`); process.exit(1); }
const root = path.resolve(repo);

// Previous install: 2.x stamp in .ai-kit/kit.json, 1.x in .github/ai-kit.json or .claude/ai-kit.json
const OLD_STAMPS = ['.github/ai-kit.json', '.claude/ai-kit.json'];
let stampObj = readJson(path.join(root, '.ai-kit', 'kit.json')), stampFrom = '.ai-kit/kit.json';
if (!stampObj) for (const f of OLD_STAMPS) { const j = readJson(path.join(root, f)); if (j) { stampObj = j; stampFrom = f; break; } }
const previous = stampObj ? stampObj.version : null;
const previousTools = stampObj ? [].concat(stampObj.tools || stampObj.tool || []) : [];

const ALL_TOOLS = ['copilot', 'claude', 'codex'];
const toolArg = opt('--tool');
const tools = toolArg ? (toolArg === 'all' ? ALL_TOOLS : toolArg.split(',').map(s => s.trim()).filter(Boolean))
  : (upgrade && previousTools.length ? previousTools : ['copilot']);
if (!tools.length || tools.some(t => !ALL_TOOLS.includes(t))) { console.log(USAGE); process.exit(1); }
const ci = opt('--ci');
if (ci && !['azure', 'github'].includes(ci)) { console.log('--ci must be azure or github'); process.exit(1); }
const uses = t => tools.includes(t);
if (previous && previous.startsWith('1.') && !upgrade) {
  console.log(`This repo has kit ${previous} (1.x layout). Run again with --upgrade: it moves the kit's own files to the 2.x layout`);
  console.log('(.ai-kit/), renames the skills and keeps everything your team wrote. Add --dry-run first to see the changes.');
  process.exit(1);
}

const created = [], skipped = [], notes = [], updated = [], removed = [];
const log = (s = '') => console.log(s);
const write = (rel, text) => { const dest = path.join(root, ...rel.split('/')); if (!dry) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, text); } };
const rm = rel => { const p = path.join(root, ...rel.split('/')); if (!fs.existsSync(p)) return false; if (!dry) fs.rmSync(p, { recursive: true, force: true }); removed.push(rel); return true; };

// Files the kit owns: safe to replace on --upgrade. Everything a team writes or customises is not listed.
const KIT_SKILLS = ['context-create', 'context-update', 'context-assess', 'context-learn', 'story-start', 'story-finish', 'onboard-me', 'design-review'];
const OLD_SKILLS = ['context-bootstrap', 'context-baseline', 'context-refresh', 'story-to-change'];
const SKILL_DIRS = { copilot: '.github/skills', claude: '.claude/skills', codex: '.agents/skills' };
const kitOwned = rel => /^\.(github|claude|agents)\/skills\/([^/]+)\//.test(rel) && KIT_SKILLS.includes(rel.split('/')[2])
  || /(context-steward|design-reviewer)(\.agent)?\.md$/.test(rel) || rel.startsWith('.ai-kit/') && rel !== '.ai-kit/readiness.json'
  || rel === '.github/hooks/ai-context.json' || rel.startsWith('.githooks/') || rel === '.github/workflows/ai-context.yml';

// ------------------------------------------------------------------ text for each tool
function forTool(t, rel, text) {
  if (rel.endsWith('.cjs') || rel.endsWith('.yml')) return text;
  let out = text;
  if (t === 'claude') {
    out = out.replace(/\/opsx-(propose|apply|verify|archive|explore|sync|update|continue|ff|new)\b/g, '/opsx:$1') // Claude Code command names
      .replace(/openspec init --tools github-copilot --no-copilot-cloud/g, 'openspec init --tools claude');
    if (/\.agent\.md$/.test(rel)) {
      out = out.replace(/^tools: \['read', 'search', 'edit', 'execute'\]$/m, 'tools: Read, Grep, Glob, Edit, Write, Bash')
        .replace(/^tools: \['read', 'search'\]$/m, 'tools: Read, Grep, Glob')
        .replace(/^hooks:\n  PreToolUse:\n    - type: command\n      command: (.*)$/m,
          'hooks:\n  PreToolUse:\n    - matcher: "Edit|Write|MultiEdit|NotebookEdit"\n      hooks:\n        - type: command\n          command: $1');
    }
  }
  if (t === 'codex') out = out.replace(/openspec init --tools github-copilot --no-copilot-cloud/g, 'openspec init --tools codex');
  return out;
}
// Codex has no custom agents: the design reviewer becomes a skill there.
function agentAsSkill(text) {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  const desc = (/^description: (.*)$/m.exec(fm[1]) || [])[1] || '';
  return `---\nname: design-review\ndescription: ${desc} Run it in a new session, so it starts with no memory of the conversation that wrote the plan.\n---\n` + text.slice(fm[0].length);
}

// Every file to place, for every tool: [destRel, text]
const plan = [];
for (const src of walk(filesDir)) {
  const rel = path.relative(filesDir, src).split(path.sep).join('/');
  let text = fs.readFileSync(src, 'utf8');
  if (rel.startsWith('.githooks/') || rel.endsWith('.cjs')) text = text.replace(/\r\n/g, '\n'); // sh needs LF even if the kit was cloned with CRLF
  if (rel.startsWith('.github/skills/')) {
    for (const t of tools) plan.push([rel.replace('.github/skills/', SKILL_DIRS[t] + '/'), forTool(t, rel, text)]);
  } else if (rel.startsWith('.github/agents/')) {
    if (uses('copilot')) plan.push([rel, text]);
    if (uses('claude')) plan.push([rel.replace('.github/agents/', '.claude/agents/').replace('.agent.md', '.md'), forTool('claude', rel, text)]);
    if (uses('codex') && rel.endsWith('design-reviewer.agent.md')) plan.push(['.agents/skills/design-review/SKILL.md', agentAsSkill(text)]);
  } else if (rel.startsWith('.github/hooks/')) {
    if (uses('copilot')) plan.push([rel, text]);
  } else plan.push([rel, text]); // .ai-kit/, .githooks/, .azuredevops/
}
if (ci === 'github') plan.push(['.github/workflows/ai-context.yml', fs.readFileSync(path.join(filesDir, '.ai-kit', 'ci', 'github-workflow.yml'), 'utf8')]);

log(`AI context kit ${kitVersion} → ${root}  (tools: ${tools.join(', ')}${upgrade ? ', upgrade' : ''}${dry ? ', dry run' : ''})`);
log('');

// ------------------------------------------------------------------ 0. Move a 1.x layout (only with --upgrade)
if (upgrade) {
  for (const p of ['.github/hooks/scripts/context-tools.cjs', '.claude/hooks/context-tools.cjs']) rm(p);
  for (const d of Object.values(SKILL_DIRS)) for (const s of OLD_SKILLS) rm(`${d}/${s}`);
  for (const f of OLD_STAMPS) rm(f);
  const oldWeights = path.join(root, '.github', 'context-readiness.json');
  if (fs.existsSync(oldWeights) && !fs.existsSync(path.join(root, '.ai-kit', 'readiness.json'))) {
    write('.ai-kit/readiness.json', fs.readFileSync(oldWeights, 'utf8')); rm('.github/context-readiness.json');
    updated.push('.ai-kit/readiness.json (moved from .github/context-readiness.json)');
  }
  // Places a team wrote that still name 1.x paths or skills: reported, never edited.
  const mentions = [];
  const ls = git(root, ['ls-files']) || '';
  for (const f of ls.split('\n').filter(f => /(^|\/)(AGENTS\.md|CLAUDE\.md)$|^docs\/context\/.*\.md$|\.ya?ml$|^\.husky\//.test(f))) {
    let t = ''; try { t = fs.readFileSync(path.join(root, f), 'utf8'); } catch { continue; }
    if (/hooks\/scripts\/context-tools\.cjs|\.claude\/hooks\/context-tools\.cjs|\/(story-to-change|context-bootstrap|context-baseline|context-refresh)\b/.test(t)) mentions.push(f);
  }
  if (mentions.length) notes.push(`These files still mention 1.x paths or skill names (${mentions.join(', ')}). Replace: .github/hooks/scripts/context-tools.cjs → ${TOOL_PATH}, /story-to-change → /story-start, /context-bootstrap and /context-baseline → /context-create, /context-refresh → /context-update.`);
}

// ------------------------------------------------------------------ 1. Copy files (never overwrite, except kit-owned on --upgrade)
const seen = new Set();
for (const [destRel, text] of plan) {
  if (seen.has(destRel)) continue; seen.add(destRel);
  const dest = path.join(root, ...destRel.split('/'));
  const exists = fs.existsSync(dest);
  if (exists) {
    if (!(upgrade && kitOwned(destRel))) { skipped.push(destRel); continue; }
    if (fs.readFileSync(dest, 'utf8') === text) { skipped.push(destRel); continue; }
  }
  if (!dry) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, text);
    if (/\.(cjs|sh)$/.test(dest) || destRel.startsWith('.githooks/')) { try { fs.chmodSync(dest, 0o755); } catch { /* Windows */ } }
  }
  (exists ? updated : created).push(destRel);
}

// Add keys to a JSON file without touching what is there. at = top-level key, name = entry name.
function mergeJson(rel, at, name, value, label) {
  const p = path.join(root, ...rel.split('/'));
  const cur = fs.existsSync(p) ? readJson(p) : {};
  if (cur === null) { notes.push(`${rel} is not plain JSON (comments?): add "${name}" under "${at}" by hand: ${JSON.stringify(value)}`); return; }
  cur[at] = cur[at] || {};
  if (cur[at][name]) { skipped.push(`${rel}: ${label}`); return; }
  cur[at][name] = value;
  write(rel, JSON.stringify(cur, null, 2) + '\n');
  created.push(`${rel}: ${label}`);
}

// ------------------------------------------------------------------ 2. Claude Code hook settings (merged into an existing file)
if (uses('claude')) {
  const rel = '.claude/settings.json';
  const p = path.join(root, '.claude', 'settings.json');
  const kitHooks = readJson(path.join(kitDir, 'optional', 'claude-code-settings.json')).hooks;
  let text = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  if (text && /\.claude\/hooks\/context-tools\.cjs/.test(text)) { // 1.x path
    text = text.split('.claude/hooks/context-tools.cjs').join(TOOL_PATH);
    write(rel, text); updated.push(`${rel} (hook commands now use ${TOOL_PATH})`);
  }
  const cur = text === null ? {} : (() => { try { return JSON.parse(text); } catch { return null; } })();
  if (cur === null) notes.push(`${rel} is not plain JSON: merge the "hooks" block from kit/optional/claude-code-settings.json by hand.`);
  else if (JSON.stringify(cur).includes('context-tools.cjs')) skipped.push(`${rel} (kit hooks already there)`);
  else {
    cur.hooks = cur.hooks || {};
    for (const [ev, entries] of Object.entries(kitHooks)) cur.hooks[ev] = (cur.hooks[ev] || []).concat(entries);
    write(rel, JSON.stringify(cur, null, 2) + '\n');
    (text === null ? created : updated).push(`${rel} (kit hooks: SessionStart, PostToolUse, Stop)`);
  }
}

// ------------------------------------------------------------------ 2b. Graphify and the kit's MCP server
if (has('--graphify')) {
  const ignoreDest = path.join(root, '.graphifyignore');
  if (fs.existsSync(ignoreDest)) skipped.push('.graphifyignore');
  else { if (!dry) fs.copyFileSync(path.join(kitDir, 'files-graphify', '.graphifyignore'), ignoreDest); created.push('.graphifyignore'); }
  if (uses('copilot')) mergeJson('.vscode/mcp.json', 'servers', 'graphify', { type: 'stdio', command: 'graphify-mcp', args: ['${workspaceFolder}/graphify-out/graph.json'] }, 'graphify MCP server');
  if (uses('claude')) mergeJson('.mcp.json', 'mcpServers', 'graphify', { command: 'graphify-mcp', args: ['graphify-out/graph.json'] }, 'graphify MCP server');
  if (uses('codex')) notes.push('Codex: add the code map server once per machine: codex mcp add graphify -- graphify-mcp graphify-out/graph.json');
  const gi = path.join(root, '.gitignore');
  const current = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  if (/^\/?graphify-out\/?\s*$/m.test(current)) skipped.push('.gitignore entry graphify-out/');
  else { if (!dry) fs.writeFileSync(gi, current.replace(/\s*$/, current ? '\n' : '') + '\n# Graphify code map (rebuilt locally; see kit README)\ngraphify-out/\n'); created.push('.gitignore: graphify-out/'); }
}
if (has('--mcp')) {
  if (uses('copilot')) mergeJson('.vscode/mcp.json', 'servers', 'ai-context', { type: 'stdio', command: 'node', args: ['${workspaceFolder}/' + TOOL_PATH, 'mcp', '--repo', '${workspaceFolder}'] }, 'ai-context MCP server');
  if (uses('claude')) mergeJson('.mcp.json', 'mcpServers', 'ai-context', { command: 'node', args: [TOOL_PATH, 'mcp'] }, 'ai-context MCP server');
  if (uses('codex')) notes.push(`Codex: add the kit's MCP server once per machine, from the repo folder: codex mcp add ai-context -- node ${TOOL_PATH} mcp`);
  notes.push('Cloud agents (for example the Copilot cloud agent) take MCP servers from the repository settings on the hosting service, not from these files. Use the same command there: node ' + TOOL_PATH + ' mcp');
}

// ------------------------------------------------------------------ 3. OpenSpec config and the story-tdd schema
const osConfig = path.join(root, 'openspec', 'config.yaml');
const snippet = fs.readFileSync(path.join(kitDir, 'snippets', 'openspec-config.yaml'), 'utf8');
const openspecTools = tools.map(t => ({ copilot: 'github-copilot', claude: 'claude', codex: 'codex' })[t]).join(',');
if (!fs.existsSync(path.join(root, 'openspec'))) {
  notes.push(`OpenSpec is not set up in this repo (optional). Everything else works without it. To add it later: run \`openspec init --tools ${openspecTools}\`, then run this installer again to add the OpenSpec settings and the story workflow.`);
} else {
  const current = fs.existsSync(osConfig) ? fs.readFileSync(osConfig, 'utf8') : '';
  const keys = ['context', 'rules', 'operations'];
  const present = keys.filter(k => new RegExp(`^${k}:`, 'm').test(current));
  if (present.length === 0) {
    if (!dry) fs.writeFileSync(osConfig, current.replace(/\s*$/, current ? '\n\n' : '') + snippet);
    created.push('openspec/config.yaml (added context, rules, operations)');
  } else {
    if (!upgrade) notes.push(`openspec/config.yaml already has: ${present.join(', ')}. Compare with kit/snippets/openspec-config.yaml and merge by hand.`);
    // Lines earlier kit versions appended that are now wrong or tool-specific: fixed on --upgrade.
    const oldLines = [
      ['  Read AGENTS.md and the files it lists under "Where to look" before writing any artifact.\n',
       '  Read AGENTS.md first. Open the files it lists under "Where to look" only when this change needs them.\n'],
      ['    - The last task is "Update AGENTS.md or docs/context if a command, convention, trap or contract changed"\n', ''],
      ['  Follow the rules in AGENTS.md and .github/instructions/ for every file you change.\n',
       '  Follow the rules in AGENTS.md and the rule files (.github/instructions/ or .claude/rules/) for every file you change.\n'],
      ['      - Before archiving, list any context lines (AGENTS.md, .github/instructions, docs/context) this change made out of date, and update them\n',
       '      - Before archiving, list any context lines (AGENTS.md, rule files, docs/context) this change made out of date, and update them\n'],
    ];
    if (upgrade) {
      let cfg = current; let fixed = 0;
      for (const [o, n] of oldLines) if (cfg.includes(o)) { cfg = cfg.replace(o, n); fixed++; }
      if (fixed) { if (!dry) fs.writeFileSync(osConfig, cfg); updated.push(`openspec/config.yaml (${fixed} outdated kit line(s) corrected)`); }
    }
  }
  // schema.yaml belongs to the kit (replaced on --upgrade); templates belong to the team (never replaced).
  const schemaSrc = path.join(kitDir, 'openspec-schema', 'story-tdd');
  for (const src of walk(schemaSrc)) {
    const destRel = 'openspec/schemas/story-tdd/' + path.relative(schemaSrc, src).split(path.sep).join('/');
    const dest = path.join(root, ...destRel.split('/'));
    const text = fs.readFileSync(src, 'utf8');
    const exists = fs.existsSync(dest);
    if (exists && !(upgrade && destRel.endsWith('/schema.yaml'))) { skipped.push(destRel); continue; }
    if (exists && fs.readFileSync(dest, 'utf8') === text) { skipped.push(destRel); continue; }
    write(destRel, text);
    (exists ? updated : created).push(destRel);
  }
  const cfgNow = (!dry && fs.existsSync(osConfig)) ? fs.readFileSync(osConfig, 'utf8') : current;
  const schemaLine = cfgNow.match(/^schema:\s*(\S+)\s*$/m);
  if (has('--keep-schema')) notes.push('Kept your OpenSpec schema (--keep-schema). To use the story workflow later, set "schema: story-tdd" in openspec/config.yaml.');
  else if (!schemaLine || schemaLine[1] === 'spec-driven') {
    if (!dry) fs.writeFileSync(osConfig, schemaLine ? cfgNow.replace(schemaLine[0], 'schema: story-tdd') : 'schema: story-tdd\n' + cfgNow);
    created.push('openspec/config.yaml: schema: story-tdd (new changes get design.md as a TDD, test-plan.md and test-first tasks; changes already started keep their schema)');
  } else if (schemaLine[1] !== 'story-tdd') notes.push(`openspec/config.yaml uses schema "${schemaLine[1]}"; left unchanged. Set "schema: story-tdd" to use the kit's story workflow.`);
}

// ------------------------------------------------------------------ 4. Git pre-commit hook (works with every tool)
if (!has('--no-git-hook')) {
  const hooksPath = git(root, ['config', '--get', 'core.hooksPath']);
  const checkLine = `node ${TOOL_PATH} check --staged || exit 1`;
  const hookDir = hooksPath && /(^|\/)\.husky(\/_)?\/?$/.test(hooksPath) ? '.husky' : hooksPath; // Husky v9 points at the generated .husky/_
  const existing = (() => { try { return fs.readdirSync(path.join(root, '.git', 'hooks')).filter(f => !f.endsWith('.sample')); } catch { return []; } })();
  if (hooksPath && hooksPath !== '.githooks') {
    notes.push(`This repo already uses git hooks from "${hookDir}". Add this line to ${hookDir}/pre-commit:\n      ${checkLine}\n    and, to keep the Graphify code map fresh, this line to ${hookDir}/post-commit and ${hookDir}/post-merge:\n      sh .githooks/graph-refresh`);
  } else if (!hooksPath && existing.length) {
    notes.push(`This repo has its own git hooks in .git/hooks (${existing.join(', ')}), so the kit did not switch hook folders (that would turn them off). Add this line to .git/hooks/pre-commit:\n      ${checkLine}\n    and "sh .githooks/graph-refresh" to post-commit and post-merge if you use Graphify. Or copy your hooks into .githooks/ and run: git config core.hooksPath .githooks`);
  } else if (!hooksPath) {
    if (!dry) git(root, ['config', 'core.hooksPath', '.githooks']);
    created.push('git config core.hooksPath .githooks (this clone only; teammates run it once too)');
  }
  const ga = path.join(root, '.gitattributes');
  const gaText = fs.existsSync(ga) ? fs.readFileSync(ga, 'utf8') : '';
  if (!/^\.githooks\/\*.*eol=lf/m.test(gaText)) {
    if (!dry) fs.writeFileSync(ga, gaText.replace(/\s*$/, gaText ? '\n' : '') + '.githooks/* text eol=lf\n');
    created.push('.gitattributes: .githooks/* text eol=lf');
  }
}

// ------------------------------------------------------------------ 5. Organisation layer
const sha1 = s => createHash('sha1').update(s).digest('hex').slice(0, 12);
const orgArg = opt('--org') || (upgrade && stampObj && stampObj.org && stampObj.org.path ? path.resolve(root, stampObj.org.path) : null);
let orgRecord = stampObj && stampObj.org ? stampObj.org : null;
if (orgArg) {
  const orgDir = path.resolve(orgArg);
  const rulesDir = path.join(orgDir, 'rules');
  if (!fs.existsSync(rulesDir)) {
    notes.push(`--org: ${orgDir} has no rules/ folder. Create an org context repo with: node kit/install.mjs --create-org <path>`);
  } else {
    const orgName = path.basename(orgDir);
    const commit = git(orgDir, ['rev-parse', '--short', 'HEAD']) || 'uncommitted';
    const dests = [];
    if (uses('copilot') || uses('codex')) dests.push({ dir: '.github/instructions/org', claude: false });
    if (uses('claude')) dests.push({ dir: '.claude/rules/org', claude: true });
    if (uses('codex') && !uses('copilot')) notes.push('Codex reads only AGENTS.md files, not rule files: the org rules were copied to .github/instructions/org/ for the other tools and CI. Put the two or three org rules that must never be broken into AGENTS.md as well.');
    const marker = '<!-- Organisation rule from ';
    const files = {};
    for (const f of fs.readdirSync(rulesDir).filter(n => n.endsWith('.md')).sort()) {
      const source = fs.readFileSync(path.join(rulesDir, f), 'utf8').replace(/\r\n/g, '\n');
      files[f] = { source: sha1(source), copies: {} };
      for (const d of dests) {
        let body = source;
        if (d.claude) body = body.replace(/^applyTo:\s*['"]?([^'"\n]+)['"]?\s*$/m, (m, g) => g.trim() === '**' ? '' : `paths:\n  - "${g.trim()}"`).replace(/^---\n\n/, '---\n');
        const line = `${marker}${orgName} @ ${commit}. Do not edit here: change it in the org context repo, then re-sync with install.mjs --org. -->\n`;
        const fm = /^---\n[\s\S]*?\n---\n/.exec(body);
        const out = fm ? fm[0] + line + body.slice(fm[0].length) : line + body;
        const rel = `${d.dir}/${f}`;
        const dest = path.join(root, ...rel.split('/'));
        const exists = fs.existsSync(dest);
        if (!exists || fs.readFileSync(dest, 'utf8') !== out) { write(rel, out); (exists ? updated : created).push(rel + ` (org rule, ${orgName} @ ${commit})`); }
        else skipped.push(rel);
        files[f].copies[d.dir] = sha1(out);
      }
    }
    for (const d of dests) { // rules removed from the org repo are removed here too (only files the sync wrote)
      const destDir = path.join(root, ...d.dir.split('/'));
      if (fs.existsSync(destDir)) for (const f of fs.readdirSync(destDir)) {
        if (files[f] || !f.endsWith('.md')) continue;
        const p = path.join(destDir, f);
        if (fs.readFileSync(p, 'utf8').includes(marker)) { if (!dry) fs.unlinkSync(p); updated.push(`${d.dir}/${f} (removed: no longer in the org repo)`); }
      }
    }
    const orgWeights = path.join(orgDir, 'context-readiness.json');
    const repoWeightsRel = '.ai-kit/readiness.json';
    const repoWeights = path.join(root, '.ai-kit', 'readiness.json');
    if (fs.existsSync(orgWeights)) {
      const w = JSON.parse(fs.readFileSync(orgWeights, 'utf8'));
      const own = fs.existsSync(repoWeights) && !(readJson(repoWeights) || {})._source;
      if (own) notes.push(`${repoWeightsRel} is the repo's own; the org weights were not copied over it.`);
      else {
        const text = JSON.stringify({ _source: `${orgName} @ ${commit}`, ...w }, null, 2) + '\n';
        if (!fs.existsSync(repoWeights) || fs.readFileSync(repoWeights, 'utf8') !== text) { write(repoWeightsRel, text); created.push(`${repoWeightsRel} (org readiness weights, ${orgName} @ ${commit})`); }
      }
    }
    orgRecord = { name: orgName, path: path.relative(root, orgDir).split(path.sep).join('/') || '.', commit, synced: new Date().toISOString().slice(0, 10), rulesDirs: dests.map(d => d.dir), files };
    const orgKit = readJson(path.join(orgDir, 'kit.json'));
    if (orgKit && orgKit.kitVersion && orgKit.kitVersion !== kitVersion) notes.push(`The org asks for kit ${orgKit.kitVersion}; this kit is ${kitVersion}.`);
  }
}

// ------------------------------------------------------------------ 6. Version stamp (.ai-kit/kit.json)
const writeVersion = !previous || upgrade || previous === kitVersion;
const toolsChanged = JSON.stringify([...new Set([...previousTools, ...tools])].sort()) !== JSON.stringify([...previousTools].sort());
const orgChanged = orgArg && orgRecord && JSON.stringify(orgRecord) !== JSON.stringify(stampObj && stampObj.org);
if ((writeVersion && (previous !== kitVersion || stampFrom !== '.ai-kit/kit.json')) || toolsChanged || orgChanged) {
  const next = { kit: 'brownfield-ai-context', version: writeVersion ? kitVersion : previous, tools: [...new Set([...previousTools, ...tools])], source: 'https://github.com/Omkar2910/brownfield-ai-context' };
  if (orgRecord) next.org = orgRecord;
  write('.ai-kit/kit.json', JSON.stringify(next, null, 2) + '\n');
}
if (previous && previous !== kitVersion && !upgrade) notes.push(`This repo has kit ${previous}; this is ${kitVersion}. Run again with --upgrade to update the kit's own files${previous.startsWith('1.') ? ' and move to the 2.x layout' : ''}.`);
if (upgrade && previous && previous.startsWith('1.')) notes.push(`Moved from kit ${previous}. Run "node ${TOOL_PATH} migrate" to convert your context pages to the 2.x page format (no AI needed), then "node ${TOOL_PATH} doctor".`);
if (uses('copilot') && uses('claude')) notes.push('Set up for Copilot and Claude Code: VS Code\'s Copilot harness also reads .claude/settings.json, so each hook event can arrive twice; the context tool ignores the second call. The older "Local" agent harness also lists the .claude/skills copies next to .github/skills.');

// ------------------------------------------------------------------ report
if (removed.length) { log('Removed (kit 1.x files replaced by this version):'); removed.forEach(f => log('  - ' + f)); log(''); }
if (updated.length) { log('Updated to this kit version (if your team had edited one of these, its old version is in git history: git diff):'); updated.forEach(f => log('  ~ ' + f)); log(''); }
log('Added:');
created.length ? created.forEach(f => log('  + ' + f)) : log('  (nothing)');
if (skipped.length) { log(''); log(`Already there, left unchanged: ${skipped.length} file(s)${skipped.length <= 12 ? ': ' + skipped.join(', ') : ''}`); }
if (notes.length) { log(''); log('Please check:'); notes.forEach(n => log('  ! ' + n)); }
log('');
log(dry ? 'Dry run: nothing was changed.' : `Kit ${kitVersion} recorded in .ai-kit/kit.json.`);
log('');
log('Next steps:');
log(`  1. Run: node ${TOOL_PATH} doctor        (checks hooks, git hook, skills and CI are wired up)`);
if (uses('copilot')) log('  2. VS Code: in Chat, run "Chat: Open Customizations" and confirm the skills, agents and hooks are listed.');
if (uses('claude')) log('  2. Claude Code: run /hooks and /agents in the repo to confirm the hooks, context-steward and design-reviewer.');
if (uses('codex')) log('  2. Codex: run /skills in the repo to confirm the kit skills are listed.');
log('  3. In agent mode, type /context-create and review what it writes. Every kit skill ends with');
log('     "What changed · Checks · Next", so you can see what it did without relying on hooks.');
log(`  4. Pull request check: ${ci === 'github' ? '.github/workflows/ai-context.yml was added; make it a required check later.' : 'create a pipeline from .ai-kit/ci/azure-pipelines.yml and add it as build validation (or use --ci github).'}`);
log('  5. Commit everything on a branch and open a pull request for review.');
log('     (Team on macOS/Linux too? After "git add", run: git update-index --chmod=+x .githooks/* .ai-kit/context-tools.cjs)');
if (has('--graphify')) {
  log('');
  log('Graphify (code map): build it once, locally, no API key needed:');
  log('  pip install "graphifyy[mcp]"        (or: pipx / uv tool install "graphifyy[mcp]")');
  log('  graphify extract . --code-only');
  log('  graphify cluster-only . --no-label');
  log('  Then reload the editor (VS Code: start the "graphify" server in the MCP view; Claude Code: /mcp). The git hooks keep it fresh.');
}
