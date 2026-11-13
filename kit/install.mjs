#!/usr/bin/env node
// AI context kit installer — copies skills, the context-steward agent, hooks and the context check
// into one of your repositories. It only ADDS files: anything that already exists is left alone and
// reported. Everything it adds is ordinary files you can review and commit (or delete) with git.
//
// Usage:
//   node kit/install.mjs <path-to-your-repo> [--tool copilot|claude] [--graphify] [--dry-run] [--no-git-hook]
//
//   --tool copilot   (default) GitHub Copilot in VS Code: .github/skills, .github/agents, .github/hooks
//   --tool claude    Claude Code: .claude/skills, .claude/agents, .claude/hooks + .claude/settings.json
//   --dry-run        show what would happen, change nothing
//   --no-git-hook    do not set up the git hooks
//   --graphify       also connect Graphify (code map): MCP server config, .graphifyignore, ignore graphify-out/
//   --upgrade        also replace kit-owned files (skills, steward agent, hook script and config, git hooks,
//                    openspec/schemas/story-tdd/schema.yaml) with this kit version. Never touches AGENTS.md,
//                    instructions, docs/context, your PR template or the schema's templates.
//   --keep-schema    with OpenSpec: install the story-tdd schema but do not make it the default
//   --org <path>     copy the organisation context repo's rules/ into this repo (stamped, org-owned) and its
//                    readiness weights; --upgrade re-syncs from the path recorded in ai-kit.json
//   --create-org <path>  create an organisation context repo from kit/org-template
//
// Create a product context hub (shared repo for many micro-frontends and services):
//   node kit/install.mjs --create-hub <path-for-new-hub-folder>
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
const tool = opt('--tool') || 'copilot';
const dry = has('--dry-run');
const target = args.find((a, i) => !a.startsWith('--') && !['--tool', '--create-hub', '--create-org', '--org'].includes(args[i - 1]));
const upgrade = has('--upgrade');
const kitVersion = fs.readFileSync(path.join(kitDir, 'VERSION'), 'utf8').trim();

// --create-hub: copy the hub template into a new folder (never overwrites), then stop.
if (has('--create-hub')) {
  const hubDir = path.resolve(opt('--create-hub') || '');
  if (!opt('--create-hub')) { console.log('Usage: node kit/install.mjs --create-hub <path-for-new-hub-folder>'); process.exit(1); }
  const tplDir = path.join(kitDir, 'hub-template');
  const walkAll = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walkAll(path.join(d, e.name)) : [path.join(d, e.name)]);
  let added = 0, kept = 0;
  for (const src of walkAll(tplDir)) {
    const dest = path.join(hubDir, path.relative(tplDir, src));
    if (fs.existsSync(dest)) { kept++; continue; }
    if (!dry) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); }
    added++;
  }
  // The hub uses the same context tool for its own readiness score.
  const toolDest = path.join(hubDir, 'scripts', 'context-tools.cjs');
  if (!fs.existsSync(toolDest)) { if (!dry) fs.copyFileSync(path.join(kitDir, 'files', '.github', 'hooks', 'scripts', 'context-tools.cjs'), toolDest); added++; } else kept++;
  console.log(`Product context hub at ${hubDir}: ${added} files added, ${kept} already there.`);
  console.log('Next: edit catalog.json, run "node scripts/hub.mjs map", clone the repos next to the hub, open them');
  console.log('together with the hub in VS Code and run /hub-baseline. Then git init, commit and push to your hub repo.');
  process.exit(0);
}

