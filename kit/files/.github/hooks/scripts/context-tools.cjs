#!/usr/bin/env node
/*
 * context-tools.cjs — keeps AI-agent context honest. One file, Node 18+, no dependencies.
 * Works on Windows, macOS and Linux. Works with GitHub Copilot and Claude Code.
 *
 * Commands you run yourself (or in CI / git hooks):
 *   check   [--base <git-ref>] [--staged] [--strict]
 *           Broken anchors (error), stale context and size budget (warnings). Exit 1 on errors, or on
 *           warnings with --strict. --staged checks what is about to be committed (used by pre-commit).
 *   status                                  Short summary: context files, anchors, always-on size.
 *
 * Agent hooks (read the event JSON on stdin, print one JSON object, never fail the agent):
 *   session-start   Adds a short "context health" note when a chat session starts.
 *   post-edit       After the agent edits a file, names any context line anchored to that file.
 *   stop            When the agent tries to finish: if files IT edited this session broke an anchor or touch
 *                   anchored code whose context line it did not revisit, blocks ONCE with the list.
 *   guard           Refuses edits outside context files (used only for the context-steward agent).
 *
 * Options: --repo <dir> (default: git root of the current folder), --format copilot|claude (default: auto).
 * Anchors: write [anchor: <path>] at the end of any context line that depends on code. <path> can be a
 *   file, a folder (src/main/resources/db/migration/), a glob (with * or **) or several of
 *   these separated by commas. Backticks, #L12 / :12 line suffixes and Windows backslashes are fine.
 *   Paths outside the repo (../product-context/...) are not checked.
 * Budgets (env vars): CONTEXT_MAX_AGENTS_LINES (default 150), CONTEXT_ALWAYS_ON_TOKENS (default 2000).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const argv = process.argv.slice(2);
const command = argv[0];
const opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const flag = name => argv.includes(name);
let format = opt('--format') || 'auto';

const MAX_AGENTS_LINES = Number(process.env.CONTEXT_MAX_AGENTS_LINES || 150);
const ALWAYS_ON_TOKENS = Number(process.env.CONTEXT_ALWAYS_ON_TOKENS || 2000);

// Files that count as "context". Anything else is code or docs for humans.
const CONTEXT_GLOBS = [
  'AGENTS.md', '**/AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md',
  '.github/instructions/**/*.md', '.claude/rules/**/*.md', 'docs/context/**/*.md',
  'context/**/*.md',
];
// What the context-steward agent may edit.
const STEWARD_GLOBS = CONTEXT_GLOBS.concat([
  '.github/skills/**', '.claude/skills/**', '.github/agents/**', '.claude/agents/**',
  'openspec/**', 'CHANGELOG.md', 'docs/context/**',
]);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'target', 'dist', 'build', 'out', '.angular', 'coverage', '.gradle', '.idea', '.vscode']);

// ---------------------------------------------------------------- helpers
const toPosix = p => p.split(path.sep).join('/').replace(/\\/g, '/');
const escapeRe = s => s.replace(/[.+^$()|[\]\\]/g, '\\$&');
function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { i++; if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*'; }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      if (end < 0) { re += '\\{'; continue; }
      re += '(?:' + glob.slice(i + 1, end).split(',').map(escapeRe).join('|') + ')';
      i = end;
    } else re += escapeRe(c);
  }
  return new RegExp('^' + re + '$');
}
const CONTEXT_RES = CONTEXT_GLOBS.map(globToRegex);
const STEWARD_RES = STEWARD_GLOBS.map(globToRegex);
const isContextFile = rel => CONTEXT_RES.some(r => r.test(rel));

function git(repo, args) {
  try {
    return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 });
  } catch { return null; }
}

function resolveRepo(input) {
  const start = opt('--repo') || (input && input.cwd) || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const top = git(start, ['rev-parse', '--show-toplevel']);
  return top ? path.resolve(top.trim()) : path.resolve(start);
}

function walk(dir, root, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), root, out); }
    else out.push(toPosix(path.relative(root, path.join(dir, e.name))));
  }
  return out;
}

const STAGED = flag('--staged');
// All files that exist now (tracked + untracked, minus deleted), repo-relative, forward slashes.
// With --staged: the files in the commit being made (the index), not the working tree.
function listFiles(repo) {
  if (STAGED) { const idx = git(repo, ['ls-files', '-z', '--cached']); if (idx !== null) return idx.split('\0').filter(Boolean); }
  const listed = git(repo, ['ls-files', '-z', '-co', '--exclude-standard']);
  if (listed === null) return walk(repo, repo, []);
  const deleted = new Set((git(repo, ['ls-files', '-z', '-d']) || '').split('\0').filter(Boolean));
  return [...new Set(listed.split('\0').filter(Boolean))].filter(f => !deleted.has(f));
}

