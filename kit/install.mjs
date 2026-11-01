#!/usr/bin/env node
// AI context kit installer — copies skills, the context-steward agent, hooks and the context check
// into one of your repositories. It only ADDS files: anything that already exists is left alone and
// reported. Everything it adds is ordinary files you can review and commit (or delete) with git.
//
// Usage:
//   node kit/install.mjs <path-to-your-repo> [--tool copilot|claude] [--dry-run] [--no-git-hook]
//
//   --tool copilot   (default) GitHub Copilot in VS Code: .github/skills, .github/agents, .github/hooks
//   --tool claude    Claude Code: .claude/skills, .claude/agents, .claude/hooks + .claude/settings.json
//   --dry-run        show what would happen, change nothing
//   --no-git-hook    do not set up the git pre-commit hook
//
// Works on Windows (PowerShell or Git Bash), macOS and Linux. Needs Node 18+ and git.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const kitDir = path.dirname(fileURLToPath(import.meta.url));
const filesDir = path.join(kitDir, 'files');
const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const has = n => args.includes(n);
const tool = opt('--tool') || 'copilot';
const dry = has('--dry-run');
const target = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--tool');

if (!target || has('--help') || !['copilot', 'claude'].includes(tool)) {
  console.log('Usage: node kit/install.mjs <path-to-your-repo> [--tool copilot|claude] [--dry-run] [--no-git-hook]');
  process.exit(target ? 1 : 0);
}

const git = (cwd, a) => { try { return execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
const repo = git(path.resolve(target), ['rev-parse', '--show-toplevel']);
if (!repo) { console.error(`Not a git repository: ${path.resolve(target)}`); process.exit(1); }
const root = path.resolve(repo);

const created = [], skipped = [], notes = [];
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
  if (tool === 'copilot') return text;
  let out = text
    .split('.github/hooks/scripts/context-tools.cjs').join('.claude/hooks/context-tools.cjs')
    .split('.github/skills/').join('.claude/skills/');
  if (rel.endsWith('context-steward.agent.md')) out = out.replace(/^tools: .*$/m, 'tools: Read, Grep, Glob, Edit, Write, Bash');
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

log(`AI context kit → ${root}  (tool: ${tool}${dry ? ', dry run' : ''})`);
log('');

// 1. Copy files (never overwrite)
for (const src of walk(filesDir)) {
  const rel = path.relative(filesDir, src);
  const destRel = destination(rel);
  if (!destRel) continue;
  const dest = path.join(root, ...destRel.split('/'));
  if (fs.existsSync(dest)) { skipped.push(destRel); continue; }
  if (!dry) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const text = fs.readFileSync(src, 'utf8');
    fs.writeFileSync(dest, transform(rel, text));
    if (/\.(cjs|sh)$|pre-commit$/.test(dest)) { try { fs.chmodSync(dest, 0o755); } catch { /* Windows */ } }
  }
  created.push(destRel);
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

// 3. OpenSpec config
const osConfig = path.join(root, 'openspec', 'config.yaml');
const snippet = fs.readFileSync(path.join(kitDir, 'snippets', 'openspec-config.yaml'), 'utf8');
if (!fs.existsSync(path.join(root, 'openspec'))) {
  notes.push('OpenSpec is not set up in this repo yet. Run `openspec init --tools github-copilot` in the repo, then run this installer again to add the OpenSpec settings.');
} else {
  const current = fs.existsSync(osConfig) ? fs.readFileSync(osConfig, 'utf8') : '';
  const keys = ['context', 'rules', 'operations'];
  const present = keys.filter(k => new RegExp(`^${k}:`, 'm').test(current));
  if (present.length === 0) {
    if (!dry) fs.writeFileSync(osConfig, current.replace(/\s*$/, current ? '\n\n' : '') + snippet);
    created.push('openspec/config.yaml (added context, rules, operations)');
  } else {
    notes.push(`openspec/config.yaml already has: ${present.join(', ')}. Compare with kit/snippets/openspec-config.yaml and merge by hand.`);
  }
}

// 4. Git pre-commit hook
if (!has('--no-git-hook')) {
  const hooksPath = git(root, ['config', '--get', 'core.hooksPath']);
  const legacyHook = path.join(root, '.git', 'hooks', 'pre-commit');
  if (hooksPath && hooksPath !== '.githooks') {
    notes.push(`This repo already uses git hooks from "${hooksPath}". Add this line to its pre-commit file instead:\n      node ${tool === 'claude' ? '.claude/hooks' : '.github/hooks/scripts'}/context-tools.cjs check || exit 1`);
  } else if (!hooksPath && fs.existsSync(legacyHook)) {
    notes.push('A pre-commit hook already exists in .git/hooks. Add this line to it:\n      node .github/hooks/scripts/context-tools.cjs check || exit 1');
  } else if (!hooksPath) {
    if (!dry) git(root, ['config', 'core.hooksPath', '.githooks']);
    created.push('git config core.hooksPath .githooks (this clone only; teammates run it once too)');
  }
}

// Report
log('Added:');
created.length ? created.forEach(f => log('  + ' + f)) : log('  (nothing)');
if (skipped.length) { log(''); log('Already there, left unchanged:'); skipped.forEach(f => log('  = ' + f)); }
if (notes.length) { log(''); log('Please check:'); notes.forEach(n => log('  ! ' + n)); }
log('');
log('Next steps:');
log('  1. Open the repo in VS Code. In Chat, run "Chat: Open Customizations" and confirm the skills,');
log('     the context-steward agent and the hooks are listed.');
log('  2. In Agent mode, type /context-bootstrap and review what it writes.');
log(`  3. Run: node ${tool === 'claude' ? '.claude/hooks' : '.github/hooks/scripts'}/context-tools.cjs check`);
log('  4. Commit everything on a branch and open a pull request for review.');
