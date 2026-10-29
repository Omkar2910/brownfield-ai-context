#!/usr/bin/env node
/*
 * context-hooks.cjs — deterministic context-freshness hooks for coding agents.
 *
 * One script, four subcommands, two output formats (Claude Code and GitHub Copilot):
 *
 *   session-start  Tell the agent, in <= 6 lines, how healthy the repo's context is
 *                  and which OpenSpec changes are active.            (SessionStart / sessionStart)
 *   post-edit      After the agent edits a file that a context line is anchored to,
 *                  remind it which line may now be wrong.            (PostToolUse / postToolUse)
 *   stop           Before the agent finishes, check the working tree: broken anchors or
 *                  anchored code changed without its context file. Block ONCE with the
 *                  list, then let it stop.                           (Stop / agentStop)
 *   guard          Deny edits outside context paths. Use only for the context-steward
 *                  agent's headless runs.                            (PreToolUse / preToolUse)
 *
 * Usage:  node context-hooks.cjs <subcommand> [--format claude|copilot] [--repo <dir>]
 *         (format is auto-detected from the input when omitted)
 * Input:  hook event JSON on stdin.  Output: one JSON object on stdout (or nothing).
 * No dependencies beyond Node 18+ and git. Never throws: on any internal error it exits 0
 * silently so a broken hook can never block normal work.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const sub = args[0];
// Output format: explicit --format wins; otherwise detect from the input shape
// (Claude Code sends snake_case `hook_event_name`, Copilot sends camelCase fields).
let fmt = valueOf('--format') || 'auto';

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

// ---------- context model ----------
const CONTEXT_GLOBS = [
  'AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md',
  '.github/instructions/**/*.md', '.claude/rules/**/*.md',
  'docs/context/**/*.md', 'context/**/*.md',
];
const MAX_AGENTS_LINES = Number(process.env.MAX_AGENTS_LINES || 100);

function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') i++; }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      re += '(' + glob.slice(i + 1, end).split(',').map(escapeRe).join('|') + ')';
      i = end;
    } else re += escapeRe(c);
  }
  return new RegExp('^' + re + '$');
}
function escapeRe(s) { return s.replace(/[.+^$()|[\]\\]/g, '\\$&'); }
function toPosix(p) { return p.split(path.sep).join('/'); }

function walk(dir, root, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === '.git' || e.name === 'node_modules' || e.name === 'target' || e.name === 'dist') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, root, out);
    else out.push(toPosix(path.relative(root, full)));
  }
  return out;
}

function loadContext(repo) {
  const files = walk(repo, repo);
  const ctxRes = CONTEXT_GLOBS.map(globToRegex);
  const contextFiles = files.filter(f => ctxRes.some(r => r.test(f)));
  const anchors = [];
  for (const cf of contextFiles) {
    const lines = fs.readFileSync(path.join(repo, cf), 'utf8').split(/\r?\n/);
    lines.forEach((line, idx) => {
      for (const m of line.matchAll(/\[anchor: ([^\]]+)\]/g)) {
        const pattern = m[1].trim();
        if (/[<>]/.test(pattern)) continue; // template placeholder
        anchors.push({ file: cf, line: idx + 1, text: line.trim().slice(0, 140), pattern, re: globToRegex(pattern) });
      }
    });
  }
  return { files, contextFiles, anchors };
}

function git(repo, gitArgs) {
  try { return execFileSync('git', ['-C', repo, ...gitArgs], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { return ''; }
}

function changedFiles(repo) {
  // Uncommitted changes (staged, unstaged, untracked) relative to HEAD, repo-root relative.
  const prefix = git(repo, ['rev-parse', '--show-prefix']).trim();
  return git(repo, ['status', '--porcelain', '--untracked-files=all'])
    .split('\n').filter(Boolean)
    .map(l => l.slice(3).split(' -> ').pop().replace(/^"|"$/g, ''))
    .map(p => (prefix && p.startsWith(prefix) ? p.slice(prefix.length) : p));
}

function findings(repo) {
  const ctx = loadContext(repo);
  const changed = changedFiles(repo);
  const broken = ctx.anchors.filter(a => !ctx.files.some(f => a.re.test(f)));
  const stale = [];
  for (const a of ctx.anchors) {
    if (changed.includes(a.file)) continue;
    const hit = changed.find(c => a.re.test(c));
    if (hit && !stale.some(s => s.file === a.file && s.line === a.line)) stale.push({ ...a, hit });
  }
  let agentsLines = 0;
  try { agentsLines = fs.readFileSync(path.join(repo, 'AGENTS.md'), 'utf8').split(/\r?\n/).length; } catch { /* none */ }
  return { ctx, changed, broken, stale, agentsLines };
}

// ---------- io ----------
function readStdin() {
  try { const raw = fs.readFileSync(0, 'utf8'); return raw.trim() ? JSON.parse(raw) : {}; }
  catch { return {}; }
}
function repoRoot(input) {
  const start = valueOf('--repo') || process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const top = git(start, ['rev-parse', '--show-toplevel']).trim();
  return top || start;
}
function emit(obj) { process.stdout.write(JSON.stringify(obj)); }

function addContext(event, text) {
  if (fmt === 'copilot') emit({ additionalContext: text });
  else emit({ hookSpecificOutput: { hookEventName: event, additionalContext: text } });
}

function editedPaths(input) {
  const out = [];
  const take = o => {
    if (!o || typeof o !== 'object') return;
    for (const k of ['file_path', 'filePath', 'path', 'notebook_path', 'filename']) if (typeof o[k] === 'string') out.push(o[k]);
    if (Array.isArray(o.edits)) o.edits.forEach(take);
    if (Array.isArray(o.files)) o.files.forEach(f => (typeof f === 'string' ? out.push(f) : take(f)));
  };
  take(input.tool_input);
  let ta = input.toolArgs;
  if (typeof ta === 'string') { try { ta = JSON.parse(ta); } catch { ta = null; } }
  take(ta);
  return out;
}

const EDIT_TOOL = /^(Edit|Write|MultiEdit|NotebookEdit|edit|create|write|apply_patch|replace_string_in_file|create_file|insert_edit_into_file|editFiles|str_replace.*)$/i;

// ---------- subcommands ----------
function sessionStart(input) {
  const repo = repoRoot(input);
  const f = findings(repo);
  const lines = [];
  lines.push(`Context health for ${path.basename(repo)}: ${f.ctx.contextFiles.length} context files, ${f.ctx.anchors.length} anchored facts, AGENTS.md ${f.agentsLines} lines (budget ${MAX_AGENTS_LINES}).`);
  if (f.broken.length) lines.push(`Broken anchors (context lines pointing at missing files): ${f.broken.slice(0, 3).map(b => `${b.file}:${b.line} -> ${b.pattern}`).join('; ')}${f.broken.length > 3 ? ' …' : ''}`);
  for (const dir of [path.join(repo, 'openspec', 'changes'), path.join(repo, '..', 'system-context', 'openspec', 'changes')]) {
    try {
      const active = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory() && d.name !== 'archive').map(d => d.name);
      if (active.length) { lines.push(`Active OpenSpec changes: ${active.join(', ')}.`); break; }
    } catch { /* no openspec here */ }
  }
  lines.push('Context files are maintained with the code: an edit to anchored code may need its context line updated in the same change.');
  if (fmt === 'copilot') emit({ additionalContext: lines.join('\n') });
  else emit({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lines.join('\n') } });
}