// --create-org: copy the organisation context template into a new folder (never overwrites), then stop.
if (has('--create-org')) {
  const orgDir = path.resolve(opt('--create-org') || '');
  if (!opt('--create-org')) { console.log('Usage: node kit/install.mjs --create-org <path-for-new-org-context-folder>'); process.exit(1); }
  const tplDir = path.join(kitDir, 'org-template');
  const walkAll = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walkAll(path.join(d, e.name)) : [path.join(d, e.name)]);
  let added = 0, kept = 0;
  for (const src of walkAll(tplDir)) {
    const dest = path.join(orgDir, path.relative(tplDir, src));
    if (fs.existsSync(dest)) { kept++; continue; }
    if (!dry) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); }
    added++;
  }
  console.log(`Organisation context at ${orgDir}: ${added} files added, ${kept} already there.`);
  console.log('Next: replace the <replace: …> parts in rules/ and context/, set kit.json, then git init, commit and push');
  console.log('to your org context repo. Each team then runs: node kit/install.mjs <repo> --org <path-to-org-context>');
  process.exit(0);
}

if (!target || has('--help') || !['copilot', 'claude'].includes(tool)) {
  console.log('Usage: node kit/install.mjs <path-to-your-repo> [--tool copilot|claude] [--graphify] [--org <org-context>] [--upgrade] [--keep-schema] [--dry-run] [--no-git-hook]\n       node kit/install.mjs --create-hub <path-for-new-hub-folder>\n       node kit/install.mjs --create-org <path-for-new-org-context-folder>');
  process.exit(target ? 1 : 0);
}