// Files changed in the working tree (and since --base, if given).
function changedFiles(repo, base) {
  const out = new Set();
  if (STAGED) {
    (git(repo, ['diff', '--cached', '--name-only', '-z']) || '').split('\0').filter(Boolean).forEach(f => out.add(toPosix(f)));
    return [...out];
  }
  const status = git(repo, ['status', '--porcelain=v1', '-z', '-uall']);
  if (status) {
    const parts = status.split('\0');
    for (let i = 0; i < parts.length; i++) {
      const entry = parts[i];
      if (!entry) continue;
      const code = entry.slice(0, 2);
      out.add(entry.slice(3));
      if (code[0] === 'R' || code[0] === 'C') out.add(parts[++i]); // old name follows a rename
    }
  }
  if (base) {
    const diff = git(repo, ['diff', '--name-only', '-z', base + '...HEAD']);
    if (diff) diff.split('\0').filter(Boolean).forEach(f => out.add(f));
  }
  return [...out].map(toPosix);
}

function readText(repo, rel) {
  if (STAGED) { const t = git(repo, ['show', ':' + rel]); if (t !== null) return t; }
  return fs.readFileSync(path.join(repo, rel), 'utf8');
}

// One anchor can hold several paths. Accepts files, folders (trailing / or an existing folder), globs,
// backticks or quotes, #L12 or :12 suffixes and backslashes. Returns [{ pattern, re }] to check.
function anchorPatterns(repo, raw) {
  const out = [];
  for (let p of raw.split(',')) {
    p = p.trim().replace(/^[`'"]+|[`'"]+$/g, '').replace(/\\/g, '/').replace(/#.*$/, '').replace(/:\d+(-\d+)?$/, '').replace(/^\.\//, '').trim();
    if (!p || /[<>]/.test(p)) continue;                 // empty or a template placeholder such as <path>
    if (p.startsWith('../') || path.isAbsolute(p)) continue; // outside this repo (e.g. the product hub): not checked
    let glob = p;
    if (p.endsWith('/')) glob = p + '**';
    else if (!/[*?{]/.test(p)) { try { if (fs.statSync(path.join(repo, p)).isDirectory()) glob = p + '/**'; } catch { /* file or missing */ } }
    out.push({ pattern: p, re: globToRegex(glob) });
  }
  return out;
}

function readContext(repo, files) {
  const contextFiles = files.filter(isContextFile);
  const anchors = [];
  for (const cf of contextFiles) {
    let text = '';
    try { text = readText(repo, cf); } catch { continue; }
    text.split(/\r?\n/).forEach((line, idx) => {
      for (const m of line.matchAll(/\[anchor:\s*([^\]]+)\]/g)) {
        for (const { pattern, re } of anchorPatterns(repo, m[1])) {
          anchors.push({ file: cf, line: idx + 1, text: line.trim().slice(0, 140), pattern, re });
        }
      }
    });
  }
  return { contextFiles, anchors };
}

function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return m ? m[1] : '';
}

function alwaysOn(repo, contextFiles) {
  const items = [];
  for (const f of ['AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md']) {
    try { const t = fs.readFileSync(path.join(repo, f), 'utf8'); items.push({ file: f, lines: t.split(/\r?\n/).length, tokens: Math.round(t.length / 4) }); } catch { /* absent */ }
  }
  for (const f of contextFiles.filter(c => c.startsWith('.github/instructions/') || c.startsWith('.claude/rules/'))) {
    let t = ''; try { t = readText(repo, f); } catch { continue; }
    const fm = frontmatter(t);
    const everywhere = f.startsWith('.claude/')
      ? !/^paths:/m.test(fm)                                        // Claude rules without paths: load always
      : /applyTo:\s*['"]?\*\*(\/\*(\.\*)?)?['"]?\s*$/m.test(fm);   // applyTo: '**', '**/*' or '**/*.*'
    if (everywhere) items.push({ file: f, lines: t.split(/\r?\n/).length, tokens: Math.round(t.length / 4) });
  }
  return { items, tokens: items.reduce((s, i) => s + i.tokens, 0) };
}

function analyse(repo, base) {
  const files = listFiles(repo);
  const fileSet = files;
  const ctx = readContext(repo, files);
  const changed = changedFiles(repo, base);
  const broken = ctx.anchors.filter(a => !fileSet.some(f => a.re.test(f)));
  const stale = [];
  for (const a of ctx.anchors) {
    if (changed.includes(a.file)) continue;
    const hit = changed.find(c => a.re.test(c));
    if (hit) stale.push({ ...a, hit });
  }
  const agents = alwaysOn(repo, ctx.contextFiles);
  const agentsMd = agents.items.find(i => i.file === 'AGENTS.md');
  return { files, ctx, changed, broken, stale, agents, agentsMd };
}

// ---------------------------------------------------------------- CLI commands
function cmdCheck() {
  const repo = resolveRepo({});
  const base = opt('--base');
  if (base && git(repo, ['rev-parse', '--verify', '--quiet', base + '^{commit}']) === null) {
    console.log(`Context check: --base "${base}" is not a branch or commit here. Try "git fetch", or use origin/main, origin/master or origin/develop.`);
    process.exitCode = 2;
    return;
  }
  const a = analyse(repo, base);
  const errors = [], warnings = [];
  for (const b of a.broken) errors.push(`${b.file}:${b.line}  anchor points at a file that does not exist: ${b.pattern}`);
  for (const s of a.stale) warnings.push(`${s.file}:${s.line}  anchored code changed (${s.hit}) but this context file did not — is the line still true?`);
  if (!a.agentsMd) warnings.push('No AGENTS.md at the repo root. Run the context-bootstrap skill to create one.');
  else if (a.agentsMd.lines > MAX_AGENTS_LINES) warnings.push(`AGENTS.md has ${a.agentsMd.lines} lines (budget ${MAX_AGENTS_LINES}). Move detail into docs/context/ or a skill.`);
  if (a.agents.tokens > ALWAYS_ON_TOKENS) warnings.push(`Always-on context is about ${a.agents.tokens} tokens (budget ${ALWAYS_ON_TOKENS}): ${a.agents.items.map(i => i.file).join(', ')}.`);

  console.log(`Context check: ${path.basename(repo)}${base ? ` (changes since ${base})` : ''}${STAGED ? ' (staged for commit)' : ''}`);
  console.log(`  ${a.ctx.contextFiles.length} context files, ${a.ctx.anchors.length} anchors, always-on ≈ ${a.agents.tokens} tokens`);
  errors.forEach(e => console.log('  ERROR  ' + e));
  warnings.forEach(w => console.log('  WARN   ' + w));
  console.log(`  Result: ${errors.length} error(s), ${warnings.length} warning(s)`);
  if (errors.length || (flag('--strict') && warnings.length)) process.exitCode = 1;
}

function cmdStatus() {
  const repo = resolveRepo({});
  const a = analyse(repo);
  console.log(`Context status: ${path.basename(repo)}`);
  console.log(`  Context files (${a.ctx.contextFiles.length}): ${a.ctx.contextFiles.join(', ') || 'none'}`);
  console.log(`  Anchored facts: ${a.ctx.anchors.length} (${a.broken.length} broken)`);
  console.log(`  Always-on: ≈ ${a.agents.tokens} tokens of ${ALWAYS_ON_TOKENS} budget`);
  a.agents.items.forEach(i => console.log(`    ${i.file}: ${i.lines} lines, ≈ ${i.tokens} tokens`));
  const active = activeChanges(repo);
  console.log(`  Active OpenSpec changes: ${active.length ? active.join(', ') : 'none'}`);
  const g = graphState(repo);
  console.log(`  Code map (Graphify): ${!g ? 'not built' : g.stale ? `stale (built ${g.built}, HEAD ${g.head}) — run: graphify update .` : `up to date${g.built ? ` (${g.built})` : ''}`}`);
}

function activeChanges(repo) {
  try {
    return fs.readdirSync(path.join(repo, 'openspec', 'changes'), { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== 'archive').map(d => d.name);
  } catch { return []; }
}


// Graphify code map: present? built from which commit? (read from its report, no Graphify needed)
function graphState(repo) {
  const graph = path.join(repo, 'graphify-out', 'graph.json');
  if (!fs.existsSync(graph)) return null;
  let built = null;
  try { const m = /Built from commit:\s*`([0-9a-f]+)`/.exec(fs.readFileSync(path.join(repo, 'graphify-out', 'GRAPH_REPORT.md'), 'utf8')); if (m) built = m[1]; } catch { /* no report */ }
  const head = (git(repo, ['rev-parse', 'HEAD']) || '').trim();
  const stale = built && head && !head.startsWith(built);
  return { built, head: head.slice(0, 8), stale };
}
function graphLine(repo) {
  const g = graphState(repo);
  if (!g) return null;
  return g.stale
    ? `Code map (Graphify) is older than HEAD (built ${g.built}, now ${g.head}): run "graphify update ." before relying on it.`
    : 'Code map (Graphify) available: use the graphify MCP tools (query_graph, get_neighbors, shortest_path) or "graphify query/affected/path" before reading many files.';
}

// ---------------------------------------------------------------- hooks
function readStdin() {
  try { const raw = fs.readFileSync(0, 'utf8'); return raw.trim() ? JSON.parse(raw) : {}; } catch { return {}; }
}
const emit = obj => process.stdout.write(JSON.stringify(obj));
function addContext(event, text) {
  if (format === 'copilot') emit({ additionalContext: text });
  else emit({ hookSpecificOutput: { hookEventName: event, additionalContext: text } });
}

// Collect every file path mentioned in a tool call, whatever the tool calls the field.
function editedPaths(input) {
  const found = [];
  const visit = (v, depth) => {
    if (depth > 6 || v == null) return;
    if (typeof v === 'string') {
      // apply_patch style payloads
      for (const m of v.matchAll(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm)) found.push(m[1].trim());
      return;
    }
    if (Array.isArray(v)) { v.forEach(x => visit(x, depth + 1)); return; }
    if (typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        if (typeof val === 'string' && /^(file_?path|filePath|path|notebook_path|filename|uri)$/i.test(k)) found.push(val.replace(/^file:\/\//, ''));
        else visit(val, depth + 1);
      }
    }
  };
  let args = input.tool_input !== undefined ? input.tool_input : input.toolArgs;
  if (typeof args === 'string') { try { args = JSON.parse(args); } catch { /* keep string */ } }
  visit(args, 0);
  return [...new Set(found)];
}
const looksLikeEdit = name => !name || /edit|write|create|replace|patch|insert|notebook/i.test(name);
function relTo(repo, p) {
  const abs = path.isAbsolute(p) ? p : path.join(repo, p);
  return toPosix(path.relative(repo, abs));
}

function hookSessionStart(input) {
  const repo = resolveRepo(input);
  const a = analyse(repo);
  const lines = [`Context health for ${path.basename(repo)}: ${a.ctx.contextFiles.length} context files, ${a.ctx.anchors.length} anchored facts, always-on ≈ ${a.agents.tokens} tokens.`];
  if (a.broken.length) lines.push(`Broken anchors: ${a.broken.slice(0, 3).map(b => `${b.file}:${b.line} -> ${b.pattern}`).join('; ')}${a.broken.length > 3 ? ' …' : ''}`);
  const active = activeChanges(repo);
  if (active.length) lines.push(`Active OpenSpec changes: ${active.join(', ')}.`);
  const gl = graphLine(repo);
  if (gl) lines.push(gl);
  lines.push('Context files describe this code; when an edit changes what a context line says, the line is updated in the same change.');
  addContext('SessionStart', lines.join('\n'));
}

// The git repository a file belongs to. In a multi-root VS Code window (UI + service side by side)
// an edited file can live in a different repo from the one the chat session started in.
function repoOfFile(abs) {
  let dir = path.dirname(abs);
  while (!fs.existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir); // new file in a new folder
  const top = git(dir, ['rev-parse', '--show-toplevel']);
  return top ? path.resolve(top.trim()) : null;
}

// Files the agent edited in this chat session, remembered between hook calls (in the temp folder,
// never in the repo) so the stop hook judges the agent's own edits, not the developer's.
function sessionFile(input) {
  const id = String(input.session_id || input.sessionId || 'no-session');
  return path.join(os.tmpdir(), 'context-tools-session-' + require('crypto').createHash('sha1').update(id).digest('hex') + '.json');
}
function loadTouched(input) { try { return JSON.parse(fs.readFileSync(sessionFile(input), 'utf8')); } catch { return []; } }
function saveTouched(input, list) { try { fs.writeFileSync(sessionFile(input), JSON.stringify(list)); } catch { /* ignore */ } }

function hookPostEdit(input) {
  if (!looksLikeEdit(input.tool_name || input.toolName)) return;
  const sessionRepo = resolveRepo(input);
  const contexts = new Map(); // repo -> anchors, read once per repo
  const notes = [];
  const touched = loadTouched(input);
  for (const p of editedPaths(input)) {
    const abs = path.isAbsolute(p) ? p : path.join(sessionRepo, p);
    const repo = repoOfFile(abs) || sessionRepo;
    const rel = toPosix(path.relative(repo, abs));
    if (rel.startsWith('..')) continue;
    if (!touched.some(x => x.repo === repo && x.rel === rel)) touched.push({ repo, rel });
    if (isContextFile(rel)) continue;
    if (!contexts.has(repo)) contexts.set(repo, readContext(repo, listFiles(repo)));
    const label = repo === sessionRepo ? rel : `${path.basename(repo)}/${rel}`;
    for (const a of contexts.get(repo).anchors.filter(x => x.re.test(rel))) {
      notes.push(`${label} is referenced by ${repo === sessionRepo ? '' : path.basename(repo) + '/'}${a.file}:${a.line} ("${a.text}").`);
    }
  }
  saveTouched(input, touched.slice(-500));
  if (notes.length) addContext('PostToolUse', notes.slice(0, 5).join('\n') + '\nIf this edit changed what that line describes, update the line in the same change; otherwise no action is needed.');
}

function hookStop(input) {
  if (input.stop_hook_active) return;            // never block twice in a row: the agent cannot loop
  const touched = loadTouched(input);
  if (!touched.length) return;                   // the agent edited nothing: nothing to check
  const items = [];
  const repos = [...new Set(touched.map(x => x.repo))];
  const sessionRepo = resolveRepo(input);
  for (const repo of repos) {
    const mine = new Set(touched.filter(x => x.repo === repo).map(x => x.rel));
    const files = listFiles(repo);
    const ctx = readContext(repo, files);
    const label = f => repo === sessionRepo ? f : `${path.basename(repo)}/${f}`;
    for (const a of ctx.anchors) {
      if (!files.some(f => a.re.test(f))) {
        // broken: report it when the agent touched its context file or (likely) moved/deleted its target
        if (mine.has(a.file) || [...mine].some(r => a.re.test(r))) items.push(`- BROKEN ${label(a.file)}:${a.line} anchors ${a.pattern}, which no longer exists.`);
        continue;
      }
      if (mine.has(a.file)) continue;            // the agent already revisited this context file
      const hit = [...mine].find(r => !isContextFile(r) && a.re.test(r));
      if (hit) items.push(`- CHECK ${label(a.file)}:${a.line} ("${a.text.slice(0, 80)}") is anchored to ${label(hit)}, which you edited.`);
    }
  }
  if (!items.length) return;
  const marker = sessionFile(input) + '.stopped-' + require('crypto').createHash('sha1').update(items.join('|')).digest('hex').slice(0, 12);
  if (fs.existsSync(marker)) return;             // same list already shown in this session
  try { fs.writeFileSync(marker, String(Date.now())); } catch { /* ignore */ }
  emit({ decision: 'block', reason: 'Context check before finishing (files you edited in this session):\n' + items.slice(0, 10).join('\n') +
    '\nFix BROKEN anchors. For CHECK items, update the line only if its meaning changed, otherwise say it is still true. This check runs once.' });
}

function hookGuard(input) {
  if (!looksLikeEdit(input.tool_name || input.toolName)) return;
  const repo = resolveRepo(input);
  const bad = editedPaths(input).map(p => relTo(repo, p)).filter(rel => !STEWARD_RES.some(r => r.test(rel)));
  if (!bad.length) return;
  const reason = `context-steward may only edit context files; refused: ${bad.join(', ')}`;
  if (format === 'copilot') emit({ permissionDecision: 'deny', permissionDecisionReason: reason });
  else emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
}

// ---------------------------------------------------------------- main
const hooks = { 'session-start': hookSessionStart, 'post-edit': hookPostEdit, stop: hookStop, guard: hookGuard };
if (command === 'check') cmdCheck();
else if (command === 'status') cmdStatus();
else if (hooks[command]) {
  try {
    const input = readStdin();
    if (format === 'auto') format = ('hook_event_name' in input || 'tool_input' in input) ? 'claude' : 'copilot';
    hooks[command](input);
  } catch (e) {
    if (process.env.CONTEXT_TOOLS_DEBUG) process.stderr.write(String(e && e.stack || e) + '\n');
  }
  process.exitCode = 0; // a hook must never break the agent
} else {
  console.log('Usage: node context-tools.cjs check [--base <ref>] [--staged] [--strict] | status | session-start | post-edit | stop | guard');
  process.exitCode = command ? 2 : 0;
}