function postEdit(input) {
  const tool = input.tool_name || input.toolName || '';
  if (tool && !EDIT_TOOL.test(tool)) return;
  const repo = repoRoot(input);
  const ctx = loadContext(repo);
  const notes = [];
  for (const p of editedPaths(input)) {
    const rel = toPosix(path.isAbsolute(p) ? path.relative(repo, p) : p);
    if (rel.startsWith('..')) continue;
    if (ctx.contextFiles.includes(rel)) continue;
    for (const a of ctx.anchors.filter(x => x.re.test(rel))) notes.push(`${rel} is referenced by ${a.file}:${a.line} ("${a.text}").`);
  }
  if (!notes.length) return;
  addContext('PostToolUse', notes.slice(0, 5).join('\n') + '\nIf this edit changed what that line describes, update the line in the same change; if not, no action is needed.');
}

function stop(input) {
  const repo = repoRoot(input);
  const f = findings(repo);
  if (!f.broken.length && !f.stale.length) return;

  // Block at most once per identical set of findings, so the agent can never loop.
  const key = (input.session_id || input.sessionId || 'nosession') + ':' +
    [...f.broken.map(b => b.file + b.line), ...f.stale.map(s => s.file + s.line)].join('|');
  const marker = path.join(os.tmpdir(), 'context-hooks-' + Buffer.from(key).toString('base64url').slice(0, 80));
  if (input.stop_hook_active || fs.existsSync(marker)) return;
  try { fs.writeFileSync(marker, String(Date.now())); } catch { /* ignore */ }

  const items = [
    ...f.broken.map(b => `- BROKEN ${b.file}:${b.line} anchors ${b.pattern}, which no longer exists.`),
    ...f.stale.map(s => `- CHECK ${s.file}:${s.line} is anchored to ${s.hit}, which changed in this session; the context file did not.`),
  ].slice(0, 10);
  const reason = 'Context check before finishing:\n' + items.join('\n') +
    '\nFix broken anchors. For CHECK items, update the line only if its meaning changed, then finish. This check runs once.';
  emit({ decision: 'block', reason });
}

function guard(input) {
  const repo = repoRoot(input);
  const tool = input.tool_name || input.toolName || '';
  if (tool && !EDIT_TOOL.test(tool)) return;
  const ctxRes = CONTEXT_GLOBS.concat(['.github/skills/**', '.claude/skills/**', 'openspec/**', 'CHANGELOG.md']).map(globToRegex);
  const bad = editedPaths(input)
    .map(p => toPosix(path.isAbsolute(p) ? path.relative(repo, p) : p))
    .filter(rel => !ctxRes.some(r => r.test(rel)));
  if (!bad.length) return;
  const reasonText = `context-steward may only edit context files; refused: ${bad.join(', ')}`;
  if (fmt === 'copilot') emit({ permissionDecision: 'deny', permissionDecisionReason: reasonText });
  else emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reasonText } });
}

// ---------- main ----------
try {
  const input = readStdin();
  if (fmt === 'auto') fmt = ('hook_event_name' in input || 'tool_input' in input) ? 'claude' : 'copilot';
  ({ 'session-start': sessionStart, 'post-edit': postEdit, stop, guard }[sub] || (() => {
    process.stderr.write('usage: context-hooks.cjs session-start|post-edit|stop|guard --format claude|copilot\n');
  }))(input);
} catch (e) {
  if (process.env.CONTEXT_HOOKS_DEBUG) process.stderr.write(String(e && e.stack || e) + '\n');
}
process.exit(0);