const git = (cwd, a) => { try { return execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
const repo = git(path.resolve(target), ['rev-parse', '--show-toplevel']);
if (!repo) { console.error(`Not a git repository: ${path.resolve(target)}`); process.exit(1); }
const root = path.resolve(repo);

const created = [], skipped = [], notes = [], updated = [];
// Files the kit owns: safe to replace on --upgrade. Everything a team writes or customises is not listed.
const KIT_SKILLS = ['context-bootstrap', 'context-baseline', 'context-assess', 'context-refresh', 'context-learn', 'story-to-change', 'story-finish', 'onboard-me'];
const kitOwned = rel => /^\.(github|claude)\/skills\/([^/]+)\//.test(rel) && KIT_SKILLS.includes(rel.split('/')[2])
  || /context-steward(\.agent)?\.md$/.test(rel) || /context-tools\.cjs$/.test(rel)
  || rel === '.github/hooks/ai-context.json' || rel.startsWith('.githooks/');
const log = (s = '') => console.log(s);

// Map a kit path to its destination for the chosen tool, and adjust text if needed.
function destination(rel) {
  rel = rel.split(path.sep).join('/');
  if (tool === 'copilot') return rel;
  if (rel === '.github/hooks/ai-context.json') return null; // Claude uses .claude/settings.json instead
  if (rel === '.github/hooks/scripts/context-tools.cjs') return '.claude/hooks/context-tools.cjs';
  if (rel.startsWith('.github/skills/')) return rel.replace('.github/skills/', '.claude/skills/');
  if (rel === '.github/agents/context-steward.agent.md') return '.claude/agents/context-steward.md';
  return rel;
}
function transform(rel, text) {
  if (tool === 'copilot' || rel.endsWith('.cjs')) return text; // the context tool is the same file for both tools
  let out = text
    .split('.github/hooks/scripts/context-tools.cjs').join('.claude/hooks/context-tools.cjs')
    .split('.github/skills/').join('.claude/skills/')
    .split('.github/instructions/').join('.claude/rules/')
    .replace(/\/opsx-(propose|apply|verify|archive|explore|sync|update)\b/g, '/opsx:$1'); // Claude Code command names
  if (rel.endsWith('context-steward.agent.md')) {
    out = out.replace(/^tools: .*$/m, 'tools: Read, Grep, Glob, Edit, Write, Bash')
      .replace(/^hooks:\n  PreToolUse:\n    - type: command\n      command: (.*)$/m,
        'hooks:\n  PreToolUse:\n    - matcher: "Edit|Write|MultiEdit|NotebookEdit"\n      hooks:\n        - type: command\n          command: $1');
  }
  if (rel.endsWith('context-bootstrap/SKILL.md')) {
    out = out.replace('# Context bootstrap', '# Context bootstrap\n\n> Claude Code: write scoped rule files to `.claude/rules/<name>.md` with a `paths:` list in the\n> frontmatter instead of `.github/instructions/*.instructions.md` with `applyTo`.');
  }
  return out;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

log(`AI context kit ${kitVersion} → ${root}  (tool: ${tool}${upgrade ? ', upgrade' : ''}${dry ? ', dry run' : ''})`);
log('');

// 1. Copy files (never overwrite)
for (const src of walk(filesDir)) {
  const rel = path.relative(filesDir, src);
  const destRel = destination(rel);
  if (!destRel) continue;
  const dest = path.join(root, ...destRel.split('/'));
  let text = transform(rel, fs.readFileSync(src, 'utf8'));
  if (destRel.startsWith('.githooks/') || destRel.endsWith('.cjs')) text = text.replace(/\r\n/g, '\n'); // sh needs LF even if the kit was cloned with CRLF
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

// 2. Claude Code hook settings
if (tool === 'claude') {
  const settings = path.join(root, '.claude', 'settings.json');
  if (fs.existsSync(settings)) {
    notes.push('.claude/settings.json already exists: merge the "hooks" block from kit/optional/claude-code-settings.json into it by hand.');
  } else {
    if (!dry) { fs.mkdirSync(path.dirname(settings), { recursive: true }); fs.copyFileSync(path.join(kitDir, 'optional', 'claude-code-settings.json'), settings); }
    created.push('.claude/settings.json');
  }
}

// 2b. Graphify (optional): MCP server config, ignore file, keep the generated map out of git
if (has('--graphify')) {
  const ignoreSrc = path.join(kitDir, 'files-graphify', '.graphifyignore');
  const ignoreDest = path.join(root, '.graphifyignore');
  if (fs.existsSync(ignoreDest)) skipped.push('.graphifyignore');
  else { if (!dry) fs.copyFileSync(ignoreSrc, ignoreDest); created.push('.graphifyignore'); }

  if (tool === 'copilot') {
    const mcpDest = path.join(root, '.vscode', 'mcp.json');
    if (fs.existsSync(mcpDest)) {
      notes.push('.vscode/mcp.json already exists: add the "graphify" server from kit/files-graphify/.vscode/mcp.json to it.');
    } else {
      if (!dry) { fs.mkdirSync(path.dirname(mcpDest), { recursive: true }); fs.copyFileSync(path.join(kitDir, 'files-graphify', '.vscode', 'mcp.json'), mcpDest); }
      created.push('.vscode/mcp.json (Graphify MCP server)');
    }
  } else {
    const mcpDest = path.join(root, '.mcp.json');
    const cfg = { mcpServers: { graphify: { command: 'graphify-mcp', args: ['graphify-out/graph.json'] } } };
    if (fs.existsSync(mcpDest)) notes.push('.mcp.json already exists: add this server to it: ' + JSON.stringify(cfg.mcpServers));
    else { if (!dry) fs.writeFileSync(mcpDest, JSON.stringify(cfg, null, 2) + '\n'); created.push('.mcp.json (Graphify MCP server)'); }
  }

  const gi = path.join(root, '.gitignore');
  const current = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  if (/^\/?graphify-out\/?\s*$/m.test(current)) skipped.push('.gitignore entry graphify-out/');
  else {
    if (!dry) fs.writeFileSync(gi, current.replace(/\s*$/, current ? '\n' : '') + '\n# Graphify code map (rebuilt locally; see kit README)\ngraphify-out/\n');
    created.push('.gitignore: graphify-out/');
  }
}

// 3. OpenSpec config
const osConfig = path.join(root, 'openspec', 'config.yaml');
const snippet = fs.readFileSync(path.join(kitDir, 'snippets', 'openspec-config.yaml'), 'utf8');
if (!fs.existsSync(path.join(root, 'openspec'))) {
  notes.push(`OpenSpec is not set up in this repo (optional). Everything else works without it. To add it later: run \`openspec init --tools ${tool === 'claude' ? 'claude' : 'github-copilot'}\`, then run this installer again to add the OpenSpec settings and the story workflow.`);
} else {
  const current = fs.existsSync(osConfig) ? fs.readFileSync(osConfig, 'utf8') : '';
  const keys = ['context', 'rules', 'operations'];
  const present = keys.filter(k => new RegExp(`^${k}:`, 'm').test(current));
  if (present.length === 0) {
    if (!dry) fs.writeFileSync(osConfig, current.replace(/\s*$/, current ? '\n\n' : '') + snippet);
    created.push('openspec/config.yaml (added context, rules, operations)');
  } else {
    if (!upgrade) notes.push(`openspec/config.yaml already has: ${present.join(', ')}. Compare with kit/snippets/openspec-config.yaml and merge by hand.`);
    // Lines that kit versions before 1.4 appended and that are now known to be wrong: fix them on --upgrade.
    const oldLines = [
      ['  Read AGENTS.md and the files it lists under "Where to look" before writing any artifact.\n',
       '  Read AGENTS.md first. Open the files it lists under "Where to look" only when this change needs them.\n'],
      ['    - The last task is "Update AGENTS.md or docs/context if a command, convention, trap or contract changed"\n', ''],
    ];
    if (upgrade) {
      let cfg = current; let fixed = 0;
      for (const [o, n] of oldLines) if (cfg.includes(o)) { cfg = cfg.replace(o, n); fixed++; }
      if (fixed) { if (!dry) fs.writeFileSync(osConfig, cfg); updated.push(`openspec/config.yaml (${fixed} outdated kit line(s) corrected)`); }
    }
  }

  // 3b. Story workflow schema: technical design (TDD) + test plan + test-first tasks.
  //     schema.yaml belongs to the kit (replaced on --upgrade); templates belong to the team (never replaced).
  const schemaSrc = path.join(kitDir, 'openspec-schema', 'story-tdd');
  for (const src of walk(schemaSrc)) {
    const destRel = 'openspec/schemas/story-tdd/' + path.relative(schemaSrc, src).split(path.sep).join('/');
    const dest = path.join(root, ...destRel.split('/'));
    const text = fs.readFileSync(src, 'utf8');
    const exists = fs.existsSync(dest);
    if (exists && !(upgrade && destRel.endsWith('/schema.yaml'))) { skipped.push(destRel); continue; }
    if (exists && fs.readFileSync(dest, 'utf8') === text) { skipped.push(destRel); continue; }
    if (!dry) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, text); }
    (exists ? updated : created).push(destRel);
  }
  const cfgNow = (!dry && fs.existsSync(osConfig)) ? fs.readFileSync(osConfig, 'utf8') : current;
  const schemaLine = cfgNow.match(/^schema:\s*(\S+)\s*$/m);
  if (has('--keep-schema')) {
    notes.push('Kept your OpenSpec schema (--keep-schema). To use the story workflow later, set "schema: story-tdd" in openspec/config.yaml.');
  } else if (!schemaLine || schemaLine[1] === 'spec-driven') {
    if (!dry) fs.writeFileSync(osConfig, schemaLine ? cfgNow.replace(schemaLine[0], 'schema: story-tdd') : 'schema: story-tdd\n' + cfgNow);
    created.push('openspec/config.yaml: schema: story-tdd (new changes get design.md as a TDD, test-plan.md and test-first tasks; changes already started keep their schema)');
  } else if (schemaLine[1] !== 'story-tdd') {
    notes.push(`openspec/config.yaml uses schema "${schemaLine[1]}"; left unchanged. Set "schema: story-tdd" to use the kit's story workflow.`);
  }
}

// 4. Git pre-commit hook
if (!has('--no-git-hook')) {
  const hooksPath = git(root, ['config', '--get', 'core.hooksPath']);
  const legacyHook = path.join(root, '.git', 'hooks', 'pre-commit');
  const toolPath = tool === 'claude' ? '.claude/hooks' : '.github/hooks/scripts';
  const checkLine = `node ${toolPath}/context-tools.cjs check --staged || exit 1`;
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
  // Keep the shell hooks LF-only for everyone, including Windows clones with core.autocrlf.
  const ga = path.join(root, '.gitattributes');
  const gaText = fs.existsSync(ga) ? fs.readFileSync(ga, 'utf8') : '';
  if (!/^\.githooks\/\*.*eol=lf/m.test(gaText)) {
    if (!dry) fs.writeFileSync(ga, gaText.replace(/\s*$/, gaText ? '\n' : '') + '.githooks/* text eol=lf\n');
    created.push('.gitattributes: .githooks/* text eol=lf');
  }
}

// Version stamp, so teams can see which kit each repo runs (and which org rules it carries)
const stampRel = (tool === 'claude' ? '.claude' : '.github') + '/ai-kit.json';
const stamp = path.join(root, ...stampRel.split('/'));
let previous = null, stampObj = null;
try { stampObj = JSON.parse(fs.readFileSync(stamp, 'utf8')); previous = stampObj.version; } catch { /* first install */ }

// 5. Organisation layer: copy the org repo's rules into this repo, stamped, so they reach every agent and CI.
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
    const destBase = tool === 'claude' ? '.claude/rules/org' : '.github/instructions/org';
    const marker = '<!-- Organisation rule from ';
    const files = {};
    for (const f of fs.readdirSync(rulesDir).filter(n => n.endsWith('.md')).sort()) {
      const source = fs.readFileSync(path.join(rulesDir, f), 'utf8').replace(/\r\n/g, '\n');
      let body = source;
      if (tool === 'claude') { // Claude Code rules use paths: instead of applyTo:, and no paths means "always"
        body = body.replace(/^applyTo:\s*['"]?([^'"\n]+)['"]?\s*$/m, (m, g) => g.trim() === '**' ? '' : `paths:\n  - "${g.trim()}"`).replace(/^---\n\n/, '---\n');
      }
      const line = `${marker}${orgName} @ ${commit}. Do not edit here: change it in the org context repo, then re-sync with install.mjs --org. -->\n`;
      const fm = /^---\n[\s\S]*?\n---\n/.exec(body);
      const out = fm ? fm[0] + line + body.slice(fm[0].length) : line + body;
      const rel = `${destBase}/${f}`;
      const dest = path.join(root, ...rel.split('/'));
      const exists = fs.existsSync(dest);
      if (!exists || fs.readFileSync(dest, 'utf8') !== out) {
        if (!dry) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, out); }
        (exists ? updated : created).push(rel + ` (org rule, ${orgName} @ ${commit})`);
      } else skipped.push(rel);
      files[f] = { source: sha1(source), copy: sha1(out) };
    }
    // Rules removed from the org repo are removed here too (only files the sync wrote, recognised by the marker).
    const destDir = path.join(root, ...destBase.split('/'));
    if (fs.existsSync(destDir)) for (const f of fs.readdirSync(destDir)) {
      if (files[f] || !f.endsWith('.md')) continue;
      const p = path.join(destDir, f);
      if (fs.readFileSync(p, 'utf8').includes(marker)) { if (!dry) fs.unlinkSync(p); updated.push(`${destBase}/${f} (removed: no longer in the org repo)`); }
    }
    // The org's readiness weights, unless the repo keeps its own.
    const orgWeights = path.join(orgDir, 'context-readiness.json');
    const repoWeights = path.join(root, '.github', 'context-readiness.json');
    if (fs.existsSync(orgWeights)) {
      const w = JSON.parse(fs.readFileSync(orgWeights, 'utf8'));
      const own = fs.existsSync(repoWeights) && !JSON.parse(fs.readFileSync(repoWeights, 'utf8'))._source;
      if (own) notes.push('.github/context-readiness.json is the repo\'s own; the org weights were not copied over it.');
      else {
        const text = JSON.stringify({ _source: `${orgName} @ ${commit}`, ...w }, null, 2) + '\n';
        if (!fs.existsSync(repoWeights) || fs.readFileSync(repoWeights, 'utf8') !== text) {
          if (!dry) { fs.mkdirSync(path.dirname(repoWeights), { recursive: true }); fs.writeFileSync(repoWeights, text); }
          created.push(`.github/context-readiness.json (org readiness weights, ${orgName} @ ${commit})`);
        }
      }
    }
    orgRecord = { name: orgName, path: path.relative(root, orgDir).split(path.sep).join('/') || '.', commit, synced: new Date().toISOString().slice(0, 10), rulesDir: destBase, files };
    const orgKit = (() => { try { return JSON.parse(fs.readFileSync(path.join(orgDir, 'kit.json'), 'utf8')); } catch { return null; } })();
    if (orgKit && orgKit.kitVersion && orgKit.kitVersion !== kitVersion) notes.push(`The org asks for kit ${orgKit.kitVersion}; this kit is ${kitVersion}.`);
  }
}
const writeVersion = previous !== kitVersion && (!previous || upgrade);
const orgChanged = orgArg && orgRecord && JSON.stringify(orgRecord) !== JSON.stringify(stampObj && stampObj.org);
if ((writeVersion || orgChanged) && !dry) {
  fs.mkdirSync(path.dirname(stamp), { recursive: true });
  const next = { kit: 'brownfield-ai-context', version: writeVersion ? kitVersion : previous || kitVersion, tool, source: 'https://github.com/Omkar2910/brownfield-ai-context' };
  if (orgRecord) next.org = orgRecord;
  fs.writeFileSync(stamp, JSON.stringify(next, null, 2) + '\n');
}
if (previous && previous !== kitVersion && !upgrade) notes.push(`This repo has kit ${previous}; this is ${kitVersion}. Run again with --upgrade to update the kit's own files.`);
const recorded = dry ? null : (previous === kitVersion || !previous || upgrade) ? kitVersion : previous;

// Report
if (updated.length) { log('Updated to this kit version (if your team had edited one of these, its old version is in git history: git diff):'); updated.forEach(f => log('  ~ ' + f)); log(''); }
log('Added:');
created.length ? created.forEach(f => log('  + ' + f)) : log('  (nothing)');
if (skipped.length) { log(''); log('Already there, left unchanged:'); skipped.forEach(f => log('  = ' + f)); }
if (notes.length) { log(''); log('Please check:'); notes.forEach(n => log('  ! ' + n)); }
log('');
log(dry ? 'Dry run: nothing was changed.' : `Kit version ${recorded} recorded in ${stampRel}.`);
log('');
log('Next steps:');
if (tool === 'claude') {
  log('  1. Start Claude Code in the repo and run /hooks and /agents to confirm the hooks and context-steward are listed.');
} else {
  log('  1. Open the repo in VS Code. In Chat, run "Chat: Open Customizations" and confirm the skills,');
  log('     the context-steward agent and the hooks are listed.');
}
log('  2. In Agent mode, type /context-bootstrap and review what it writes.');
log(`  3. Run: node ${tool === 'claude' ? '.claude/hooks' : '.github/hooks/scripts'}/context-tools.cjs check`);
log('  4. Commit everything on a branch and open a pull request for review.');
log('     (Team on macOS/Linux too? After "git add", run: git update-index --chmod=+x .githooks/*');
log('      so the git hooks stay executable for everyone.)');
if (has('--graphify')) {
  log('');
  log('Graphify (code map) — build it once, locally, no API key needed:');
  log('  pip install "graphifyy[mcp]"        (or: pipx / uv tool install "graphifyy[mcp]")');
  log('  graphify extract . --code-only');
  log('  graphify cluster-only . --no-label');
  log(tool === 'claude' ? '  Then restart Claude Code; /mcp should list "graphify". The git hooks keep it fresh.'
    : '  Then reload VS Code and start the "graphify" server in the MCP view. The git hooks keep it fresh.');
}
